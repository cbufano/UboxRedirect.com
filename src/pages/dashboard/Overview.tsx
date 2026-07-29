import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Truck, CheckCircle2, MapPin } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { WAREHOUSE_ADDRESS } from '../../config/warehouse'
import { profileService } from '../../services/profileService'
import { packages, type Package as PackageRecord } from '../../mocks/packages'
import { shipments } from '../../mocks/shipments'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'
import { formatUsAddress } from '../../lib/address'

const packageStatusClasses: Record<PackageRecord['status'], string> = {
  in_box: 'bg-slate/10 text-slate',
  ready: 'bg-success/10 text-success',
}

export default function Overview() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [suite, setSuite] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    profileService.getMyProfile().then((profile) => {
      if (active) setSuite(profile?.suiteNumber ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  // O card mostra o hint genérico de destinatário (o nome já aparece na
  // saudação acima) — o cliente escreve o próprio nome no checkout da loja,
  // e o galpão o identifica pela suite.
  const address = formatUsAddress(WAREHOUSE_ADDRESS, suite ?? '—')

  const inBoxCount = packages.filter((pkg) => pkg.status === 'in_box').length
  const inTransitCount = shipments.filter(
    (shipment) => shipment.status === 'in_transit' || shipment.status === 'processing',
  ).length
  const deliveredCount = shipments.filter((shipment) => shipment.status === 'delivered').length

  const recentPackages = [...packages]
    .sort((a, b) => (a.receivedDate < b.receivedDate ? 1 : -1))
    .slice(0, 3)

  const statTiles = [
    { key: 'inBox', icon: Package, value: inBoxCount, iconClasses: 'bg-brand/10 text-brand' },
    { key: 'inTransit', icon: Truck, value: inTransitCount, iconClasses: 'bg-amber-500/10 text-amber-600' },
    { key: 'delivered', icon: CheckCircle2, value: deliveredCount, iconClasses: 'bg-success/10 text-success' },
  ] as const

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.overview.title')}</h1>
      <p className="mt-2 text-sm text-slate/70">
        {t('dashboard.overview.welcome', { name: user?.name ?? '' })}
      </p>

      {/* US address card */}
      <Card className="mt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-navy">{t('dashboard.overview.address.title')}</h2>
          </div>
          <CopyButton
            text={address.fullText}
            label={t('dashboard.overview.address.fullAddressLabel')}
            visibleText={t('dashboard.overview.address.copyFull')}
            copiedText={t('dashboard.overview.address.copied')}
          />
        </div>

        <address className="mt-4 not-italic text-sm leading-relaxed text-slate">
          <p className="font-medium text-navy">{address.recipient}</p>
          <p>{address.street}</p>
          <p className="mt-1 inline-block rounded-md bg-brand/10 px-2 py-1 font-semibold text-brand">
            {t('dashboard.address.labels.suite')}: {address.suite}
          </p>
          <p className="mt-1">{address.cityStateZip}</p>
          <p>{address.country}</p>
        </address>

        <p className="mt-4 text-xs text-slate/60">{t('dashboard.overview.address.note')}</p>
      </Card>

      {/* Stat tiles */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {statTiles.map(({ key, icon: Icon, value, iconClasses }) => (
          <Card key={key} className="flex items-center gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClasses}`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold text-navy">{value}</p>
              <p className="text-sm text-slate/70">{t(`dashboard.overview.stats.${key}`)}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent activity */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.overview.activity.title')}</h2>
        {recentPackages.length === 0 ? (
          <p className="mt-3 text-sm text-slate/70">{t('dashboard.overview.activity.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate/10">
            {recentPackages.map((pkg) => (
              <li key={pkg.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-navy">{pkg.store}</p>
                  <p className="text-sm text-slate/70">{pkg.description}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[pkg.status]}`}
                >
                  {t(`dashboard.overview.packageStatus.${pkg.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
