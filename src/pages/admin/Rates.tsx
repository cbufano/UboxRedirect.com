/**
 * Rates — tarifas e taxas (/admin/rates): CRUD da tabela de tarifas de envio
 * (rate_tables), edição das 5 taxas de serviço fixas (service_fees) e um
 * simulador que roda a MESMA função real da calculadora do cliente
 * (rateService.estimateShippingCost) — nada de fórmula duplicada aqui.
 *
 * O gate de papel é só UI (useRole): controles de escrita aparecem para
 * admin/super_admin; ops vê tudo em modo leitura e pode usar o simulador.
 * Quem barra escrita de verdade é o banco (rate_tables_write_admin /
 * service_fees_write_admin). Exclusão pede confirmação inline na própria
 * linha — nunca window.confirm.
 */
import { useEffect, useMemo, useState, Fragment } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Tags, Calculator, Percent } from 'lucide-react'
import { ratesAdminService, type RateRow, type ServiceFee } from '../../services/ratesAdminService'
import { rateService, type RateEstimate } from '../../services/rateService'
import { useRole } from '../../contexts/RoleContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

type RateEditor = { mode: 'create' } | { mode: 'edit'; row: RateRow }
type RateNotice = 'created' | 'updated' | 'deleted' | null
type SimError = 'noRates' | 'generic' | null

const selectClasses =
  'mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

export default function Rates() {
  const { t } = useTranslation()
  const { roles } = useRole()
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')

  const [rateRows, setRateRows] = useState<RateRow[]>([])
  const [ratesLoading, setRatesLoading] = useState(true)
  const [ratesError, setRatesError] = useState(false)

  const [fees, setFees] = useState<ServiceFee[]>([])
  const [feesLoading, setFeesLoading] = useState(true)
  const [feesError, setFeesError] = useState(false)

  // Editor de tarifa (mesmo painel para criar e editar) + confirmação inline
  // de exclusão presa ao id da linha.
  const [editor, setEditor] = useState<RateEditor | null>(null)
  const [rateSaving, setRateSaving] = useState(false)
  const [rateSaveError, setRateSaveError] = useState(false)
  const [rateNotice, setRateNotice] = useState<RateNotice>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  // Edição inline de uma taxa de serviço (estado local simples, uma por vez).
  const [feeEditingKey, setFeeEditingKey] = useState<string | null>(null)
  const [feeLabel, setFeeLabel] = useState('')
  const [feeAmount, setFeeAmount] = useState('')
  const [feePercent, setFeePercent] = useState('')
  const [feeActive, setFeeActive] = useState(true)
  const [feeLabelError, setFeeLabelError] = useState(false)
  const [feeValueError, setFeeValueError] = useState(false)
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeSaveError, setFeeSaveError] = useState(false)
  const [feeSuccess, setFeeSuccess] = useState(false)

  const [simResult, setSimResult] = useState<RateEstimate | null>(null)
  const [simError, setSimError] = useState<SimError>(null)
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    let active = true
    ratesAdminService
      .getRateRows()
      .then((data) => {
        if (active) setRateRows(data)
      })
      .catch(() => {
        if (active) setRatesError(true)
      })
      .finally(() => {
        if (active) setRatesLoading(false)
      })
    ratesAdminService
      .getServiceFees()
      .then((data) => {
        if (active) setFees(data)
      })
      .catch(() => {
        if (active) setFeesError(true)
      })
      .finally(() => {
        if (active) setFeesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const refreshRates = async () => {
    try {
      setRateRows(await ratesAdminService.getRateRows())
      setRatesError(false)
    } catch {
      setRatesError(true)
    }
  }

  const refreshFees = async () => {
    try {
      setFees(await ratesAdminService.getServiceFees())
      setFeesError(false)
    } catch {
      setFeesError(true)
    }
  }

  // ----- Formulário de tarifa (criar/editar) -----

  const zoneRequiredMessage = t('admin.rates.form.errors.zoneRequired')
  const carrierRequiredMessage = t('admin.rates.form.errors.carrierRequired')
  const etaRequiredMessage = t('admin.rates.form.errors.etaRequired')
  const baseNonNegativeMessage = t('admin.rates.form.errors.baseNonNegative')
  const perKgNonNegativeMessage = t('admin.rates.form.errors.perKgNonNegative')
  const multiplierPositiveMessage = t('admin.rates.form.errors.multiplierPositive')

  const rateSchema = z.object({
    destinationZone: z
      .string()
      .trim()
      .min(1, { message: zoneRequiredMessage })
      .transform((value) => value.toUpperCase()),
    carrier: z.string().trim().min(1, { message: carrierRequiredMessage }),
    etaDays: z.string().trim().min(1, { message: etaRequiredMessage }),
    baseFeeUsd: z.coerce.number().min(0, { message: baseNonNegativeMessage }),
    ratePerKgUsd: z.coerce.number().min(0, { message: perKgNonNegativeMessage }),
    multiplier: z.coerce.number().positive({ message: multiplierPositiveMessage }),
  })

  type RateFormInput = z.input<typeof rateSchema>
  type RateFormOutput = z.output<typeof rateSchema>

  const {
    register: registerRate,
    handleSubmit: handleRateSubmit,
    reset: resetRateForm,
    formState: { errors: rateErrors },
  } = useForm<RateFormInput, unknown, RateFormOutput>({ resolver: zodResolver(rateSchema) })

  const openCreate = () => {
    setEditor({ mode: 'create' })
    setRateSaveError(false)
    setRateNotice(null)
    setDeleteConfirmId(null)
    resetRateForm({
      destinationZone: '',
      carrier: '',
      etaDays: '',
      baseFeeUsd: undefined,
      ratePerKgUsd: undefined,
      multiplier: 1,
    })
  }

  const openEdit = (row: RateRow) => {
    setEditor({ mode: 'edit', row })
    setRateSaveError(false)
    setRateNotice(null)
    setDeleteConfirmId(null)
    resetRateForm({
      destinationZone: row.destinationZone,
      carrier: row.carrier,
      etaDays: row.etaDays,
      baseFeeUsd: row.baseFeeUsd,
      ratePerKgUsd: row.ratePerKgUsd,
      multiplier: row.multiplier,
    })
  }

  const onSaveRate: SubmitHandler<RateFormOutput> = async (values) => {
    if (!editor) return
    setRateSaving(true)
    setRateSaveError(false)
    try {
      if (editor.mode === 'edit') {
        await ratesAdminService.updateRateRow(editor.row.id, values)
        setRateNotice('updated')
      } else {
        await ratesAdminService.createRateRow(values)
        setRateNotice('created')
      }
      setEditor(null)
      await refreshRates()
    } catch {
      setRateSaveError(true)
    } finally {
      setRateSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    setDeleteError(false)
    setRateNotice(null)
    try {
      await ratesAdminService.deleteRateRow(id)
      setDeleteConfirmId(null)
      setRateNotice('deleted')
      await refreshRates()
    } catch {
      setDeleteError(true)
    } finally {
      setDeleting(false)
    }
  }

  // ----- Taxas de serviço -----

  const openFeeEdit = (fee: ServiceFee) => {
    setFeeEditingKey(fee.key)
    setFeeLabel(fee.label)
    setFeeAmount(fee.amountUsd != null ? String(fee.amountUsd) : '')
    setFeePercent(fee.percent != null ? String(fee.percent) : '')
    setFeeActive(fee.active)
    setFeeLabelError(false)
    setFeeValueError(false)
    setFeeSaveError(false)
    setFeeSuccess(false)
  }

  const handleFeeSave = async () => {
    if (!feeEditingKey) return
    const label = feeLabel.trim()
    const amount = feeAmount.trim() === '' ? null : Number(feeAmount)
    const percent = feePercent.trim() === '' ? null : Number(feePercent)

    const labelInvalid = label.length === 0
    // O CHECK do banco exige pelo menos um dos dois preenchido; validamos aqui
    // também para dar mensagem amigável em vez do erro cru do Postgres.
    const valueInvalid =
      (amount === null && percent === null) ||
      (amount !== null && !(amount >= 0)) ||
      (percent !== null && !(percent >= 0))
    setFeeLabelError(labelInvalid)
    setFeeValueError(valueInvalid)
    if (labelInvalid || valueInvalid) return

    setFeeSaving(true)
    setFeeSaveError(false)
    try {
      await ratesAdminService.updateServiceFee(feeEditingKey, {
        label,
        amountUsd: amount,
        percent,
        active: feeActive,
      })
      setFeeEditingKey(null)
      setFeeSuccess(true)
      await refreshFees()
    } catch {
      setFeeSaveError(true)
    } finally {
      setFeeSaving(false)
    }
  }

  // ----- Simulador -----

  const weightPositiveMessage = t('admin.rates.simulator.errors.weightPositive')
  const dimensionPositiveMessage = t('admin.rates.simulator.errors.dimensionPositive')

  const simSchema = z.object({
    weightKg: z.coerce.number().positive({ message: weightPositiveMessage }),
    lengthCm: z.coerce.number().positive({ message: dimensionPositiveMessage }),
    widthCm: z.coerce.number().positive({ message: dimensionPositiveMessage }),
    heightCm: z.coerce.number().positive({ message: dimensionPositiveMessage }),
    destinationZone: z.string().min(1),
  })

  type SimFormInput = z.input<typeof simSchema>
  type SimFormOutput = z.output<typeof simSchema>

  const {
    register: registerSim,
    handleSubmit: handleSimSubmit,
    formState: { errors: simErrors },
  } = useForm<SimFormInput, unknown, SimFormOutput>({
    resolver: zodResolver(simSchema),
    defaultValues: { weightKg: undefined, lengthCm: 40, widthCm: 40, heightCm: 40, destinationZone: 'DEFAULT' },
  })

  // Zonas distintas já cadastradas + DEFAULT (sempre disponível como fallback
  // da fórmula) — mesmo se a lista de tarifas falhar, o simulador continua
  // utilizável com DEFAULT.
  const zones = useMemo(() => {
    const set = new Set(rateRows.map((row) => row.destinationZone))
    set.add('DEFAULT')
    return [...set].sort()
  }, [rateRows])

  const onSimulate: SubmitHandler<SimFormOutput> = async (values) => {
    setSimulating(true)
    setSimError(null)
    setSimResult(null)
    try {
      // A MESMA função da calculadora do cliente — o resultado aqui é
      // exatamente o que o cliente veria com as tarifas atuais.
      const estimate = await rateService.estimateShippingCost({
        destinationCountry: values.destinationZone,
        weightKg: values.weightKg,
        lengthCm: values.lengthCm,
        widthCm: values.widthCm,
        heightCm: values.heightCm,
      })
      setSimResult(estimate)
    } catch (error) {
      setSimError(
        error instanceof Error && error.message.startsWith('No shipping rates available') ? 'noRates' : 'generic',
      )
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.rates.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.rates.subtitle')}</p>

      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <Tags className="h-5 w-5 text-brand" aria-hidden="true" />
            {t('admin.rates.table.title')}
          </h2>
          {isAdmin && (
            <Button type="button" size="sm" onClick={openCreate}>
              {t('admin.rates.table.add')}
            </Button>
          )}
        </div>

        {rateNotice && (
          <p role="status" className="px-4 pt-3 text-sm font-medium text-success">
            {t(`admin.rates.table.${rateNotice}`)}
          </p>
        )}

        {editor && (
          <form onSubmit={handleRateSubmit(onSaveRate)} noValidate className="mx-4 mt-4 rounded-lg border border-slate/10 p-4">
            <h3 className="text-sm font-semibold text-navy">
              {editor.mode === 'edit' ? t('admin.rates.form.editTitle') : t('admin.rates.form.createTitle')}
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label={t('admin.rates.form.zoneLabel')}
                id="rateZone"
                placeholder={t('admin.rates.form.zonePlaceholder')}
                error={rateErrors.destinationZone?.message}
                {...registerRate('destinationZone')}
              />
              <Input
                label={t('admin.rates.form.carrierLabel')}
                id="rateCarrier"
                error={rateErrors.carrier?.message}
                {...registerRate('carrier')}
              />
              <Input
                label={t('admin.rates.form.etaLabel')}
                id="rateEta"
                placeholder={t('admin.rates.form.etaPlaceholder')}
                error={rateErrors.etaDays?.message}
                {...registerRate('etaDays')}
              />
              <Input
                label={t('admin.rates.form.baseLabel')}
                id="rateBase"
                type="number"
                step="0.01"
                min={0}
                error={rateErrors.baseFeeUsd?.message}
                {...registerRate('baseFeeUsd')}
              />
              <Input
                label={t('admin.rates.form.perKgLabel')}
                id="ratePerKg"
                type="number"
                step="0.01"
                min={0}
                error={rateErrors.ratePerKgUsd?.message}
                {...registerRate('ratePerKgUsd')}
              />
              <Input
                label={t('admin.rates.form.multiplierLabel')}
                id="rateMultiplier"
                type="number"
                step="0.1"
                min={0}
                error={rateErrors.multiplier?.message}
                {...registerRate('multiplier')}
              />
            </div>
            {rateSaveError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {t('admin.rates.form.error')}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm" disabled={rateSaving}>
                {rateSaving
                  ? t('admin.rates.form.submitting')
                  : editor.mode === 'edit'
                    ? t('admin.rates.form.submitEdit')
                    : t('admin.rates.form.submitCreate')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditor(null)}>
                {t('admin.rates.form.cancel')}
              </Button>
            </div>
          </form>
        )}

        {ratesLoading ? (
          <p className="px-4 py-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : ratesError ? (
          <p role="alert" className="mx-4 my-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.rates.table.loadError')}
          </p>
        ) : rateRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate/60">{t('admin.rates.table.empty')}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.zone')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.carrier')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.eta')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.base')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.perKg')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.table.multiplier')}
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">{t('admin.rates.table.actions')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {rateRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="px-4 py-3 font-medium text-navy">{row.destinationZone}</td>
                      <td className="px-4 py-3 text-slate">{row.carrier}</td>
                      <td className="px-4 py-3 text-slate">{row.etaDays}</td>
                      <td className="px-4 py-3 text-slate">${row.baseFeeUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate">${row.ratePerKgUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate">×{row.multiplier}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
                              {t('admin.rates.table.edit')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteConfirmId(row.id)
                                setDeleteError(false)
                                setRateNotice(null)
                              }}
                            >
                              {t('admin.rates.table.delete')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isAdmin && deleteConfirmId === row.id && (
                      <tr>
                        <td colSpan={7} className="bg-offwhite px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm font-medium text-navy">
                              {t('admin.rates.table.confirmDelete', {
                                zone: row.destinationZone,
                                carrier: row.carrier,
                              })}
                            </p>
                            <Button type="button" size="sm" disabled={deleting} onClick={() => handleDelete(row.id)}>
                              {deleting ? t('admin.rates.table.deleting') : t('admin.rates.table.confirmYes')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              {t('admin.rates.table.confirmNo')}
                            </Button>
                          </div>
                          {deleteError && (
                            <p role="alert" className="mt-2 text-sm text-red-600">
                              {t('admin.rates.table.deleteError')}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-0">
        <div className="px-4 pt-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <Percent className="h-5 w-5 text-brand" aria-hidden="true" />
            {t('admin.rates.fees.title')}
          </h2>
          {/* As 5 chaves são fixas do seed — sem criar/excluir taxa aqui. */}
          <p className="mt-1 text-sm text-slate/70">{t('admin.rates.fees.hint')}</p>
          {feeSuccess && (
            <p role="status" className="mt-2 text-sm font-medium text-success">
              {t('admin.rates.fees.success')}
            </p>
          )}
        </div>

        {feesLoading ? (
          <p className="px-4 py-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : feesError ? (
          <p role="alert" className="mx-4 my-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.rates.fees.loadError')}
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.fees.table.fee')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.fees.table.amount')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.fees.table.percent')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.rates.fees.table.status')}
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">{t('admin.rates.fees.table.actions')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {fees.map((fee) => (
                  <Fragment key={fee.key}>
                    <tr>
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy">{fee.label}</p>
                        <p className="font-mono text-xs text-slate/50">{fee.key}</p>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {fee.amountUsd != null ? `$${fee.amountUsd.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate">{fee.percent != null ? `${fee.percent}%` : '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                            fee.active ? 'bg-success/10 text-success' : 'bg-slate/10 text-slate'
                          }`}
                        >
                          {fee.active ? t('admin.rates.fees.active') : t('admin.rates.fees.inactive')}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button type="button" variant="ghost" size="sm" onClick={() => openFeeEdit(fee)}>
                            {t('admin.rates.fees.edit')}
                          </Button>
                        </td>
                      )}
                    </tr>
                    {isAdmin && feeEditingKey === fee.key && (
                      <tr>
                        <td colSpan={5} className="bg-offwhite px-4 py-4">
                          <div className="grid gap-4 sm:grid-cols-3">
                            <Input
                              label={t('admin.rates.fees.labelLabel')}
                              id="feeLabel"
                              value={feeLabel}
                              onChange={(event) => setFeeLabel(event.target.value)}
                              error={feeLabelError ? t('admin.rates.fees.errors.labelRequired') : undefined}
                            />
                            <Input
                              label={t('admin.rates.fees.amountLabel')}
                              id="feeAmountUsd"
                              type="number"
                              step="0.01"
                              min={0}
                              value={feeAmount}
                              onChange={(event) => setFeeAmount(event.target.value)}
                            />
                            <Input
                              label={t('admin.rates.fees.percentLabel')}
                              id="feePercent"
                              type="number"
                              step="0.01"
                              min={0}
                              value={feePercent}
                              onChange={(event) => setFeePercent(event.target.value)}
                            />
                          </div>
                          <label className="mt-3 flex items-center gap-2 text-sm text-navy">
                            <input
                              type="checkbox"
                              checked={feeActive}
                              onChange={(event) => setFeeActive(event.target.checked)}
                              className="h-4 w-4 rounded border-slate/30"
                            />
                            {t('admin.rates.fees.activeLabel')}
                          </label>
                          {feeValueError && (
                            <p role="alert" className="mt-2 text-sm text-red-600">
                              {t('admin.rates.fees.errors.valueRequired')}
                            </p>
                          )}
                          {feeSaveError && (
                            <p role="alert" className="mt-2 text-sm text-red-600">
                              {t('admin.rates.fees.error')}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button type="button" size="sm" disabled={feeSaving} onClick={handleFeeSave}>
                              {feeSaving ? t('admin.rates.fees.saving') : t('admin.rates.fees.save')}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setFeeEditingKey(null)}>
                              {t('admin.rates.fees.cancel')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
          <Calculator className="h-5 w-5 text-brand" aria-hidden="true" />
          {t('admin.rates.simulator.title')}
        </h2>
        <p className="mt-1 text-sm text-slate/70">{t('admin.rates.simulator.hint')}</p>

        <form onSubmit={handleSimSubmit(onSimulate)} noValidate className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              label={t('admin.rates.simulator.weightLabel')}
              id="simWeight"
              type="number"
              step="0.01"
              min={0}
              error={simErrors.weightKg?.message}
              {...registerSim('weightKg')}
            />
            <Input
              label={t('admin.rates.simulator.lengthLabel')}
              id="simLength"
              type="number"
              step="1"
              min={0}
              error={simErrors.lengthCm?.message}
              {...registerSim('lengthCm')}
            />
            <Input
              label={t('admin.rates.simulator.widthLabel')}
              id="simWidth"
              type="number"
              step="1"
              min={0}
              error={simErrors.widthCm?.message}
              {...registerSim('widthCm')}
            />
            <Input
              label={t('admin.rates.simulator.heightLabel')}
              id="simHeight"
              type="number"
              step="1"
              min={0}
              error={simErrors.heightCm?.message}
              {...registerSim('heightCm')}
            />
            <label htmlFor="simZone" className="block text-navy">
              {t('admin.rates.simulator.zoneLabel')}
              <select id="simZone" className={selectClasses} {...registerSim('destinationZone')}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <Button type="submit" disabled={simulating}>
              {simulating ? t('admin.rates.simulator.simulating') : t('admin.rates.simulator.submit')}
            </Button>
          </div>
        </form>

        {simError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {simError === 'noRates' ? t('admin.rates.simulator.noRates') : t('admin.rates.simulator.error')}
          </p>
        )}

        {simResult && (
          <div className="mt-6 border-t border-slate/10 pt-4">
            <h3 className="text-sm font-semibold text-navy">{t('admin.rates.simulator.resultTitle')}</h3>
            <p className="mt-2 text-sm text-slate">
              {t('admin.rates.simulator.chargeable', { weight: simResult.chargeableWeightKg })}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                    <th scope="col" className="py-2 pr-4">
                      {t('admin.rates.simulator.carrier')}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t('admin.rates.simulator.eta')}
                    </th>
                    <th scope="col" className="py-2">
                      {t('admin.rates.simulator.cost')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate/10">
                  {simResult.options.map((option) => (
                    <tr key={option.carrier}>
                      <td className="py-2 pr-4 text-slate">{option.carrier}</td>
                      <td className="py-2 pr-4 text-slate">{option.etaDays}</td>
                      <td className="py-2 font-medium text-navy">${option.costUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
