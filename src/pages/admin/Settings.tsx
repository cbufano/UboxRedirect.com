/**
 * Settings — parâmetros operacionais (/admin/settings): edição das duas chaves
 * de settings (free_storage_days / paid_unshipped_alert_days) que alimentam o
 * painel de pendências, e um card INFORMATIVO com a última cotação de câmbio
 * por moeda (escrita é exclusiva da Edge Function refresh-exchange-rates via
 * service_role — nada editável aqui).
 *
 * O gate de papel é só UI (useRole): inputs e salvar aparecem para
 * admin/super_admin; ops vê os valores em modo leitura. Quem barra escrita de
 * verdade é a RLS (settings_write_admin).
 *
 * Fase 7.4: card "Email outbox" — leitura dos e-mails enfileirados pelos
 * triggers do banco (outboxAdminService), com filtro por status. `skipped`
 * significa RESEND_API_KEY não configurada: aviso âmbar fixo enquanto houver
 * ao menos um no resultado.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SlidersHorizontal, Banknote, TriangleAlert, Mail } from 'lucide-react'
import { settingsService } from '../../services/settingsService'
import { currencyService, type DisplayRate } from '../../services/currencyService'
import {
  outboxAdminService,
  type OutboxEmail,
  type OutboxStatus,
  type OutboxTemplate,
} from '../../services/outboxAdminService'
import { useRole } from '../../contexts/RoleContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

// As duas chaves são fixas do seed da migration — o painel de pendências as lê
// por nome. i18nKey separado porque chaves de tradução seguem camelCase.
const SETTING_FIELDS = [
  { key: 'free_storage_days', i18nKey: 'freeStorageDays' },
  { key: 'paid_unshipped_alert_days', i18nKey: 'paidUnshippedAlertDays' },
] as const

// Inteiro >= 0: só dígitos (o regex também barra campo vazio, sinal e
// decimais — nada de Number('') === 0 virando zero por acidente).
const settingSchema = z.string().trim().regex(/^\d+$/).transform(Number)

const STALE_MS = 48 * 60 * 60 * 1000

// Chaves de tradução em camelCase para os templates snake_case do banco —
// mesma convenção de SETTING_FIELDS.i18nKey acima.
const TEMPLATE_I18N_KEYS: Record<OutboxTemplate, string> = {
  package_received: 'packageReceived',
  package_ready: 'packageReady',
  payment_confirmed: 'paymentConfirmed',
  shipped: 'shipped',
  storage_warning: 'storageWarning',
}

const OUTBOX_STATUSES: OutboxStatus[] = ['pending', 'sent', 'failed', 'skipped']

const OUTBOX_STATUS_CLASSES: Record<OutboxStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  sent: 'bg-success/10 text-success',
  failed: 'bg-red-50 text-red-600',
  skipped: 'bg-slate/10 text-slate/70',
}

export default function Settings() {
  const { t } = useTranslation()
  const { roles } = useRole()
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')

  const [values, setValues] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState(false)

  // Estado por campo, preso à chave — cada setting tem seu próprio salvar.
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [invalidKey, setInvalidKey] = useState<string | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const [rates, setRates] = useState<DisplayRate[]>([])
  const [ratesLoading, setRatesLoading] = useState(true)
  const [ratesError, setRatesError] = useState(false)

  // '' = todos os status (sem filtro no service).
  const [outbox, setOutbox] = useState<OutboxEmail[]>([])
  const [outboxFilter, setOutboxFilter] = useState<'' | OutboxStatus>('')
  const [outboxLoading, setOutboxLoading] = useState(true)
  const [outboxError, setOutboxError] = useState(false)

  useEffect(() => {
    let active = true
    settingsService
      .getSettings()
      .then((data) => {
        if (active) setValues(data)
      })
      .catch(() => {
        if (active) setSettingsError(true)
      })
      .finally(() => {
        if (active) setSettingsLoading(false)
      })
    currencyService
      .getLatestRates()
      .then((data) => {
        if (active) setRates(data)
      })
      .catch(() => {
        if (active) setRatesError(true)
      })
      .finally(() => {
        if (active) setRatesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Efeito próprio, refeito a cada troca de filtro (a primeira execução, com
  // filtro '', é a carga inicial). Loading/erro isolados: o outbox nunca
  // bloqueia os cards de parâmetros e câmbio.
  useEffect(() => {
    let active = true
    setOutboxLoading(true)
    setOutboxError(false)
    outboxAdminService
      .getOutbox(outboxFilter === '' ? undefined : outboxFilter)
      .then((data) => {
        if (active) setOutbox(data)
      })
      .catch(() => {
        if (active) setOutboxError(true)
      })
      .finally(() => {
        if (active) setOutboxLoading(false)
      })
    return () => {
      active = false
    }
  }, [outboxFilter])

  const handleSave = async (key: string) => {
    setSavedKey(null)
    setSaveErrorKey(null)
    const parsed = settingSchema.safeParse(values[key] ?? '')
    if (!parsed.success) {
      setInvalidKey(key)
      return
    }
    setInvalidKey(null)
    setSavingKey(key)
    try {
      await settingsService.updateSetting(key, String(parsed.data))
      setSavedKey(key)
    } catch {
      setSaveErrorKey(key)
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.settings.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.settings.subtitle')}</p>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
          <SlidersHorizontal className="h-5 w-5 text-brand" aria-hidden="true" />
          {t('admin.settings.paramsTitle')}
        </h2>
        {!isAdmin && <p className="mt-1 text-sm text-slate/70">{t('admin.settings.readOnly')}</p>}

        {settingsLoading ? (
          <p className="mt-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : settingsError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.settings.loadError')}
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {SETTING_FIELDS.map((field) => (
              <div key={field.key} className="max-w-xl">
                {isAdmin ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <Input
                        label={t(`admin.settings.fields.${field.i18nKey}.label`)}
                        id={field.key}
                        type="number"
                        min={0}
                        step={1}
                        value={values[field.key] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                        error={invalidKey === field.key ? t('admin.settings.invalid') : undefined}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-7"
                      disabled={savingKey === field.key}
                      onClick={() => handleSave(field.key)}
                    >
                      {savingKey === field.key ? t('admin.settings.saving') : t('admin.settings.save')}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {t(`admin.settings.fields.${field.i18nKey}.label`)}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-navy">{values[field.key] ?? '—'}</p>
                  </div>
                )}
                <p className="mt-1 text-sm text-slate/70">{t(`admin.settings.fields.${field.i18nKey}.hint`)}</p>
                {savedKey === field.key && (
                  <p role="status" className="mt-2 text-sm font-medium text-success">
                    {t('admin.settings.saved')}
                  </p>
                )}
                {saveErrorKey === field.key && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                    {t('admin.settings.saveError')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
          <Banknote className="h-5 w-5 text-brand" aria-hidden="true" />
          {t('admin.settings.exchange.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate/70">{t('admin.settings.exchange.hint')}</p>

        {ratesLoading ? (
          <p className="mt-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : ratesError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.settings.exchange.loadError')}
          </p>
        ) : rates.length === 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('admin.settings.exchange.empty')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate/10">
            {rates.map((rate) => {
              // quoted_at é date (YYYY-MM-DD, meia-noite UTC) — mais de 48h
              // sem cotação nova indica que o cron diário parou.
              const stale = Date.now() - new Date(rate.quotedAt).getTime() > STALE_MS
              return (
                <li key={rate.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium text-navy">
                      {rate.code} <span className="text-slate/50">({rate.symbol})</span>
                    </p>
                    <p className="text-sm text-slate">
                      {t('admin.settings.exchange.perUsd', { rate: rate.ratePerUsd })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate">
                      {t('admin.settings.exchange.quotedAt', { date: rate.quotedAt })}
                    </p>
                    {stale && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('admin.settings.exchange.stale')}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <Mail className="h-5 w-5 text-brand" aria-hidden="true" />
            {t('admin.settings.outbox.title')}
          </h2>
          <label htmlFor="outbox-status-filter" className="flex items-center gap-2 text-sm text-navy">
            {t('admin.settings.outbox.filterLabel')}
            <select
              id="outbox-status-filter"
              value={outboxFilter}
              onChange={(event) => setOutboxFilter(event.target.value as '' | OutboxStatus)}
              className="rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">{t('admin.settings.outbox.filterAll')}</option>
              {OUTBOX_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`admin.settings.outbox.status.${status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-slate/70">{t('admin.settings.outbox.hint')}</p>

        {!outboxLoading && !outboxError && outbox.some((email) => email.status === 'skipped') && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('admin.settings.outbox.skippedWarning')}
          </p>
        )}

        {outboxLoading ? (
          <p className="mt-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : outboxError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.settings.outbox.loadError')}
          </p>
        ) : outbox.length === 0 ? (
          <p className="mt-4 text-sm text-slate/70">{t('admin.settings.outbox.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-3 py-2">{t('admin.settings.outbox.columns.date')}</th>
                  <th scope="col" className="px-3 py-2">{t('admin.settings.outbox.columns.customer')}</th>
                  <th scope="col" className="px-3 py-2">{t('admin.settings.outbox.columns.template')}</th>
                  <th scope="col" className="px-3 py-2">{t('admin.settings.outbox.columns.status')}</th>
                  <th scope="col" className="px-3 py-2">{t('admin.settings.outbox.columns.error')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {outbox.map((email) => (
                  <tr key={email.id}>
                    <td className="whitespace-nowrap px-3 py-3 text-slate">{email.createdAt.slice(0, 10)}</td>
                    <td className="px-3 py-3 font-medium text-navy">{email.customerName}</td>
                    <td className="px-3 py-3 text-slate">
                      {t(`admin.settings.outbox.templates.${TEMPLATE_I18N_KEYS[email.template]}`)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${OUTBOX_STATUS_CLASSES[email.status]}`}
                      >
                        {t(`admin.settings.outbox.status.${email.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {email.error !== '' && <span className="text-xs text-red-600">{email.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
