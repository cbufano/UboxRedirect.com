/**
 * Overview — Painel de Pendências (/admin): substitui os contadores gerais
 * da fase anterior por tudo que exige AÇÃO do operador agora, numa chamada só
 * (adminService.getPendingActions). Severidade por cartão: zero = verde;
 * pendência comum = âmbar; dinheiro parado (pagas sem envio / conciliação) =
 * vermelho. Tudo zerado vira o estado positivo "tudo em dia".
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Clock,
  FileClock,
  PackageSearch,
  Scale,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { adminService, type PendingActions } from '../../services/adminService'
import { Card } from '../../components/ui/Card'

/**
 * Itens de "pagas sem envio" já chegam filtrados pelo prazo de alerta
 * (settings.paid_unshipped_alert_days) no service; acima deste teto de dias
 * desde o pagamento o item ganha destaque vermelho extra na lista.
 */
const PAID_UNSHIPPED_CRITICAL_DAYS = 7

type Tone = 'ok' | 'warn' | 'critical'

const toneIconClasses: Record<Tone, string> = {
  ok: 'bg-success/10 text-success',
  warn: 'bg-amber-500/10 text-amber-600',
  critical: 'bg-red-500/10 text-red-600',
}

const toneCountClasses: Record<Tone, string> = {
  ok: 'text-navy',
  warn: 'text-amber-600',
  critical: 'text-red-600',
}

const toneCardClasses: Record<Tone, string> = {
  ok: '',
  warn: 'border-l-4 border-l-amber-500',
  critical: 'border-l-4 border-l-red-500',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)
}

interface PendingCardProps {
  icon: LucideIcon
  count: number
  tone: Tone
  title: string
  linkTo?: string
  linkLabel?: string
  children?: ReactNode
}

function PendingCard({ icon: Icon, count, tone, title, linkTo, linkLabel, children }: PendingCardProps) {
  return (
    <Card className={toneCardClasses[tone]}>
      <div className="flex items-center gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneIconClasses[tone]}`}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className={`text-2xl font-bold ${toneCountClasses[tone]}`}>{count}</p>
          <p className="text-sm text-slate/70">{title}</p>
        </div>
      </div>
      {children}
      {linkTo && linkLabel && (
        <Link to={linkTo} className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
          {linkLabel}
        </Link>
      )}
    </Card>
  )
}

export default function Overview() {
  const { t } = useTranslation()
  const [actions, setActions] = useState<PendingActions | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .getPendingActions()
      .then((data) => {
        if (active) setActions(data)
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

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError || !actions) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.overview.loadError')}
      </p>
    )
  }

  const allClear =
    actions.awaitingReview === 0 &&
    actions.paidUnshipped.length === 0 &&
    actions.openDataRequests === 0 &&
    actions.storageOverdue.length === 0 &&
    actions.unreconciled.length === 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.overview.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.overview.subtitle')}</p>

      {allClear ? (
        <Card className="mt-6 flex items-center gap-4 bg-success/5">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p role="status" className="text-lg font-semibold text-navy">
              {t('admin.overview.allClear.title')}
            </p>
            <p className="text-sm text-slate/70">{t('admin.overview.allClear.subtitle')}</p>
          </div>
        </Card>
      ) : (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
          <PendingCard
            icon={PackageSearch}
            count={actions.awaitingReview}
            tone={actions.awaitingReview > 0 ? 'warn' : 'ok'}
            title={t('admin.overview.cards.awaitingReview.title')}
            linkTo="/admin/packages"
            linkLabel={t('admin.overview.cards.awaitingReview.link')}
          />

          <PendingCard
            icon={Truck}
            count={actions.paidUnshipped.length}
            tone={actions.paidUnshipped.length > 0 ? 'critical' : 'ok'}
            title={t('admin.overview.cards.paidUnshipped.title')}
            linkTo="/admin/consolidations"
            linkLabel={t('admin.overview.cards.paidUnshipped.link')}
          >
            {actions.paidUnshipped.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {actions.paidUnshipped.map((item) => (
                  <li
                    key={item.id}
                    className={
                      daysSince(item.paidAt) > PAID_UNSHIPPED_CRITICAL_DAYS
                        ? 'font-semibold text-red-600'
                        : 'text-slate'
                    }
                  >
                    {t('admin.overview.cards.paidUnshipped.item', {
                      city: item.city,
                      country: item.country,
                      date: formatDate(item.paidAt),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </PendingCard>

          <PendingCard
            icon={FileClock}
            count={actions.openDataRequests}
            tone={actions.openDataRequests > 0 ? 'warn' : 'ok'}
            title={t('admin.overview.cards.dataRequests.title')}
            linkTo="/admin/data-requests"
            linkLabel={t('admin.overview.cards.dataRequests.link')}
          />

          <PendingCard
            icon={Clock}
            count={actions.storageOverdue.length}
            tone={actions.storageOverdue.length > 0 ? 'warn' : 'ok'}
            title={t('admin.overview.cards.storageOverdue.title')}
          >
            {actions.storageOverdue.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {actions.storageOverdue.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/admin/packages/${item.id}`}
                      className="text-slate underline decoration-slate/30 underline-offset-2 hover:text-brand"
                    >
                      {t('admin.overview.cards.storageOverdue.item', {
                        store: item.store,
                        suite: item.suiteNumber ?? '—',
                        date: formatDate(item.receivedAt),
                      })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PendingCard>

          <PendingCard
            icon={Scale}
            count={actions.unreconciled.length}
            tone={actions.unreconciled.length > 0 ? 'critical' : 'ok'}
            title={t('admin.overview.cards.reconciliation.title')}
          >
            <p className="mt-3 text-xs text-slate/60">{t('admin.overview.cards.reconciliation.hint')}</p>
            {actions.unreconciled.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {actions.unreconciled.map((item) => (
                  <li key={item.id} className="text-slate">
                    {t('admin.overview.cards.reconciliation.item', {
                      city: item.city,
                      country: item.country,
                      date: formatDate(item.shippedAt),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </PendingCard>
        </div>
      )}
    </div>
  )
}
