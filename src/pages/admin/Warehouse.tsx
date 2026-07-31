/**
 * Warehouse — mapa físico do galpão (/admin/warehouse): gerador de grade em
 * massa (admin/super_admin) + mapa de ocupação agrupado corredor→estante com
 * células coloridas (verde livre / âmbar ocupada / cinza inativa) e
 * ativar/desativar posição. O gate de papel aqui é só UI (useRole) — quem
 * barra de verdade é o banco: generate_warehouse_locations checa admin DENTRO
 * da função e updates passam pela RLS de warehouse_locations.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Grid3x3 } from 'lucide-react'
import { warehouseService, type OccupancySlot } from '../../services/warehouseService'
import { useRole } from '../../contexts/RoleContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface LevelRow {
  level: string
  cells: OccupancySlot[]
}

interface RackGroup {
  rack: string
  levels: LevelRow[]
}

interface AisleGroup {
  key: string
  racks: RackGroup[]
}

/**
 * getOccupancy vem ordenado por code (zona-corredor-estante-nível-posição),
 * então agrupar preservando a ordem de inserção já deixa corredores, estantes
 * e posições em ordem. Só os níveis são invertidos na renderização (prateleira
 * mais alta em cima, como no galpão de verdade).
 */
function groupSlots(slots: OccupancySlot[]): AisleGroup[] {
  const aisles = new Map<string, Map<string, Map<string, OccupancySlot[]>>>()
  for (const slot of slots) {
    const aisleKey = `${slot.zone}-${slot.aisle}`
    const racks = aisles.get(aisleKey) ?? new Map<string, Map<string, OccupancySlot[]>>()
    if (!aisles.has(aisleKey)) aisles.set(aisleKey, racks)
    const levels = racks.get(slot.rack) ?? new Map<string, OccupancySlot[]>()
    if (!racks.has(slot.rack)) racks.set(slot.rack, levels)
    const cells = levels.get(slot.level) ?? []
    if (!levels.has(slot.level)) levels.set(slot.level, cells)
    cells.push(slot)
  }
  return [...aisles.entries()].map(([key, racks]) => ({
    key,
    racks: [...racks.entries()].map(([rack, levels]) => ({
      rack,
      levels: [...levels.entries()].map(([level, cells]) => ({ level, cells })).reverse(),
    })),
  }))
}

const cellBaseClasses =
  'block h-6 w-6 rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1'

export default function Warehouse() {
  const { t } = useTranslation()
  const { roles } = useRole()
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')

  const [slots, setSlots] = useState<OccupancySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [generatedCount, setGeneratedCount] = useState<number | null>(null)

  // Mini painel de ativar/desativar: só abre para célula livre ou inativa
  // (célula ocupada é um Link direto para a ficha do pacote).
  const [selectedSlot, setSelectedSlot] = useState<OccupancySlot | null>(null)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState(false)
  const [toggleSuccess, setToggleSuccess] = useState(false)

  useEffect(() => {
    let active = true
    warehouseService
      .getOccupancy()
      .then((data) => {
        if (active) setSlots(data)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const refresh = async () => {
    try {
      setSlots(await warehouseService.getOccupancy())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  const zoneRequiredMessage = t('admin.warehouse.generator.errors.zoneRequired')
  const aislesRequiredMessage = t('admin.warehouse.generator.errors.aislesRequired')
  const racksRangeMessage = t('admin.warehouse.generator.errors.racksRange')
  const levelsRangeMessage = t('admin.warehouse.generator.errors.levelsRange')
  const binsRangeMessage = t('admin.warehouse.generator.errors.binsRange')

  // Limites espelham a validação da função do banco (racks 1-99, levels 1-9,
  // bins 1-99). Corredores aceitam lista separada por vírgula ("A" ou "A,B"),
  // normalizada para maiúsculas sem espaços.
  const schema = z.object({
    zone: z
      .string()
      .trim()
      .min(1, { message: zoneRequiredMessage })
      .transform((value) => value.toUpperCase()),
    aisles: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((aisle) => aisle.trim().toUpperCase())
          .filter((aisle) => aisle.length > 0),
      )
      .refine((aisles) => aisles.length > 0, { message: aislesRequiredMessage }),
    racks: z.coerce
      .number()
      .int({ message: racksRangeMessage })
      .min(1, { message: racksRangeMessage })
      .max(99, { message: racksRangeMessage }),
    levels: z.coerce
      .number()
      .int({ message: levelsRangeMessage })
      .min(1, { message: levelsRangeMessage })
      .max(9, { message: levelsRangeMessage }),
    bins: z.coerce
      .number()
      .int({ message: binsRangeMessage })
      .min(1, { message: binsRangeMessage })
      .max(99, { message: binsRangeMessage }),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { zone: 'G', aisles: 'A', racks: 10, levels: 4, bins: 10 },
  })

  const onGenerate: SubmitHandler<FormOutput> = async (values) => {
    setGenerating(true)
    setGenerateError(false)
    setGeneratedCount(null)
    try {
      const count = await warehouseService.generateGrid(
        values.zone,
        values.aisles,
        values.racks,
        values.levels,
        values.bins,
      )
      setGeneratedCount(count)
      await refresh()
    } catch {
      // Cobre também o erro do banco quando o papel não é admin — a função
      // generate_warehouse_locations lança e a UI só mostra a mensagem tratada.
      setGenerateError(true)
    } finally {
      setGenerating(false)
    }
  }

  const handleSelectSlot = (slot: OccupancySlot) => {
    setSelectedSlot(slot)
    setToggleError(false)
    setToggleSuccess(false)
  }

  const handleToggleActive = async () => {
    if (!selectedSlot) return
    setToggling(true)
    setToggleError(false)
    setToggleSuccess(false)
    try {
      await warehouseService.setLocationActive(selectedSlot.id, !selectedSlot.active)
      await refresh()
      setSelectedSlot(null)
      setToggleSuccess(true)
    } catch {
      setToggleError(true)
    } finally {
      setToggling(false)
    }
  }

  const aisleGroups = useMemo(() => groupSlots(slots), [slots])

  const renderCell = (slot: OccupancySlot) => {
    if (slot.packageId) {
      const label = t('admin.warehouse.map.cellOccupied', {
        code: slot.code,
        suite: slot.suiteNumber ?? '—',
      })
      return (
        <Link
          key={slot.id}
          to={`/admin/packages/${slot.packageId}`}
          title={label}
          aria-label={label}
          className={`${cellBaseClasses} bg-amber-400 hover:bg-amber-500`}
        />
      )
    }

    const label = slot.active
      ? t('admin.warehouse.map.cellFree', { code: slot.code })
      : t('admin.warehouse.map.cellInactive', { code: slot.code })
    const stateClasses = slot.active ? 'bg-success/70 hover:bg-success' : 'bg-slate/25 hover:bg-slate/40'

    // Só admin ativa/desativa posição — para ops a célula é informativa.
    if (isAdmin) {
      return (
        <button
          key={slot.id}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => handleSelectSlot(slot)}
          className={`${cellBaseClasses} ${stateClasses}`}
        />
      )
    }
    return (
      <span key={slot.id} title={label} className={`${cellBaseClasses} ${stateClasses}`}>
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.warehouse.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.warehouse.subtitle')}</p>

      {isAdmin && (
        <Card className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <Grid3x3 className="h-5 w-5 text-brand" aria-hidden="true" />
            {t('admin.warehouse.generator.title')}
          </h2>
          <p className="mt-1 text-sm text-slate/70">{t('admin.warehouse.generator.hint')}</p>

          <form
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={handleSubmit(onGenerate)}
            noValidate
          >
            <Input
              label={t('admin.warehouse.generator.zoneLabel')}
              error={errors.zone?.message}
              {...register('zone')}
            />
            <Input
              label={t('admin.warehouse.generator.aislesLabel')}
              placeholder={t('admin.warehouse.generator.aislesPlaceholder')}
              error={errors.aisles?.message}
              {...register('aisles')}
            />
            <Input
              label={t('admin.warehouse.generator.racksLabel')}
              type="number"
              min={1}
              max={99}
              error={errors.racks?.message}
              {...register('racks')}
            />
            <Input
              label={t('admin.warehouse.generator.levelsLabel')}
              type="number"
              min={1}
              max={9}
              error={errors.levels?.message}
              {...register('levels')}
            />
            <Input
              label={t('admin.warehouse.generator.binsLabel')}
              type="number"
              min={1}
              max={99}
              error={errors.bins?.message}
              {...register('bins')}
            />
            <div className="sm:col-span-2 lg:col-span-5">
              <Button type="submit" disabled={generating}>
                {generating ? t('admin.warehouse.generator.submitting') : t('admin.warehouse.generator.submit')}
              </Button>
            </div>
          </form>

          {generateError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {t('admin.warehouse.generator.error')}
            </p>
          )}
          {generatedCount !== null && (
            <p role="status" className="mt-3 text-sm font-medium text-success">
              {t('admin.warehouse.generator.success', { total: generatedCount })}
            </p>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-navy">{t('admin.warehouse.map.title')}</h2>

        {loading ? (
          <p className="mt-3 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : loadError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.warehouse.loadError')}
          </p>
        ) : slots.length === 0 ? (
          <p className="mt-3 text-sm text-slate/60">
            {isAdmin ? t('admin.warehouse.map.emptyAdmin') : t('admin.warehouse.map.emptyOps')}
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate/70">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-success/70" aria-hidden="true" />
                {t('admin.warehouse.map.legend.free')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-amber-400" aria-hidden="true" />
                {t('admin.warehouse.map.legend.occupied')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-slate/25" aria-hidden="true" />
                {t('admin.warehouse.map.legend.inactive')}
              </span>
            </div>

            <div className="mt-4 space-y-6">
              {aisleGroups.map((aisle) => (
                <div key={aisle.key}>
                  <h3 className="text-sm font-semibold text-navy">
                    {t('admin.warehouse.map.aisle', { aisle: aisle.key })}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {aisle.racks.map((rack) => (
                      <div key={rack.rack} className="rounded-lg border border-slate/10 p-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                          {t('admin.warehouse.map.rack', { rack: rack.rack })}
                        </p>
                        <div className="mt-1.5 flex flex-col gap-1">
                          {rack.levels.map((row) => (
                            <div key={row.level} className="flex gap-1">
                              {row.cells.map(renderCell)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {selectedSlot && (
          <div className="mt-4 rounded-lg border border-slate/10 p-4">
            <p className="font-mono text-sm font-semibold text-navy">{selectedSlot.code}</p>
            <p className="mt-1 text-xs text-slate/60">
              {selectedSlot.active
                ? t('admin.warehouse.toggle.freeHint')
                : t('admin.warehouse.toggle.inactiveHint')}
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" disabled={toggling} onClick={handleToggleActive}>
                {toggling
                  ? t('admin.warehouse.toggle.working')
                  : selectedSlot.active
                    ? t('admin.warehouse.toggle.deactivate')
                    : t('admin.warehouse.toggle.reactivate')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSlot(null)}>
                {t('admin.warehouse.toggle.close')}
              </Button>
            </div>
            {toggleError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {t('admin.warehouse.toggle.error')}
              </p>
            )}
          </div>
        )}
        {toggleSuccess && (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {t('admin.warehouse.toggle.success')}
          </p>
        )}
      </Card>
    </div>
  )
}
