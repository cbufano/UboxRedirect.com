import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WAREHOUSE_ADDRESS } from '../../config/warehouse'
import { profileService, type Profile } from '../../services/profileService'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'
import { formatUsAddress } from '../../lib/address'

export default function Address() {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    profileService
      .getMyProfile()
      .then((data) => {
        if (active) setProfile(data)
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

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('dashboard.address.loadError')}
      </p>
    )
  }

  const suite = profile?.suiteNumber ?? '—'
  const address = formatUsAddress(WAREHOUSE_ADDRESS, suite, profile?.name)
  const copiedText = t('dashboard.address.copied')

  const lines = [
    { key: 'recipient', label: t('dashboard.address.labels.recipient'), value: address.recipient },
    { key: 'line1', label: t('dashboard.address.labels.line1'), value: address.street },
    { key: 'city', label: t('dashboard.address.labels.city'), value: WAREHOUSE_ADDRESS.city },
    { key: 'state', label: t('dashboard.address.labels.state'), value: WAREHOUSE_ADDRESS.state },
    { key: 'zip', label: t('dashboard.address.labels.zip'), value: WAREHOUSE_ADDRESS.zip },
    { key: 'country', label: t('dashboard.address.labels.country'), value: address.country },
  ]

  const instructions = t('dashboard.address.instructions.items', { returnObjects: true }) as string[]

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.address.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.address.subtitle')}</p>

      <Card className="mt-6 max-w-xl">
        <dl className="divide-y divide-slate/10">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center justify-between gap-3 py-3 first:pt-0">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate/50">
                  {line.label}
                </dt>
                <dd className="text-sm font-medium text-navy">{line.value}</dd>
              </div>
              <CopyButton text={line.value} label={line.label} />
            </div>
          ))}

          {/* Suite — destacada, o campo que os clientes mais esquecem */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-brand/10 px-3 py-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-brand">
                {t('dashboard.address.labels.suite')}
              </dt>
              <dd className="text-lg font-bold text-brand">{address.suite}</dd>
            </div>
            <CopyButton text={address.suite} label={t('dashboard.address.labels.suite')} />
          </div>
        </dl>

        <p className="mt-4 text-xs text-slate/60">{t('dashboard.address.suiteNote')}</p>

        <div className="mt-6 border-t border-slate/10 pt-4">
          <CopyButton
            text={address.fullText}
            label={t('dashboard.address.fullAddressLabel')}
            visibleText={t('dashboard.address.copyFull')}
            copiedText={copiedText}
            className="w-full justify-center"
          />
        </div>
      </Card>

      <Card className="mt-6 max-w-xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.address.instructions.title')}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate">
          {instructions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
