import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'
import { isStaffRole } from '../services/roleService'

/**
 * Guarda de rota do painel /admin, análoga a ProtectedRoute mas também
 * checando papel.
 *
 * SEGURANÇA: esta checagem é só UX — evita piscar a UI do painel staff para
 * quem não deveria vê-la enquanto a navegação acontece. A fronteira real de
 * segurança são as policies de RLS no Postgres (packages_insert_staff,
 * packages_update_staff, consolidations_update_own_pending_or_staff, etc. —
 * ver migration 20260730000001_packages_consolidation.sql). Mesmo que este
 * componente seja contornado (dev tools, bug, o que for), o Supabase recusa
 * qualquer leitura/escrita de quem não tiver o papel certo no banco. Nunca
 * trate StaffRoute como substituto de RLS.
 */
export function StaffRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const { roles, loading: rolesLoading } = useRole()

  if (authLoading || rolesLoading) {
    return <div className="p-10 text-center text-slate/60">{t('dashboard.loading')}</div>
  }
  if (!user) return <Navigate to="/login" replace />
  // Cliente sem acesso staff volta ao próprio dashboard, não a uma página de
  // erro — é um destino válido para essa conta, só não este.
  if (!isStaffRole(roles)) return <Navigate to="/app" replace />
  return <>{children}</>
}
