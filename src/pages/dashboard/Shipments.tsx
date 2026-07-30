import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Truck, CheckCircle2, Clock, PackageCheck, XCircle, X } from 'lucide-react'
import { packageService, type Consolidation } from '../../services/packageService'
import { paymentService } from '../../services/paymentService'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { CopyButton } from '../../components/ui/CopyButton'

const STATUS_CLASSES: Record<Consolidation['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-brand/10 text-brand',
  shipped: 'bg-blue-100 text-blue-700',
  delivered: 'bg-success/10 text-success',
  cancelled: 'bg-red-50 text-red-600',
}

const STATUS_ICONS: Record<Consolidation['status'], typeof Clock> = {
  pending: Clock,
  paid: PackageCheck,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: XCircle,
}

export default function Shipments() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [consolidations, setConsolidations] = useState<Consolidation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const paymentBanner = searchParams.get('payment')

  useEffect(() => {
    let active = true
    packageService
      .getMyConsolidations()
      .then((data) => {
        if (active) setConsolidations(data)
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

  const dismissBanner = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('payment')
    setSearchParams(next, { replace: true })
  }

  const handlePayNow = async (id: string) => {
    setPayError(null)
    setPayingId(id)
    try {
      const { url } = await paymentService.createCheckoutSession(id)
      window.location.href = url
    } catch {
      setPayError(id)
      setPayingId(null)
    }
  }

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('dashboard.shipments.loadError')}
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.shipments.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.shipments.subtitle')}</p>

      {paymentBanner === 'success' && (
        <Card className="mt-6 max-w-xl" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-success">{t('dashboard.shipments.banner.success')}</p>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label={t('dashboard.shipments.banner.dismiss')}
              className="shrink-0 rounded-md p-1 text-slate/50 transition hover:bg-slate/10 hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Card>
      )}

      {paymentBanner === 'cancelled' && (
        <Card className="mt-6 max-w-xl">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate">{t('dashboard.shipments.banner.cancelled')}</p>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label={t('dashboard.shipments.banner.dismiss')}
              className="shrink-0 rounded-md p-1 text-slate/50 transition hover:bg-slate/10 hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Card>
      )}

      {consolidations.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Truck className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('dashboard.shipments.empty')}</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {consolidations.map((consolidation) => {
            const StatusIcon = STATUS_ICONS[consolidation.status]

            return (
              <Card key={consolidation.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.created')}
                      </p>
                      <p className="font-medium text-navy">{consolidation.createdAt.slice(0, 10)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.destination')}
                      </p>
                      <p className="font-medium text-navy">
                        {consolidation.city}, {consolidation.country}
                      </p>
                    </div>
                    {consolidation.carrier && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                          {t('dashboard.shipments.table.carrier')}
                        </p>
                        <p className="font-medium text-navy">{consolidation.carrier}</p>
                      </div>
                    )}
                    {consolidation.costUsd !== null && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                          {t('dashboard.shipments.table.cost')}
                        </p>
                        <p className="font-medium text-navy">${consolidation.costUsd.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[consolidation.status]}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`dashboard.shipments.status.${consolidation.status}`)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate/10 pt-4">
                  <div className="text-sm text-slate">
                    {consolidation.status === 'pending' && (
                      <span>{t('dashboard.shipments.pendingNote')}</span>
                    )}
                    {consolidation.status === 'paid' && consolidation.paidAt && (
                      <span>{t('dashboard.shipments.paidOn', { date: consolidation.paidAt.slice(0, 10) })}</span>
                    )}
                    {(consolidation.status === 'shipped' || consolidation.status === 'delivered') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate/50">
                          {t('dashboard.shipments.table.tracking')}
                        </span>
                        {consolidation.trackingCode ? (
                          <>
                            <span className="font-mono text-sm text-navy">{consolidation.trackingCode}</span>
                            <CopyButton
                              text={consolidation.trackingCode}
                              label={t('dashboard.shipments.copyTracking', {
                                code: consolidation.trackingCode,
                              })}
                            />
                          </>
                        ) : (
                          <span className="text-slate/60">{t('dashboard.shipments.noTracking')}</span>
                        )}
                      </div>
                    )}
                    {consolidation.status === 'cancelled' && (
                      <span>{t('dashboard.shipments.cancelledNote')}</span>
                    )}
                  </div>

                  {consolidation.status === 'pending' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={payingId === consolidation.id}
                      onClick={() => handlePayNow(consolidation.id)}
                    >
                      {payingId === consolidation.id
                        ? t('dashboard.shipments.payingNow')
                        : t('dashboard.shipments.payNow')}
                    </Button>
                  )}
                </div>

                {payError === consolidation.id && (
                  <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                    {t('dashboard.shipments.payError')}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
