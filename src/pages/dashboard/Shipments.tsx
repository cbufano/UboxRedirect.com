import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Truck, CheckCircle2, Clock, ChevronDown } from 'lucide-react'
import { shipments, type Shipment } from '../../mocks/shipments'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'

const STATUS_CLASSES: Record<Shipment['status'], string> = {
  processing: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-success/10 text-success',
}

const STATUS_ICONS: Record<Shipment['status'], typeof Clock> = {
  processing: Clock,
  in_transit: Truck,
  delivered: CheckCircle2,
}

export default function Shipments() {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? null : id))
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.shipments.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.shipments.subtitle')}</p>

      {shipments.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Truck className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('dashboard.shipments.empty')}</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {shipments.map((shipment) => {
            const StatusIcon = STATUS_ICONS[shipment.status]
            const isExpanded = expandedId === shipment.id
            const detailsPanelId = `shipment-details-${shipment.id}`

            return (
              <Card key={shipment.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.date')}
                      </p>
                      <p className="font-medium text-navy">{shipment.date}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.carrier')}
                      </p>
                      <p className="font-medium text-navy">{shipment.carrier}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.items')}
                      </p>
                      <p className="font-medium text-navy">{shipment.itemCount}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                        {t('dashboard.shipments.table.cost')}
                      </p>
                      <p className="font-medium text-navy">${shipment.costUsd.toFixed(2)}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[shipment.status]}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`dashboard.shipments.status.${shipment.status}`)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate/10 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate/50">
                      {t('dashboard.shipments.table.tracking')}
                    </span>
                    <span className="font-mono text-sm text-navy">{shipment.trackingCode}</span>
                    <CopyButton
                      text={shipment.trackingCode}
                      label={t('dashboard.shipments.copyTracking', { code: shipment.trackingCode })}
                    />
                  </div>

                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsPanelId}
                    onClick={() => toggleExpanded(shipment.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {isExpanded
                      ? t('dashboard.shipments.hideDetails')
                      : t('dashboard.shipments.showDetails')}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {isExpanded && (
                  <div id={detailsPanelId} className="mt-3 rounded-lg bg-offwhite p-3 text-sm text-slate">
                    {t('dashboard.shipments.detailsLine', {
                      count: shipment.itemCount,
                      carrier: shipment.carrier,
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
