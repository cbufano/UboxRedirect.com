/**
 * Staff — gestão de papéis de usuário + log de auditoria (/admin/staff).
 * Lista todos os usuários com badges de papel, busca client-side e troca de
 * papel via peopleAdminService.setUserRole (RPC set_user_role). O gate de
 * papel aqui é só UI (useRole): ops vê apenas o aviso "somente admins" — quem
 * barra de verdade é o banco (o RPC valida chamador, auto-mudança e escalada
 * admin; audit_log só é legível por admin/super_admin via RLS).
 *
 * Exceção deliberada ao padrão de erro genérico: as mensagens do RPC
 * ("Only admins can manage roles", "You cannot change your own role",
 * "Only a super admin can grant or revoke admin roles") são intencionais e
 * amigáveis — exibidas literalmente, com fallback genérico só para falhas
 * sem mensagem.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserCog, FileClock } from 'lucide-react'
import { peopleAdminService, type UserWithRoles, type AuditLogEntry } from '../../services/peopleAdminService'
import type { AppRole } from '../../services/roleService'
import { useRole } from '../../contexts/RoleContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const ALL_ROLES: readonly AppRole[] = ['customer', 'ops', 'support', 'admin', 'super_admin']
const ADMIN_ROLES: readonly AppRole[] = ['admin', 'super_admin']

// Cores por papel: cliente cinza (neutro), operação azul, suporte azul claro,
// admin âmbar (cor da área staff), super_admin vermelho (máximo privilégio).
const roleBadgeClasses: Record<AppRole, string> = {
  customer: 'bg-slate/10 text-slate/70',
  ops: 'bg-blue-600/10 text-blue-700',
  support: 'bg-sky-400/15 text-sky-600',
  admin: 'bg-amber-500/10 text-amber-600',
  super_admin: 'bg-red-50 text-red-600',
}

/** Papel staff atual do usuário (no máximo um, modelo do set_user_role). */
function staffRoleOf(user: UserWithRoles): AppRole {
  return user.roles.find((role) => role !== 'customer') ?? 'customer'
}

/** Resumo do detail para a tabela de auditoria: JSON truncado em ~80 chars. */
function summarizeDetail(detail: Record<string, unknown>): string {
  const text = JSON.stringify(detail)
  if (!text || text === '{}') return '—'
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

export default function Staff() {
  const { t, i18n } = useTranslation()
  const { roles } = useRole()
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')

  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState(false)

  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState(false)

  const [query, setQuery] = useState('')

  // Troca de papel: uma operação por vez, com confirmação inline quando o
  // papel atual OU o novo envolve admin/super_admin.
  const [selectedRoles, setSelectedRoles] = useState<Record<string, AppRole>>({})
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null)
  const [applyingUserId, setApplyingUserId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<{ userId: string; message: string } | null>(null)
  const [roleSuccess, setRoleSuccess] = useState(false)

  useEffect(() => {
    // Sem papel de admin não há o que buscar: a RLS negaria audit_log e a
    // tela mostra só o aviso — evitamos as chamadas inúteis.
    if (!isAdmin) return
    let active = true

    setUsersLoading(true)
    setUsersError(false)
    peopleAdminService
      .listUsersWithRoles()
      .then((data) => {
        if (active) setUsers(data)
      })
      .catch(() => {
        if (active) setUsersError(true)
      })
      .finally(() => {
        if (active) setUsersLoading(false)
      })

    setAuditLoading(true)
    setAuditError(false)
    peopleAdminService
      .getAuditLog(100)
      .then((data) => {
        if (active) setAudit(data)
      })
      .catch(() => {
        if (active) setAuditError(true)
      })
      .finally(() => {
        if (active) setAuditLoading(false)
      })

    return () => {
      active = false
    }
  }, [isAdmin])

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (user) => user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term),
    )
  }, [users, query])

  const selectedRoleFor = (user: UserWithRoles): AppRole => selectedRoles[user.userId] ?? staffRoleOf(user)

  const involvesAdmin = (user: UserWithRoles, newRole: AppRole): boolean =>
    ADMIN_ROLES.includes(newRole) || user.roles.some((role) => ADMIN_ROLES.includes(role))

  const applyRole = async (user: UserWithRoles) => {
    const newRole = selectedRoleFor(user)
    setConfirmingUserId(null)
    setRoleError(null)
    setRoleSuccess(false)
    setApplyingUserId(user.userId)
    try {
      await peopleAdminService.setUserRole(user.userId, newRole)
      setUsers(await peopleAdminService.listUsersWithRoles())
      // Limpa a seleção da linha: o select volta a refletir o papel recarregado.
      setSelectedRoles((previous) => {
        const next = { ...previous }
        delete next[user.userId]
        return next
      })
      setRoleSuccess(true)
    } catch (error) {
      // Mensagens do RPC exibidas literalmente (ver comentário do módulo).
      setRoleError({
        userId: user.userId,
        message: error instanceof Error && error.message ? error.message : t('admin.staff.role.error'),
      })
    } finally {
      setApplyingUserId(null)
    }
  }

  const handleApplyClick = (user: UserWithRoles) => {
    setRoleError(null)
    setRoleSuccess(false)
    if (involvesAdmin(user, selectedRoleFor(user))) {
      setConfirmingUserId(user.userId)
      return
    }
    void applyRole(user)
  }

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy">{t('admin.staff.title')}</h1>
        <Card className="mt-6">
          <p className="text-sm text-slate/70">{t('admin.staff.adminsOnly')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.staff.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.staff.subtitle')}</p>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
          <UserCog className="h-5 w-5 text-brand" aria-hidden="true" />
          {t('admin.staff.usersTitle')}
        </h2>

        <div className="mt-3 w-full max-w-sm">
          <Input
            label={t('admin.staff.search.label')}
            id="staffQuery"
            type="text"
            placeholder={t('admin.staff.search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {usersLoading ? (
          <p className="mt-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : usersError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.staff.loadError')}
          </p>
        ) : filteredUsers.length === 0 ? (
          <p className="mt-4 text-sm text-slate/60">{t('admin.staff.search.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.table.name')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.table.email')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.table.roles')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.table.changeRole')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {filteredUsers.map((user) => (
                  <tr key={user.userId} className="align-top">
                    <td className="px-4 py-3 font-medium text-navy">{user.name}</td>
                    <td className="px-4 py-3 text-slate">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadgeClasses[role]}`}
                          >
                            {t(`admin.staff.roles.${role}`)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={t('admin.staff.role.selectLabel', { name: user.name })}
                          value={selectedRoleFor(user)}
                          disabled={applyingUserId !== null}
                          onChange={(event) => {
                            const role = event.target.value as AppRole
                            setSelectedRoles((previous) => ({ ...previous, [user.userId]: role }))
                            setConfirmingUserId(null)
                          }}
                          className="rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {ALL_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`admin.staff.roles.${role}`)}
                            </option>
                          ))}
                        </select>
                        {confirmingUserId !== user.userId && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={applyingUserId !== null}
                            onClick={() => handleApplyClick(user)}
                          >
                            {applyingUserId === user.userId
                              ? t('admin.staff.role.applying')
                              : t('admin.staff.role.apply')}
                          </Button>
                        )}
                      </div>

                      {confirmingUserId === user.userId && (
                        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                          <p className="text-xs text-amber-700">{t('admin.staff.role.confirmHint')}</p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={applyingUserId !== null}
                              onClick={() => void applyRole(user)}
                            >
                              {t('admin.staff.role.confirm')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmingUserId(null)}
                            >
                              {t('admin.staff.role.cancel')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {roleError?.userId === user.userId && (
                        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                          {roleError.message}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {roleSuccess && (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {t('admin.staff.role.success')}
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
          <FileClock className="h-5 w-5 text-brand" aria-hidden="true" />
          {t('admin.staff.audit.title')}
        </h2>
        <p className="mt-1 text-sm text-slate/70">{t('admin.staff.audit.hint')}</p>

        {auditLoading ? (
          <p className="mt-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : auditError ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.staff.audit.loadError')}
          </p>
        ) : audit.length === 0 ? (
          <p className="mt-4 text-sm text-slate/60">{t('admin.staff.audit.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.audit.table.when')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.audit.table.actor')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.audit.table.action')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.audit.table.entity')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.staff.audit.table.detail')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate">
                      {new Date(entry.createdAt).toLocaleString(i18n.language)}
                    </td>
                    <td className="px-4 py-3 text-slate">{entry.actorName}</td>
                    <td className="px-4 py-3 font-medium text-navy">{entry.action}</td>
                    <td className="px-4 py-3 text-slate">{entry.entity}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate/70">{summarizeDetail(entry.detail)}</td>
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
