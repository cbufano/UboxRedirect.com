/**
 * adminService — leituras e escritas do painel staff (ops/admin). Espelha as
 * convenções de packageService/profileService (currentUserId local, mapeamento
 * para camelCase, `throw new Error(error.message)` em erro de Supabase).
 *
 * Toda escrita aqui só é aceita de fato para quem tem o papel certo — quem
 * decide é a RLS (packages_insert_staff, packages_update_staff,
 * consolidations_update_own_pending_or_staff, ver migration Fase 3); este
 * módulo só monta a chamada e falha cedo com uma mensagem clara quando não
 * há sessão nenhuma.
 */
import { supabase } from '../lib/supabase'

export interface OpsStats {
  awaitingReview: number
  pendingConsolidations: number
  openPreAlerts: number
}

export interface PackageNeedingReview {
  id: string
  store: string
  description: string
  weightKg: number
  status: 'received' | 'in_review'
  customerName: string
  customerSuite: string | null
}

export interface PendingConsolidation {
  id: string
  customerName: string
  city: string
  country: string
  declaredValueUsd: number
  carrier: string | null
  trackingCode: string | null
}

export interface ReceivePackageInput {
  userId: string
  store: string
  description: string
  weightKg: number
}

export interface MarkShippedInput {
  carrier: string
  trackingCode: string
}

export interface CustomerLookup {
  userId: string
  name: string
  kycStatus: 'not_started' | 'pending' | 'verified' | 'rejected'
  ofacStatus: 'not_started' | 'clear' | 'flagged'
}

export interface AdminDataRequest {
  id: string
  kind: 'export' | 'delete'
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  requestNote: string
  resolutionNotes: string
  requestedAt: string
  customerName: string
  customerEmail: string
}

export interface ResolveDataRequestInput {
  status: 'completed' | 'rejected'
  resolutionNotes: string
}

type MaybeArray<T> = T | T[] | null

interface SuiteEmbed {
  suite_number: string
}

interface ProfileEmbed {
  name: string
  suites: MaybeArray<SuiteEmbed>
}

interface ComplianceProfileEmbed {
  name: string
  kyc_status: 'not_started' | 'pending' | 'verified' | 'rejected'
  ofac_screening_status: 'not_started' | 'clear' | 'flagged'
}

interface AdminDataRequestRow {
  id: string
  kind: AdminDataRequest['kind']
  status: AdminDataRequest['status']
  request_note: string
  resolution_notes: string
  requested_at: string
  profiles: MaybeArray<{ name: string; email: string }>
}

interface PackageNeedingReviewRow {
  id: string
  store: string
  description: string
  weight_kg: number
  status: PackageNeedingReview['status']
  profiles: MaybeArray<ProfileEmbed>
}

interface PendingConsolidationRow {
  id: string
  city: string
  country: string
  declared_value_usd: number
  carrier: string | null
  tracking_code: string | null
  profiles: MaybeArray<{ name: string }>
}

/**
 * Embeds do PostgREST podem vir como objeto único ou array de um elemento
 * dependendo de como a relação é inferida — mesmo comportamento tratado em
 * profileService.mapProfile para `suites`. Centralizado aqui para reuso.
 */
function firstOf<T>(value: MaybeArray<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapPackageNeedingReview(row: PackageNeedingReviewRow): PackageNeedingReview {
  const profile = firstOf(row.profiles)
  const suite = profile ? firstOf(profile.suites) : null
  return {
    id: row.id,
    store: row.store,
    description: row.description,
    weightKg: row.weight_kg,
    status: row.status,
    customerName: profile?.name ?? '',
    customerSuite: suite?.suite_number ?? null,
  }
}

function mapAdminDataRequest(row: AdminDataRequestRow): AdminDataRequest {
  const profile = firstOf(row.profiles)
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    requestNote: row.request_note,
    resolutionNotes: row.resolution_notes,
    requestedAt: row.requested_at,
    customerName: profile?.name ?? '',
    customerEmail: profile?.email ?? '',
  }
}

function mapPendingConsolidation(row: PendingConsolidationRow): PendingConsolidation {
  const profile = firstOf(row.profiles)
  return {
    id: row.id,
    customerName: profile?.name ?? '',
    city: row.city,
    country: row.country,
    declaredValueUsd: row.declared_value_usd,
    carrier: row.carrier,
    trackingCode: row.tracking_code,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const adminService = {
  /**
   * Leituras não filtram por currentUserId — staff enxerga todo mundo via
   * RLS (packages_select_own_or_staff etc.), diferente das leituras "minhas"
   * de packageService/profileService.
   */
  async getOpsStats(): Promise<OpsStats> {
    const [packagesResult, consolidationsResult, expectedResult] = await Promise.all([
      supabase.from('packages').select('id', { count: 'exact', head: true }).in('status', ['received', 'in_review']),
      supabase.from('consolidations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('expected_packages').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    if (packagesResult.error) throw new Error(packagesResult.error.message)
    if (consolidationsResult.error) throw new Error(consolidationsResult.error.message)
    if (expectedResult.error) throw new Error(expectedResult.error.message)

    return {
      awaitingReview: packagesResult.count ?? 0,
      pendingConsolidations: consolidationsResult.count ?? 0,
      openPreAlerts: expectedResult.count ?? 0,
    }
  },

  async getPackagesNeedingReview(): Promise<PackageNeedingReview[]> {
    const { data, error } = await supabase
      .from('packages')
      .select('id, store, description, weight_kg, status, profiles (name, suites (suite_number))')
      .in('status', ['received', 'in_review'])
      .order('received_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as PackageNeedingReviewRow[]).map(mapPackageNeedingReview)
  },

  async markPackageReady(packageId: string): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase.from('packages').update({ status: 'ready' }).eq('id', packageId)
    if (error) throw new Error(error.message)
  },

  /**
   * Localiza o dono de uma suite para preencher `packages.user_id` no
   * recebimento. Também traz kyc_status/ofac_screening_status junto (mesma
   * consulta, sem round-trip extra) para exibir na etapa de confirmação do
   * recebimento e permitir staff editar compliance ali mesmo.
   */
  async findUserBySuite(suiteNumber: string): Promise<CustomerLookup | null> {
    const { data, error } = await supabase
      .from('suites')
      .select('user_id, profiles (name, kyc_status, ofac_screening_status)')
      .eq('suite_number', suiteNumber)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const row = data as { user_id: string; profiles: MaybeArray<ComplianceProfileEmbed> }
    const profile = firstOf(row.profiles)
    return {
      userId: row.user_id,
      name: profile?.name ?? '',
      kycStatus: profile?.kyc_status ?? 'not_started',
      ofacStatus: profile?.ofac_screening_status ?? 'not_started',
    }
  },

  async receivePackage(input: ReceivePackageInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase.from('packages').insert({
      user_id: input.userId,
      store: input.store,
      description: input.description,
      weight_kg: input.weightKg,
    })
    if (error) throw new Error(error.message)
  },

  async getPendingConsolidations(): Promise<PendingConsolidation[]> {
    const { data, error } = await supabase
      .from('consolidations')
      .select('id, city, country, declared_value_usd, carrier, tracking_code, profiles (name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as PendingConsolidationRow[]).map(mapPendingConsolidation)
  },

  async markConsolidationShipped(id: string, input: MarkShippedInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('consolidations')
      .update({
        carrier: input.carrier,
        tracking_code: input.trackingCode,
        status: 'shipped',
        shipped_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  /** Pedidos LGPD/GDPR ainda em aberto (pending/processing), para a fila de atendimento do staff. */
  async getOpenDataRequests(): Promise<AdminDataRequest[]> {
    const { data, error } = await supabase
      .from('data_requests')
      .select('id, kind, status, request_note, resolution_notes, requested_at, profiles (name, email)')
      .in('status', ['pending', 'processing'])
      .order('requested_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as AdminDataRequestRow[]).map(mapAdminDataRequest)
  },

  /**
   * Marca um pedido como concluído ou rejeitado. `completed_at` é setado no
   * client (ISO string), mesmo padrão de `shipped_at` em
   * markConsolidationShipped acima — aceitável nesta fase, sem função de
   * banco dedicada.
   */
  async resolveDataRequest(id: string, input: ResolveDataRequestInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('data_requests')
      .update({
        status: input.status,
        resolution_notes: input.resolutionNotes,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  /** Colunas staff-only protegidas por trigger + GRANT (ver migration Fase 5). */
  async setKycStatus(userId: string, status: 'pending' | 'verified' | 'rejected'): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { error } = await supabase.from('profiles').update({ kyc_status: status }).eq('id', userId)
    if (error) throw new Error(error.message)
  },

  async setOfacStatus(userId: string, status: 'clear' | 'flagged'): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { error } = await supabase.from('profiles').update({ ofac_screening_status: status }).eq('id', userId)
    if (error) throw new Error(error.message)
  },
}
