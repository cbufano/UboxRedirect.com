import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Boxes, ImageOff } from 'lucide-react'
import { packages, type Package as PackageRecord } from '../../mocks/packages'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

const packageStatusClasses: Record<PackageRecord['status'], string> = {
  in_box: 'bg-slate/10 text-slate',
  ready: 'bg-success/10 text-success',
}

export default function Inbox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="align-middle">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pkg.id)}
                        onChange={() => toggleSelected(pkg.id)}
                        aria-label={t('dashboard.inbox.selectPackage', { store: pkg.store })}
                        className="h-4 w-4 rounded border-slate/30 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
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
                    <td className="px-4 py-3 text-slate">{pkg.receivedDate}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${packageStatusClasses[pkg.status]}`}
                      >
                        {t(`dashboard.inbox.packageStatus.${pkg.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
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
