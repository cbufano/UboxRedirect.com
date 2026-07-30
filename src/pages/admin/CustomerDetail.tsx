/**
 * CustomerDetail — perfil completo do cliente (/admin/customers/:id): dados +
 * suite, compliance KYC/OFAC (movido do PackagesQueue — mesmos selects e
 * adminService.setKycStatus/setOfacStatus), suspensão/reativação com
 * confirmação inline, notas internas (o cliente NUNCA vê — RLS staff-only) e
 * resumos de atividade (pacotes vivos, consolidações, pagamentos, pedidos
 * LGPD). Toda ação recarrega o perfil — o banco é a fonte da verdade.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminService } from '../../services/adminService'
import { peopleAdminService, type CustomerProfileDetail } from '../../services/peopleAdminService'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

// KycStatus/OfacStatus não incluem 'not_started' de propósito — o staff não
// tem como "desfazer" para not_started pelo select (mesma restrição de
// adminService.setKycStatus/setOfacStatus); o valor atual aparece desabilitado
// no topo do select só quando ainda for not_started.
const KYC_EDITABLE_STATUSES = ['pending', 'verified', 'rejected'] as const
const OFAC_EDITABLE_STATUSES = ['clear', 'flagged'] as const

// Mesmas cores por status do PackageDetail (subset de status "vivos").
const packageStatusClasses: Record<CustomerProfileDetail['packages'][number]['status'], string> = {
  received: 'bg-slate/10 text-slate',
  in_review: 'bg-amber-500/10 text-amber-600',
  ready: 'bg-success/10 text-success',
  consolidating: 'bg-amber-500/10 text-amber-600',
}

const paymentStatusClasses: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  succeeded: 'bg-success/10 text-success',
  failed: 'bg-red-50 text-red-600',
  refunded: 'bg-slate/10 text-slate',
}

const NEUTRAL_BADGE = 'bg-slate/10 text-slate'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()

  const [detail, setDetail] = useState<CustomerProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [complianceSaving, setComplianceSaving] = useState<'kyc' | 'ofac' | null>(null)
  const [complianceError, setComplianceError] = useState(false)
  const [complianceSuccess, setComplianceSuccess] = useState(false)

  const [confirmingSuspension, setConfirmingSuspension] = useState(false)
  const [suspensionWorking, setSuspensionWorking] = useState(false)
  const [suspensionError, setSuspensionError] = useState(false)

  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState(false)

  useEffect(() => {
    let active = true
    if (!id) {
      setLoading(false)
      setLoadError(true)
      return
    }
    peopleAdminService
      .getCustomerProfile(id)
      .then((data) => {
        if (active) setDetail(data)
      })
      .catch(() => {
        // Cobre também o caso "não encontrado": .single() falha quando o id
        // não existe — a mensagem de erro já explica as duas possibilidades.
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const refresh = async () => {
    if (!id) return
    const data = await peopleAdminService.getCustomerProfile(id)
    setDetail(data)
  }

  const handleKycChange = async (status: (typeof KYC_EDITABLE_STATUSES)[number]) => {
    if (!id) return
    setComplianceError(false)
    setComplianceSuccess(false)
    setComplianceSaving('kyc')
    try {
      await adminService.setKycStatus(id, status)
      await refresh()
      setComplianceSuccess(true)
    } catch {
      setComplianceError(true)
    } finally {
      setComplianceSaving(null)
    }
  }

  const handleOfacChange = async (status: (typeof OFAC_EDITABLE_STATUSES)[number]) => {
    if (!id) return
    setComplianceError(false)
    setComplianceSuccess(false)
    setComplianceSaving('ofac')
    try {
      await adminService.setOfacStatus(id, status)
      await refresh()
      setComplianceSuccess(true)
    } catch {
      setComplianceError(true)
    } finally {
      setComplianceSaving(null)
    }
  }

  const handleConfirmSuspension = async () => {
    if (!id || !detail) return
    setSuspensionWorking(true)
    setSuspensionError(false)
    try {
      await peopleAdminService.setSuspended(id, detail.suspendedAt === null)
      await refresh()
      setConfirmingSuspension(false)
    } catch {
      setSuspensionError(true)
    } finally {
      setSuspensionWorking(false)
    }
  }

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id || !noteText.trim()) return
    setNoteSaving(true)
    setNoteError(false)
    try {
      await peopleAdminService.addCustomerNote(id, noteText)
      await refresh()
      setNoteText('')
    } catch {
      setNoteError(true)
    } finally {
      setNoteSaving(false)
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-slate/60">{t('dashboard.loading')}</p>
  }

  if (loadError || !detail) {
    return (
      <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.customers.detail.loadError')}
      </p>
    )
  }

  const isSuspended = detail.suspendedAt !== null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">{detail.name}</h1>
        {isSuspended && (
          <span className="inline-block rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            {t('admin.customers.badges.suspended')}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate/70">
        {detail.email} · {detail.suiteNumber ?? t('admin.customers.detail.noSuite')} · {detail.country}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.compliance.title')}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label htmlFor="kycStatus" className="block text-sm text-navy">
              {t('admin.customers.compliance.kycLabel')}
              <select
                id="kycStatus"
                value={detail.kycStatus}
                disabled={complianceSaving !== null}
                onChange={(event) => handleKycChange(event.target.value as (typeof KYC_EDITABLE_STATUSES)[number])}
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {detail.kycStatus === 'not_started' && (
                  <option value="not_started" disabled>
                    {t('admin.customers.compliance.kycStatuses.not_started')}
                  </option>
                )}
                {KYC_EDITABLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`admin.customers.compliance.kycStatuses.${status}`)}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="ofacStatus" className="block text-sm text-navy">
              {t('admin.customers.compliance.ofacLabel')}
              <select
                id="ofacStatus"
                value={detail.ofacStatus}
                disabled={complianceSaving !== null}
                onChange={(event) => handleOfacChange(event.target.value as (typeof OFAC_EDITABLE_STATUSES)[number])}
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {detail.ofacStatus === 'not_started' && (
                  <option value="not_started" disabled>
                    {t('admin.customers.compliance.ofacStatuses.not_started')}
                  </option>
                )}
                {OFAC_EDITABLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`admin.customers.compliance.ofacStatuses.${status}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {complianceSaving && <p className="mt-2 text-xs text-slate/60">{t('admin.customers.compliance.saving')}</p>}
          {complianceError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {t('admin.customers.compliance.error')}
            </p>
          )}
          {complianceSuccess && (
            <p role="status" className="mt-2 text-xs font-medium text-success">
              {t('admin.customers.compliance.updated')}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.suspension.title')}</h2>
          <p className="mt-2 text-sm text-slate/70">
            {isSuspended ? t('admin.customers.suspension.suspendedHint') : t('admin.customers.suspension.activeHint')}
          </p>
          {!confirmingSuspension ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setConfirmingSuspension(true)
                  setSuspensionError(false)
                }}
              >
                {isSuspended ? t('admin.customers.suspension.reactivate') : t('admin.customers.suspension.suspend')}
              </Button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-navy">
                {isSuspended
                  ? t('admin.customers.suspension.confirmReactivate')
                  : t('admin.customers.suspension.confirmSuspend')}
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" disabled={suspensionWorking} onClick={handleConfirmSuspension}>
                  {suspensionWorking ? t('admin.customers.suspension.working') : t('admin.customers.suspension.confirm')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingSuspension(false)}>
                  {t('admin.customers.suspension.cancel')}
                </Button>
              </div>
            </div>
          )}
          {suspensionError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {t('admin.customers.suspension.error')}
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-navy">{t('admin.customers.notes.title')}</h2>
        <p className="mt-1 text-xs text-slate/50">{t('admin.customers.notes.visibilityHint')}</p>
        {detail.notes.length === 0 ? (
          <p className="mt-3 text-sm text-slate/60">{t('admin.customers.notes.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {detail.notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-slate/10 p-3">
                <p className="text-xs text-slate/50">
                  {note.authorName} — {new Date(note.createdAt).toLocaleString(i18n.language)}
                </p>
                <p className="mt-1 text-sm text-navy">{note.note}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAddNote} className="mt-4">
          <label htmlFor="newNote" className="block text-sm text-navy">
            {t('admin.customers.notes.addLabel')}
            <textarea
              id="newNote"
              rows={3}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder={t('admin.customers.notes.placeholder')}
              className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>
          {noteError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {t('admin.customers.notes.error')}
            </p>
          )}
          <div className="mt-3">
            <Button type="submit" disabled={noteSaving || !noteText.trim()}>
              {noteSaving ? t('admin.customers.notes.submitting') : t('admin.customers.notes.submit')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.summaries.packages.title')}</h2>
          {detail.packages.length === 0 ? (
            <p className="mt-3 text-sm text-slate/60">{t('admin.customers.summaries.packages.empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.packages.map((pkg) => (
                <li key={pkg.id} className="flex items-center justify-between gap-3">
                  <Link
                    to={`/admin/packages/${pkg.id}`}
                    className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {pkg.store}
                  </Link>
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[pkg.status]}`}
                  >
                    {t(`admin.packageDetail.status.${pkg.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.summaries.consolidations.title')}</h2>
          {detail.consolidations.length === 0 ? (
            <p className="mt-3 text-sm text-slate/60">{t('admin.customers.summaries.consolidations.empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.consolidations.map((consolidation) => (
                <li key={consolidation.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-navy">
                    {consolidation.city}, {consolidation.country}
                  </span>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${NEUTRAL_BADGE}`}>
                    {t(`dashboard.shipments.status.${consolidation.status}`, { defaultValue: consolidation.status })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.summaries.payments.title')}</h2>
          {detail.payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate/60">{t('admin.customers.summaries.payments.empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-navy">${payment.amountUsd.toFixed(2)}</span>
                  <span className="text-xs text-slate/60">
                    {t(`admin.payments.provider.${payment.provider}`, { defaultValue: payment.provider })}
                  </span>
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusClasses[payment.status] ?? NEUTRAL_BADGE}`}
                  >
                    {t(`admin.payments.status.${payment.status}`, { defaultValue: payment.status })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy">{t('admin.customers.summaries.dataRequests.title')}</h2>
          {detail.dataRequests.length === 0 ? (
            <p className="mt-3 text-sm text-slate/60">{t('admin.customers.summaries.dataRequests.empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.dataRequests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-navy">{t(`admin.dataRequests.kind.${request.kind}`)}</span>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${NEUTRAL_BADGE}`}>
                    {t(`dashboard.privacy.status.${request.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
