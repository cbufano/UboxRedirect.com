/**
 * peopleAdminService — gestão de contas do painel staff (Fase 7.3): busca de
 * clientes, perfil completo com listas curtas, notas internas, suspensão de
 * conta, papéis de usuário e log de auditoria. Espelha as convenções de
 * adminService/financeAdminService (currentUserId local, mapeamento para
 * camelCase, `throw new Error(error.message)`, anti-0-linhas com `.select()`,
 * `firstOf` para embeds).
 *
 * Autorização é decidida pelo banco: customer_notes_* exigem staff (e
 * author_id = auth.uid() no INSERT); suspended_at é protegida por trigger
 * (protect_profile_suspension); set_user_role valida papel do chamador,
 * auto-mudança e escalada admin no próprio RPC; audit_log só é legível por
 * admin/super_admin e é gravado por TRIGGERS no banco — este módulo nunca
 * insere em audit_log (ver migration 20260731000005_people_audit.sql).
 */
import { supabase } from '../lib/supabase'
import type { AppRole } from './roleService'

export type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected'
export type OfacStatus = 'not_started' | 'clear' | 'flagged'

export interface CustomerSearchResult {
  userId: string
  name: string
  email: string
  country: string
  suiteNumber: string | null
  suspendedAt: string | null
  kycStatus: KycStatus
  ofacStatus: OfacStatus
}

export interface CustomerLivePackage {
  id: string
  store: string
  status: 'received' | 'in_review' | 'ready' | 'consolidating'
}

export interface CustomerConsolidationSummary {
  id: string
  status: string
  city: string
  country: string
}

export interface CustomerPaymentSummary {
  id: string
  amountUsd: number
  provider: string
  status: string
}

export interface CustomerDataRequestSummary {
  id: string
  kind: 'export' | 'delete'
  status: 'pending' | 'processing' | 'completed' | 'rejected'
}

export interface CustomerNote {
  id: string
  note: string
  authorName: string
  createdAt: string
}

export interface CustomerProfileDetail extends CustomerSearchResult {
  packages: CustomerLivePackage[]
  consolidations: CustomerConsolidationSummary[]
  payments: CustomerPaymentSummary[]
  dataRequests: CustomerDataRequestSummary[]
  notes: CustomerNote[]
}

export interface UserWithRoles {
  userId: string
  name: string
  email: string
  roles: AppRole[]
}

export interface AuditLogEntry {
  id: string
  actorName: string
  action: string
  entity: string
  entityId: string | null
  detail: Record<string, unknown>
  createdAt: string
}

type MaybeArray<T> = T | T[] | null

interface CustomerProfileEmbed {
  name: string
  email: string
  country: string
  suspended_at: string | null
  kyc_status: KycStatus
  ofac_screening_status: OfacStatus
}

interface SuiteSearchRow {
  user_id: string
  suite_number: string
  profiles: MaybeArray<CustomerProfileEmbed>
}

interface ProfileSearchRow {
  id: string
  name: string
  email: string
  country: string
  suspended_at: string | null
  kyc_status: KycStatus
  ofac_screening_status: OfacStatus
  suites: MaybeArray<{ suite_number: string }>
}

interface CustomerNoteRow {
  id: string
  note: string
  created_at: string
  author: MaybeArray<{ name: string }>
}

interface UserRoleRow {
  user_id: string
  role: AppRole
}

interface AuditLogRow {
  id: string
  action: string
  entity: string
  entity_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
  profiles: MaybeArray<{ name: string }>
}

/** Mesmo tratamento de embeds objeto-ou-array de adminService.firstOf. */
function firstOf<T>(value: MaybeArray<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapSuiteSearchRow(row: SuiteSearchRow): CustomerSearchResult {
  const profile = firstOf(row.profiles)
  return {
    userId: row.user_id,
    name: profile?.name ?? '',
    email: profile?.email ?? '',
    country: profile?.country ?? '',
    suiteNumber: row.suite_number,
    suspendedAt: profile?.suspended_at ?? null,
    kycStatus: profile?.kyc_status ?? 'not_started',
    ofacStatus: profile?.ofac_screening_status ?? 'not_started',
  }
}

function mapProfileSearchRow(row: ProfileSearchRow): CustomerSearchResult {
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    country: row.country,
    suiteNumber: firstOf(row.suites)?.suite_number ?? null,
    suspendedAt: row.suspended_at,
    kycStatus: row.kyc_status,
    ofacStatus: row.ofac_screening_status,
  }
}

function mapCustomerNote(row: CustomerNoteRow): CustomerNote {
  return {
    id: row.id,
    note: row.note,
    authorName: firstOf(row.author)?.name ?? '',
    createdAt: row.created_at,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const peopleAdminService = {
  /**
   * Busca de clientes por suite, nome ou e-mail (staff enxerga todo mundo via
   * RLS, mesma convenção de adminService). Query no formato de suite
   * (`BUF-...`) tenta o match EXATO em suites primeiro (ilike sem % = exato
   * case-insensitive) e só cai para nome/e-mail se a suite não existir.
   *
   * Vírgulas e parênteses são removidos do termo antes de montar o `.or()` —
   * o PostgREST usa esses caracteres como sintaxe do filtro, então mantê-los
   * quebraria (ou pior, redefiniria) a query.
   */
  async searchCustomers(query: string): Promise<CustomerSearchResult[]> {
    const trimmed = query.trim()
    if (!trimmed) return []

    if (/^BUF-/i.test(trimmed)) {
      const { data, error } = await supabase
        .from('suites')
        .select('user_id, suite_number, profiles (name, email, country, suspended_at, kyc_status, ofac_screening_status)')
        .ilike('suite_number', trimmed)
        .limit(20)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as SuiteSearchRow[]
      if (rows.length > 0) return rows.map(mapSuiteSearchRow)
    }

    const sanitized = trimmed.replace(/[,()]/g, '')
    if (!sanitized) return []

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, country, suspended_at, kyc_status, ofac_screening_status, suites (suite_number)')
      .or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
      .limit(20)
    if (error) throw new Error(error.message)
    return ((data ?? []) as ProfileSearchRow[]).map(mapProfileSearchRow)
  },

  /**
   * Ficha completa do cliente: perfil + listas curtas (até 10, mais recentes
   * primeiro) de pacotes vivos (fora de shipped/discarded), consolidações,
   * pagamentos e pedidos LGPD, mais TODAS as notas internas (o embed de
   * customer_notes é desambiguado pela FK author_id — a tabela tem duas FKs
   * para profiles).
   */
  async getCustomerProfile(userId: string): Promise<CustomerProfileDetail> {
    const [profileResult, packagesResult, consolidationsResult, paymentsResult, dataRequestsResult, notesResult] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, email, country, suspended_at, kyc_status, ofac_screening_status, suites (suite_number)')
          .eq('id', userId)
          .single(),
        supabase
          .from('packages')
          .select('id, store, status')
          .eq('user_id', userId)
          .in('status', ['received', 'in_review', 'ready', 'consolidating'])
          .order('received_at', { ascending: false })
          .limit(10),
        supabase
          .from('consolidations')
          .select('id, status, city, country')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('payments')
          .select('id, amount_usd, provider, status')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('data_requests')
          .select('id, kind, status')
          .eq('user_id', userId)
          .order('requested_at', { ascending: false })
          .limit(10),
        supabase
          .from('customer_notes')
          .select('id, note, created_at, author:profiles!author_id (name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])
    if (profileResult.error) throw new Error(profileResult.error.message)
    if (packagesResult.error) throw new Error(packagesResult.error.message)
    if (consolidationsResult.error) throw new Error(consolidationsResult.error.message)
    if (paymentsResult.error) throw new Error(paymentsResult.error.message)
    if (dataRequestsResult.error) throw new Error(dataRequestsResult.error.message)
    if (notesResult.error) throw new Error(notesResult.error.message)

    const profile = mapProfileSearchRow(profileResult.data as ProfileSearchRow)
    return {
      ...profile,
      packages: ((packagesResult.data ?? []) as { id: string; store: string; status: CustomerLivePackage['status'] }[]).map(
        (row) => ({ id: row.id, store: row.store, status: row.status }),
      ),
      consolidations: ((consolidationsResult.data ?? []) as { id: string; status: string; city: string; country: string }[]).map(
        (row) => ({ id: row.id, status: row.status, city: row.city, country: row.country }),
      ),
      payments: ((paymentsResult.data ?? []) as { id: string; amount_usd: number; provider: string; status: string }[]).map(
        (row) => ({ id: row.id, amountUsd: row.amount_usd, provider: row.provider, status: row.status }),
      ),
      dataRequests: (
        (dataRequestsResult.data ?? []) as { id: string; kind: CustomerDataRequestSummary['kind']; status: CustomerDataRequestSummary['status'] }[]
      ).map((row) => ({ id: row.id, kind: row.kind, status: row.status })),
      notes: ((notesResult.data ?? []) as CustomerNoteRow[]).map(mapCustomerNote),
    }
  },

  /**
   * Nota interna sobre o cliente. A policy customer_notes_insert_staff exige
   * staff E author_id = auth.uid(), por isso o author_id vai explícito no
   * payload. Nota vazia falha ANTES de tocar o banco.
   */
  async addCustomerNote(userId: string, note: string): Promise<void> {
    const trimmed = note.trim()
    if (!trimmed) throw new Error('Note cannot be empty')

    const authorId = await currentUserId()
    if (!authorId) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('customer_notes')
      .insert({ user_id: userId, author_id: authorId, note: trimmed })
    if (error) throw new Error(error.message)
  },

  /**
   * Suspende/reativa a conta. A coluna é protegida por trigger no banco
   * (protect_profile_suspension: só staff/service_role mudam de fato) e a
   * mudança é auditada por trigger. Anti-0-linhas: id inexistente (ou RLS
   * negando) falha alto em vez de reportar sucesso otimista.
   */
  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('profiles')
      .update({ suspended_at: suspended ? new Date().toISOString() : null })
      .eq('id', userId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Profile was not found')
  },

  /**
   * Todos os usuários com seus papéis, agregados por usuário no código (o
   * PostgREST devolve uma linha por papel). Todo usuário tem a base
   * 'customer'; staff tem no máximo um papel extra (modelo do set_user_role).
   * Ordenado por nome para a tela de staff.
   *
   * user_roles NÃO tem FK para profiles (a FK aponta para auth.users), então
   * um embed `profiles (...)` é impossível (PostgREST 400/PGRST200) — nome e
   * e-mail vêm de uma segunda consulta em profiles, juntada client-side.
   */
  async listUsersWithRoles(): Promise<UserWithRoles[]> {
    const { data, error } = await supabase.from('user_roles').select('user_id, role')
    if (error) throw new Error(error.message)

    const roleRows = (data ?? []) as UserRoleRow[]
    const ids = [...new Set(roleRows.map((row) => row.user_id))]

    const profilesById = new Map<string, { name: string; email: string }>()
    if (ids.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ids)
      if (profilesError) throw new Error(profilesError.message)
      for (const profile of (profilesData ?? []) as { id: string; name: string; email: string }[]) {
        profilesById.set(profile.id, { name: profile.name, email: profile.email })
      }
    }

    const byUser = new Map<string, UserWithRoles>()
    for (const row of roleRows) {
      const existing = byUser.get(row.user_id)
      if (existing) {
        existing.roles.push(row.role)
      } else {
        const profile = profilesById.get(row.user_id)
        byUser.set(row.user_id, {
          userId: row.user_id,
          name: profile?.name ?? '',
          email: profile?.email ?? '',
          roles: [row.role],
        })
      }
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
  },

  /**
   * Troca o papel de um usuário via RPC set_user_role — TODAS as regras
   * (só admin chama, ninguém muda o próprio papel, mexer em admin exige
   * super_admin, base 'customer' preservada) vivem no banco; as mensagens de
   * erro do RPC são intencionais e amigáveis, por isso repassadas como estão.
   */
  async setUserRole(userId: string, role: AppRole): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { error } = await supabase.rpc('set_user_role', { _target: userId, _new_role: role })
    if (error) throw new Error(error.message)
  },

  /**
   * Últimos eventos do log de auditoria imutável (gravado por triggers no
   * banco), mais recentes primeiro, com o nome do ator via embed. Ator nulo
   * (escritas de service_role — webhooks/functions) vira 'system'.
   */
  async getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, detail, created_at, profiles (name)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return ((data ?? []) as AuditLogRow[]).map((row) => ({
      id: row.id,
      actorName: firstOf(row.profiles)?.name ?? 'system',
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      detail: row.detail ?? {},
      createdAt: row.created_at,
    }))
  },
}
