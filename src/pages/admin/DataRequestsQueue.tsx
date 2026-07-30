import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FileClock } from 'lucide-react'
import { adminService, type AdminDataRequest } from '../../services/adminService'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

function ResolveRow({
  request,
  onResolved,
}: {
  request: AdminDataRequest
  onResolved: (id: string) => void
}) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState<'completed' | 'rejected' | null>(null)
  const [error, setError] = useState(false)

  const handleResolve = async (event: FormEvent, status: 'completed' | 'rejected') => {
    event.preventDefault()
    if (submitting) return
    setError(false)
    setSubmitting(status)
    try {
      await adminService.resolveDataRequest(request.id, { status, resolutionNotes: notes.trim() })
      onResolved(request.id)
    } catch {
      setError(true)
      setSubmitting(null)
    }
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <span className="block font-medium text-navy">{request.customerName}</span>
        <span className="block text-xs text-slate/50">{request.customerEmail}</span>
      </td>
      <td className="px-4 py-3 text-slate">{t(`admin.dataRequests.kind.${request.kind}`)}</td>
      <td className="px-4 py-3 max-w-xs text-slate">{request.requestNote}</td>
      <td className="px-4 py-3 text-slate">{formatDate(request.requestedAt)}</td>
      <td className="px-4 py-3">
        <form className="flex flex-col gap-2">
          <label htmlFor={`notes-${request.id}`} className="sr-only">
            {t('admin.dataRequests.resolveForm.notesLabel')}
          </label>
          <textarea
            id={`notes-${request.id}`}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('admin.dataRequests.resolveForm.notesPlaceholder')}
            className="w-56 rounded-lg border border-slate/20 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={submitting !== null}
              onClick={(event) => handleResolve(event, 'completed')}
            >
              {t('admin.dataRequests.resolveForm.markCompleted')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting !== null}
              onClick={(event) => handleResolve(event, 'rejected')}
            >
              {t('admin.dataRequests.resolveForm.reject')}
            </Button>
          </div>
        </form>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {t('admin.dataRequests.resolveForm.error')}
          </p>
        )}
      </td>
    </tr>
  )
}

export default function DataRequestsQueue() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<AdminDataRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    adminService
      .getOpenDataRequests()
      .then((data) => {
        if (active) setQueue(data)
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

  const handleResolved = (id: string) => {
    setQueue((prev) => prev.filter((r) => r.id !== id))
  }

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('admin.dataRequests.loadError')}
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.dataRequests.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.dataRequests.subtitle')}</p>

      {queue.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <FileClock className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('admin.dataRequests.empty')}</p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                <th scope="col" className="px-4 py-3">
                  {t('admin.dataRequests.table.customer')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.dataRequests.table.kind')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.dataRequests.table.note')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.dataRequests.table.requested')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.dataRequests.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {queue.map((request) => (
                <ResolveRow key={request.id} request={request} onResolved={handleResolved} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
