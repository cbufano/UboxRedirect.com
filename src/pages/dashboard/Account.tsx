import { useState, useEffect } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { profileService } from '../../services/profileService'
import { SUPPORTED_LANGUAGES } from '../../i18n'

const COUNTRY_CODES = ['BR', 'US', 'PT', 'ES', 'MX', 'AR', 'GB', 'OTHER'] as const

export default function Account() {
  const { t, i18n } = useTranslation()

  // --- Profile form ---
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState(false)

  const schema = z.object({
    name: z.string().min(1, t('dashboard.account.profile.errors.name')),
    email: z.string().email(t('dashboard.account.profile.errors.email')),
    country: z.string().min(1, t('dashboard.account.profile.errors.country')),
  })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', country: '' },
  })

  useEffect(() => {
    let active = true
    profileService.getMyProfile().then((profile) => {
      if (active && profile) {
        reset({ name: profile.name, email: profile.email, country: profile.country })
      }
    })
    return () => {
      active = false
    }
  }, [reset])

  const onValid: SubmitHandler<FormValues> = async ({ name, country }) => {
    setProfileError(false)
    try {
      await profileService.updateMyProfile({ name, country })
      setProfileSaved(true)
    } catch {
      setProfileError(true)
    }
  }

  // --- Language preference ---
  const currentLanguage = i18n.resolvedLanguage ?? 'en'

  // --- Notifications ---
  const [notifications, setNotifications] = useState({
    packageArrival: true,
    shipmentUpdates: true,
    promotions: false,
  })

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // --- Delivery addresses ---
  const [addresses, setAddresses] = useState<string[]>([])
  const [newAddress, setNewAddress] = useState('')

  const addAddress = () => {
    const trimmed = newAddress.trim()
    if (!trimmed) return
    setAddresses((prev) => [...prev, trimmed])
    setNewAddress('')
  }

  const removeAddress = (index: number) => {
    setAddresses((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.account.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.account.subtitle')}</p>

      {/* Profile */}
      <form
        onSubmit={handleSubmit(onValid)}
        noValidate
        onChange={() => setProfileSaved(false)}
      >
        <Card className="mt-6 max-w-xl">
          <h2 className="text-lg font-semibold text-navy">{t('dashboard.account.profile.title')}</h2>

          <div className="mt-4 space-y-4">
            <Input
              label={t('dashboard.account.profile.name')}
              id="name"
              type="text"
              autoComplete="name"
              error={errors.name?.message}
              {...register('name')}
            />

            <div>
              <Input
                label={t('dashboard.account.profile.email')}
                id="email"
                type="email"
                autoComplete="email"
                disabled
                error={errors.email?.message}
                {...register('email')}
              />
              <p className="mt-1 text-xs text-slate/60">{t('dashboard.account.profile.emailLocked')}</p>
            </div>

            <div>
              <label htmlFor="country" className="block">
                {t('dashboard.account.profile.country')}
                <select
                  id="country"
                  className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-invalid={errors.country ? true : undefined}
                  {...register('country')}
                >
                  <option value="" disabled>
                    {t('dashboard.account.profile.country')}
                  </option>
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`dashboard.account.profile.countries.${code}`)}
                    </option>
                  ))}
                </select>
              </label>
              {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>}
            </div>
          </div>

          <div className="mt-6">
            <Button type="submit" variant="primary" size="lg">
              {t('dashboard.account.profile.submit')}
            </Button>
          </div>
        </Card>
      </form>

      {profileSaved && (
        <Card className="mt-6 max-w-xl" role="status">
          <p className="text-sm text-navy">{t('dashboard.account.profile.confirmation')}</p>
        </Card>
      )}

      {profileError && (
        <Card className="mt-6 max-w-xl" role="alert">
          <p className="text-sm text-red-600">{t('dashboard.account.profile.error')}</p>
        </Card>
      )}

      {/* Language preference */}
      <Card className="mt-6 max-w-xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.account.language.title')}</h2>
        <div className="mt-4 max-w-xs">
          <label htmlFor="language" className="block">
            {t('dashboard.account.language.label')}
            <select
              id="language"
              value={currentLanguage}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`dashboard.account.language.options.${lng}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="mt-6 max-w-xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.account.notifications.title')}</h2>
        <div className="mt-4 space-y-3">
          <label htmlFor="notif-packageArrival" className="flex items-center gap-3 text-sm text-slate">
            <input
              id="notif-packageArrival"
              type="checkbox"
              checked={notifications.packageArrival}
              onChange={() => toggleNotification('packageArrival')}
              className="h-4 w-4 rounded border-slate/30 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            {t('dashboard.account.notifications.packageArrival')}
          </label>
          <label htmlFor="notif-shipmentUpdates" className="flex items-center gap-3 text-sm text-slate">
            <input
              id="notif-shipmentUpdates"
              type="checkbox"
              checked={notifications.shipmentUpdates}
              onChange={() => toggleNotification('shipmentUpdates')}
              className="h-4 w-4 rounded border-slate/30 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            {t('dashboard.account.notifications.shipmentUpdates')}
          </label>
          <label htmlFor="notif-promotions" className="flex items-center gap-3 text-sm text-slate">
            <input
              id="notif-promotions"
              type="checkbox"
              checked={notifications.promotions}
              onChange={() => toggleNotification('promotions')}
              className="h-4 w-4 rounded border-slate/30 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            {t('dashboard.account.notifications.promotions')}
          </label>
        </div>
      </Card>

      {/* Delivery addresses */}
      <Card className="mt-6 max-w-xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.account.addresses.title')}</h2>

        {addresses.length === 0 ? (
          <p className="mt-3 text-sm text-slate/70">{t('dashboard.account.addresses.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate/10">
            {addresses.map((address, index) => (
              <li key={`${address}-${index}`} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                <span className="text-sm text-navy">{address}</span>
                <button
                  type="button"
                  onClick={() => removeAddress(index)}
                  aria-label={`${t('dashboard.account.addresses.remove')}: ${address}`}
                  className="inline-flex items-center justify-center rounded-lg p-2 text-slate/60 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label={t('dashboard.account.addresses.label')}
              id="newAddress"
              type="text"
              placeholder={t('dashboard.account.addresses.placeholder')}
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addAddress}>
            {t('dashboard.account.addresses.add')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
