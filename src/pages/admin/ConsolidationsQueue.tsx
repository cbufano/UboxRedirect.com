import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Truck } from 'lucide-react'
import { adminService, type PendingConsolidation } from '../../services/adminService'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

function ShipRow({
  consolidation,
  onShipped,
}: {
  consolidation: PendingConsolidation
  onShipped: (id: string) => void
}) {
  const { t } = useTranslation()
  const [carrier, setCarrier] = useState(consolidation.carrier ?? '')
  const [trackingCode, setTrackingCode] = useState(consolidation.trackingCode ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  const canSubmit = carrier.trim().length > 0 && trackingCode.trim().length > 0 && !submitting

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setError(false)
    setSubmitting(true)
    try {
      await adminService.markConsolidationShipped(consolidation.id, {
        carrier: carrier.trim(),
        trackingCode: trackingCode.trim(),
      })
      onShipped(consolidation.id)
    } catch {
      setError(true)
      setSubmitting(false)
    }
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-navy">{consolidation.customerName}</td>
      <td className="px-4 py-3 text-slate">
        {consolidation.city}, {consolidation.country}
      </td>
      <td className="px-4 py-3 text-slate">${consolidation.declaredValueUsd.toFixed(2)}</td>
      <td className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={t('admin.consolidations.table.carrierLabel')}
            placeholder={t('admin.consolidations.table.carrierPlaceholder')}
            value={carrier}
            onChange={(event) => setCarrier(event.target.value)}
            className="w-28 rounded-lg border border-slate/20 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <input
            aria-label={t('admin.consolidations.table.trackingLabel')}
            placeholder={t('admin.consolidations.table.trackingPlaceholder')}
            value={trackingCode}
            onChange={(event) => setTrackingCode(event.target.value)}
            className="w-32 rounded-lg border border-slate/20 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {t('admin.consolidations.markShipped')}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {t('admin.consolidations.shipError')}
          </p>
        )}
      </td>
    </tr>
  )
}

export default function ConsolidationsQueue() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<PendingConsolidation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .getPendingConsolidations()
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
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                <th scope="col" className="px-4 py-3">
                  {t('admin.consolidations.table.customer')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.consolidations.table.destination')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.consolidations.table.declaredValue')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.consolidations.table.shipping')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {queue.map((consolidation) => (
                <ShipRow key={consolidation.id} consolidation={consolidation} onShipped={handleShipped} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
