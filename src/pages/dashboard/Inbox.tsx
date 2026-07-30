import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Boxes, ImageOff } from 'lucide-react'
import { packageService, type ReceivedPackage } from '../../services/packageService'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

const packageStatusClasses: Record<ReceivedPackage['status'], string> = {
  received: 'bg-slate/10 text-slate',
  in_review: 'bg-slate/10 text-slate',
  ready: 'bg-success/10 text-success',
  consolidating: 'bg-amber-500/10 text-amber-600',
  shipped: 'bg-brand/10 text-brand',
  discarded: 'bg-red-50 text-red-600',
}

export default function Inbox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [packages, setPackages] = useState<ReceivedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    packageService
      .getMyReceivedPackages()
      .then((data) => {
        if (active) setPackages(data)
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleConsolidate = () => {
    navigate('/app/ship', { state: { selectedIds: [...selectedIds] } })
  }

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {t('dashboard.inbox.loadError')}
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.inbox.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.inbox.subtitle')}</p>

      {packages.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Boxes className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('dashboard.inbox.empty')}</p>
        </Card>
      ) : (
        <>
          <Card className="mt-6 overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="w-12 px-4 py-3">
                    <span className="sr-only">{t('dashboard.inbox.table.photo')}</span>
                  </th>
                  <th scope="col" className="px-2 py-3">
                    {t('dashboard.inbox.table.photo')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('dashboard.inbox.table.store')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('dashboard.inbox.table.description')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('dashboard.inbox.table.weight')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('dashboard.inbox.table.received')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('dashboard.inbox.table.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {packages.map((pkg) => {
                  const selectable = pkg.status === 'ready'
                  return (
                    <tr key={pkg.id} className="align-middle">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(pkg.id)}
                          disabled={!selectable}
                          onChange={() => toggleSelected(pkg.id)}
                          aria-label={t('dashboard.inbox.selectPackage', { store: pkg.store })}
                          title={selectable ? undefined : t('dashboard.inbox.notReady')}
                          className="h-4 w-4 rounded border-slate/30 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate/5 text-slate/40"
                          aria-hidden="true"
                        >
                          <ImageOff className="h-5 w-5" />
                        </div>
                        <span className="sr-only">{t('dashboard.inbox.noPhoto')}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-navy">{pkg.store}</td>
                      <td className="px-4 py-3 text-slate">{pkg.description}</td>
                      <td className="px-4 py-3 text-slate">{pkg.weightKg} kg</td>
                      <td className="px-4 py-3 text-slate">{pkg.receivedAt.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[pkg.status]}`}
                        >
                          {t(`dashboard.inbox.packageStatus.${pkg.status}`)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleConsolidate}
            >
              {t('dashboard.inbox.consolidate', { count: selectedIds.size })}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
