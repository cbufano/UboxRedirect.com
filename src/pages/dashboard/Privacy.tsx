import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { privacyService, type DataRequest } from '../../services/privacyService'

type PanelKind = 'export' | 'delete'

const statusClasses: Record<DataRequest['status'], string> = {
  pending: 'bg-slate/10 text-slate',
  processing: 'bg-amber-500/10 text-amber-600',
  completed: 'bg-success/10 text-success',
  rejected: 'bg-red-50 text-red-600',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export default function Privacy() {
  const { t } = useTranslation()

  // --- Past requests list — deliberately its own loading/error state, kept
  // separate from the two request buttons below. A prior review on this
  // codebase (NotifyPurchase.tsx) flagged gating an unrelated submission
  // form behind a list-fetch's loading state — same mistake avoided here.
  const [requests, setRequests] = useState<DataRequest[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)

  useEffect(() => {
    let active = true
    privacyService
      .getMyDataRequests()
      .then((data) => {
        if (active) setRequests(data)
      })
      .catch(() => {
        if (active) setListError(true)
      })
      .finally(() => {
        if (active) setListLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const refreshList = async () => {
    try {
      const data = await privacyService.getMyDataRequests()
      setRequests(data)
    } catch {
      // Silent — the new request was already submitted successfully; the
      // list just stays stale until the next successful refresh/reload.
    }
  }

  // --- Request buttons + confirmation panel ---
  const [openPanel, setOpenPanel] = useState<PanelKind | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const openPanelFor = (kind: PanelKind) => {
    setOpenPanel(kind)
    setNote('')
    setSubmitError(false)
    setSubmitSuccess(false)
  }

  const closePanel = () => {
    setOpenPanel(null)
    setNote('')
    setSubmitError(false)
  }

  const handleConfirm = async () => {
    if (!openPanel) return
    setSubmitError(false)
    setSubmitting(true)
    try {
      await privacyService.submitDataRequest({ kind: openPanel, requestNote: note.trim() })
      setSubmitSuccess(true)
      setOpenPanel(null)
      setNote('')
      await refreshList()
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const rights = t('dashboard.privacy.rights.items', { returnObjects: true }) as string[]

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.privacy.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.privacy.subtitle')}</p>

      <Card className="mt-6 max-w-2xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy">{t('dashboard.privacy.rights.title')}</h2>
        </div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate">
          {rights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6 max-w-2xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="primary" onClick={() => openPanelFor('export')}>
            {t('dashboard.privacy.actions.exportTitle')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => openPanelFor('delete')}>
            {t('dashboard.privacy.actions.deleteTitle')}
          </Button>
        </div>

        {openPanel && (
          <div className="mt-4 border-t border-slate/10 pt-4">
            <p className="text-sm text-slate/70">
              {t(
                openPanel === 'export'
                  ? 'dashboard.privacy.actions.exportDescription'
                  : 'dashboard.privacy.actions.deleteDescription',
              )}
            </p>

            <label htmlFor="requestNote" className="mt-3 block">
              <span className="text-sm font-medium text-navy">{t('dashboard.privacy.actions.noteLabel')}</span>
              <textarea
                id="requestNote"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('dashboard.privacy.actions.notePlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </label>

            <div className="mt-3 flex gap-3">
              <Button type="button" onClick={handleConfirm} disabled={submitting}>
                {submitting
                  ? t('dashboard.privacy.actions.submitting')
                  : t(
                      openPanel === 'export'
                        ? 'dashboard.privacy.actions.confirmExport'
                        : 'dashboard.privacy.actions.confirmDelete',
                    )}
              </Button>
              <Button type="button" variant="ghost" onClick={closePanel} disabled={submitting}>
                {t('dashboard.privacy.actions.cancel')}
              </Button>
            </div>
          </div>
        )}

        {submitSuccess && (
          <p role="status" className="mt-4 text-sm font-medium text-success">
            {t('dashboard.privacy.actions.success')}
          </p>
        )}
        {submitError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {t('dashboard.privacy.actions.error')}
          </p>
        )}
      </Card>

      <Card className="mt-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.privacy.list.title')}</h2>

        {listLoading ? (
          <p className="mt-3 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : listError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('dashboard.privacy.loadError')}
          </p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate/70">{t('dashboard.privacy.list.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.privacy.list.table.kind')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.privacy.list.table.status')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.privacy.list.table.requested')}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t('dashboard.privacy.list.table.completed')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-2 py-2 font-medium text-navy">
                      {t(`dashboard.privacy.kind.${request.kind}`)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[request.status]}`}
                      >
                        {t(`dashboard.privacy.status.${request.status}`)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate">{formatDate(request.requestedAt)}</td>
                    <td className="px-2 py-2 text-slate">{formatDate(request.completedAt)}</td>
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
