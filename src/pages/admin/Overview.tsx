import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackageSearch, Boxes, Bell } from 'lucide-react'
import { adminService, type OpsStats } from '../../services/adminService'
import { Card } from '../../components/ui/Card'

export default function Overview() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<OpsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .getOpsStats()
      .then((data) => {
        if (active) setStats(data)
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

  if (loadError || !stats) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.overview.loadError')}
      </p>
    )
  }

  const statTiles = [
    { key: 'awaitingReview', icon: PackageSearch, value: stats.awaitingReview, iconClasses: 'bg-brand/10 text-brand' },
    {
      key: 'pendingConsolidations',
      icon: Boxes,
      value: stats.pendingConsolidations,
      iconClasses: 'bg-amber-500/10 text-amber-600',
    },
    { key: 'openPreAlerts', icon: Bell, value: stats.openPreAlerts, iconClasses: 'bg-success/10 text-success' },
  ] as const

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.overview.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.overview.subtitle')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {statTiles.map(({ key, icon: Icon, value, iconClasses }) => (
          <Card key={key} className="flex items-center gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClasses}`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-navy">{value}</p>
              <p className="text-sm text-slate/70">{t(`admin.overview.stats.${key}`)}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
