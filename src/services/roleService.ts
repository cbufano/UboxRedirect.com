/**
 * roleService — leitura dos papéis (app_role) do usuário logado, a partir de
 * `user_roles` (RLS: dono lê os próprios papéis, admin lê todos — ver
 * migration 20260729000001_auth_foundation.sql).
 *
 * Usado só para GATING DE UI (mostrar/esconder o painel /admin) — nunca é a
 * fronteira de segurança real, que é a RLS do Postgres. Por isso
 * `getMyRoles` nunca lança: qualquer falha (sem sessão, erro de rede, RLS
 * negando) vira "sem papéis especiais", o lado seguro para uma checagem que
 * só controla UI — travar a UI inteira porque a checagem de papel falhou
 * seria pior do que simplesmente não mostrar o painel staff.
 */
import { supabase } from '../lib/supabase'

export type AppRole = 'customer' | 'ops' | 'support' | 'admin' | 'super_admin'

interface UserRoleRow {
  role: AppRole
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Papéis que dão acesso ao painel /admin. `support` fica de fora por
 * enquanto: as policies de RLS (packages_insert_staff, packages_update_staff,
 * consolidations_update_own_pending_or_staff) só liberam escrita para
 * ops/admin/super_admin — dar a `support` acesso ao painel mostraria botões
 * de ação (marcar pronto, despachar) que falhariam silenciosamente contra o
 * banco. Quando existir uma visão de suporte só-leitura, isso pode virar um
 * segundo nível de acesso em vez de tudo-ou-nada.
 */
export function isStaffRole(roles: AppRole[]): boolean {
  return roles.includes('ops') || roles.includes('admin') || roles.includes('super_admin')
}

export const roleService = {
  async getMyRoles(): Promise<AppRole[]> {
    try {
      const userId = await currentUserId()
      if (!userId) return []

      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId)
      if (error) return []
      return (data as UserRoleRow[]).map((row) => row.role)
    } catch {
      return []
    }
  },

  async isStaff(): Promise<boolean> {
    const roles = await roleService.getMyRoles()
    return isStaffRole(roles)
  },
}
