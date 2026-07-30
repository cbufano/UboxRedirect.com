import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MapPin, ScanLine, Truck } from 'lucide-react'
import { adminService, type PaidConsolidation, type PaidConsolidationItem } from '../../services/adminService'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

/**
 * O scanner (Zebra/celular) "digita" a URL da etiqueta
 * (`https://.../admin/packages/<uuid>`) e envia Enter; o operador também pode
 * colar/digitar só o uuid. Extraímos o ÚLTIMO uuid da string — na URL ele é o
 * segmento final, e num uuid avulso é o próprio texto.
 */
const UUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g

function extractPackageId(raw: string): string | null {
  const matches = raw.match(UUID_PATTERN)
  return matches && matches.length > 0 ? matches[matches.length - 1].toLowerCase() : null
}

/**
 * Lista de coleta na ordem em que o operador anda pelo galpão: código da
 * posição crescente; pacotes sem posição vão para o fim (precisam de busca
 * manual, não fazem parte da rota).
 */
function sortByLocation(items: PaidConsolidationItem[]): PaidConsolidationItem[] {
  return [...items].sort((a, b) => {
    if (a.locationCode == null && b.locationCode == null) return 0
    if (a.locationCode == null) return 1
    if (b.locationCode == null) return -1
    return a.locationCode.localeCompare(b.locationCode)
  })
}

type ScanFeedback = { kind: 'matched'; store: string } | { kind: 'invalid' } | { kind: 'notFound' } | null

function PackCard({
  consolidation,
  onShipped,
}: {
  consolidation: PaidConsolidation
  onShipped: (id: string) => void
}) {
  const { t } = useTranslation()
  const items = useMemo(() => sortByLocation(consolidation.items), [consolidation.items])

  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set())
  const [scanValue, setScanValue] = useState('')
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null)
  const [shipUnchecked, setShipUnchecked] = useState(false)
  const [carrier, setCarrier] = useState(consolidation.carrier ?? '')
  const [trackingCode, setTrackingCode] = useState(consolidation.trackingCode ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [shipError, setShipError] = useState(false)

  const allChecked = items.every((item) => checkedIds.has(item.packageId))
  const canShip =
    (allChecked || shipUnchecked) && carrier.trim().length > 0 && trackingCode.trim().length > 0 && !submitting

  const toggleItem = (packageId: string) => {
    setScanFeedback(null)
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(packageId)) {
        next.delete(packageId)
      } else {
        next.add(packageId)
      }
      return next
    })
  }

  const handleScan = (event: FormEvent) => {
    event.preventDefault()
    const raw = scanValue.trim()
    if (!raw) return
    const packageId = extractPackageId(raw)
    if (!packageId) {
      setScanFeedback({ kind: 'invalid' })
      return
    }
    const item = items.find((candidate) => candidate.packageId.toLowerCase() === packageId)
    if (!item) {
      setScanFeedback({ kind: 'notFound' })
      return
    }
    setCheckedIds((prev) => new Set(prev).add(item.packageId))
    setScanFeedback({ kind: 'matched', store: item.store })
    setScanValue('')
  }

  const handleShip = async (event: FormEvent) => {
    event.preventDefault()
    if (!canShip) return
    setShipError(false)
    setSubmitting(true)
    try {
      await adminService.markConsolidationShipped(consolidation.id, {
        carrier: carrier.trim(),
        trackingCode: trackingCode.trim(),
      })
      onShipped(consolidation.id)
    } catch {
      setShipError(true)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-navy">{consolidation.customerName}</h2>
          <p className="text-sm text-slate/70">
            {t('admin.consolidations.destination', {
              city: consolidation.city,
              country: consolidation.country,
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate">
            {t('admin.consolidations.declaredValue', { value: consolidation.declaredValueUsd.toFixed(2) })}
          </p>
          {items.length > 0 && (
            <p className="text-xs font-medium text-slate/60">
              {t('admin.consolidations.progress', { checked: checkedIds.size, total: items.length })}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate/10 p-4">
        <h3 className="text-sm font-semibold text-navy">{t('admin.consolidations.pickList.title')}</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-xs text-slate/60">{t('admin.consolidations.pickList.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate/10">
            {items.map((item) => {
              const checked = checkedIds.has(item.packageId)
              return (
                <li
                  key={item.packageId}
                  className={`flex flex-wrap items-center gap-3 px-2 py-2.5 text-sm ${
                    checked ? 'bg-success/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.packageId)}
                    aria-label={t('admin.consolidations.pickList.checkboxLabel', {
                      store: item.store,
                      description: item.description,
                    })}
                    className="h-4 w-4 accent-brand"
                  />
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-sm font-bold ${
                      item.locationCode ? 'bg-navy/5 text-navy' : 'bg-amber-500/10 text-amber-600'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.locationCode ?? t('admin.consolidations.pickList.noLocation')}
                  </span>
                  <span className="font-medium text-navy">{item.store}</span>
                  <span className="min-w-0 flex-1 text-slate">{item.description}</span>
                  <span className="text-slate/70">{item.weightKg} kg</span>
                  {checked && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {t('admin.consolidations.pickList.checkedBadge')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {items.length > 0 && (
          <form onSubmit={handleScan} className="mt-3 flex flex-wrap items-end gap-2">
            <label htmlFor={`scan-${consolidation.id}`} className="block flex-1 text-sm text-navy">
              <span className="inline-flex items-center gap-1.5">
                <ScanLine className="h-4 w-4 text-brand" aria-hidden="true" />
                {t('admin.consolidations.scan.label')}
              </span>
              <input
                id={`scan-${consolidation.id}`}
                type="text"
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                placeholder={t('admin.consolidations.scan.placeholder')}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              {t('admin.consolidations.scan.submit')}
            </Button>
          </form>
        )}
        {scanFeedback?.kind === 'matched' && (
          <p role="status" className="mt-2 text-xs font-medium text-success">
            {t('admin.consolidations.scan.matched', { store: scanFeedback.store })}
          </p>
        )}
        {scanFeedback?.kind === 'invalid' && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600">
            {t('admin.consolidations.scan.invalid')}
          </p>
        )}
        {scanFeedback?.kind === 'notFound' && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600">
            {t('admin.consolidations.scan.notFound')}
          </p>
        )}
      </div>

      {!allChecked && (
        <div className="mt-3">
          <label className="inline-flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={shipUnchecked}
              onChange={(event) => setShipUnchecked(event.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            {t('admin.consolidations.override.label')}
          </label>
          {shipUnchecked && (
            <p role="alert" className="mt-1 text-xs font-medium text-amber-600">
              {t('admin.consolidations.override.warning')}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleShip} className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate/10 pt-4">
        <input
          aria-label={t('admin.consolidations.form.carrierLabel')}
          placeholder={t('admin.consolidations.form.carrierPlaceholder')}
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          className="w-32 rounded-lg border border-slate/20 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <input
          aria-label={t('admin.consolidations.form.trackingLabel')}
          placeholder={t('admin.consolidations.form.trackingPlaceholder')}
          value={trackingCode}
          onChange={(event) => setTrackingCode(event.target.value)}
          className="w-40 rounded-lg border border-slate/20 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <Button type="submit" size="sm" disabled={!canShip}>
          {t('admin.consolidations.markShipped')}
        </Button>
      </form>
      {shipError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {t('admin.consolidations.shipError')}
        </p>
      )}
    </Card>
  )
}

export default function ConsolidationsQueue() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<PaidConsolidation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .getPaidConsolidations()
      .then((data) => {
        if (active) setQueue(data)
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

  const handleShipped = (id: string) => {
    setQueue((prev) => prev.filter((c) => c.id !== id))
  }

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.consolidations.loadError')}
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.consolidations.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.consolidations.subtitle')}</p>

      {queue.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Truck className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('admin.consolidations.empty')}</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {queue.map((consolidation) => (
            <PackCard key={consolidation.id} consolidation={consolidation} onShipped={handleShipped} />
          ))}
        </div>
      )}
    </div>
  )
}
