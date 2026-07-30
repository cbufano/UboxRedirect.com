/**
 * Customers — busca de contas de cliente do painel staff (/admin/customers).
 * Nome, e-mail ou suite → peopleAdminService.searchCustomers → tabela de
 * resultados com badges de suspensão/compliance (só quando fora do default) e
 * link para o perfil completo em /admin/customers/:id, onde vivem as ações
 * (KYC/OFAC, suspensão, notas internas).
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { peopleAdminService, type CustomerSearchResult, type KycStatus, type OfacStatus } from '../../services/peopleAdminService'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

// Badges só aparecem quando o status saiu do default (not_started): verde
// para os estados "bons", âmbar para pendência, vermelho para problema.
const kycBadgeClasses: Record<Exclude<KycStatus, 'not_started'>, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  verified: 'bg-success/10 text-success',
  rejected: 'bg-red-50 text-red-600',
}

const ofacBadgeClasses: Record<Exclude<OfacStatus, 'not_started'>, string> = {
  clear: 'bg-success/10 text-success',
  flagged: 'bg-red-50 text-red-600',
}

export default function Customers() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  // null = nenhuma busca feita ainda (mostra a dica em vez de "vazio").
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setSearchError(false)
    try {
      setResults(await peopleAdminService.searchCustomers(trimmed))
    } catch {
      setSearchError(true)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.customers.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.customers.subtitle')}</p>

      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <Input
              label={t('admin.customers.search.label')}
              id="customerQuery"
              type="text"
              placeholder={t('admin.customers.search.placeholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? t('admin.customers.search.searching') : t('admin.customers.search.submit')}
          </Button>
        </form>
      </Card>

      {searchError ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {t('admin.customers.search.error')}
        </p>
      ) : results === null ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Users className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('admin.customers.search.hint')}</p>
        </Card>
      ) : results.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Users className="h-10 w-10 text-slate/40" aria-hidden="true" />
          <p className="text-sm text-slate/70">{t('admin.customers.search.empty')}</p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                <th scope="col" className="px-4 py-3">
                  {t('admin.customers.table.name')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.customers.table.email')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.customers.table.suite')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.customers.table.country')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('admin.customers.table.flags')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {results.map((customer) => (
                <tr key={customer.userId}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/customers/${customer.userId}`}
                      className="font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">{customer.email}</td>
                  <td className="px-4 py-3 text-slate">{customer.suiteNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-slate">{customer.country}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {customer.suspendedAt !== null && (
                        <span className="inline-block rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                          {t('admin.customers.badges.suspended')}
                        </span>
                      )}
                      {customer.kycStatus !== 'not_started' && (
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${kycBadgeClasses[customer.kycStatus]}`}
                        >
                          {t('admin.customers.badges.kyc', {
                            status: t(`admin.customers.compliance.kycStatuses.${customer.kycStatus}`),
                          })}
                        </span>
                      )}
                      {customer.ofacStatus !== 'not_started' && (
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${ofacBadgeClasses[customer.ofacStatus]}`}
                        >
                          {t('admin.customers.badges.ofac', {
                            status: t(`admin.customers.compliance.ofacStatuses.${customer.ofacStatus}`),
                          })}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
