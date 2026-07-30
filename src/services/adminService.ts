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
import type { ExpectedPackage } from './packageService'

export interface PaidUnshippedConsolidation {
  id: string
  city: string
  country: string
  paidAt: string
}

export interface StorageOverduePackage {
  id: string
  store: string
  suiteNumber: string | null
  receivedAt: string
}

export interface UnreconciledConsolidation {
  id: string
  city: string
  country: string
  shippedAt: string | null
}

export interface PendingActions {
  awaitingReview: number
  paidUnshipped: PaidUnshippedConsolidation[]
  openDataRequests: number
  storageOverdue: StorageOverduePackage[]
  unreconciled: UnreconciledConsolidation[]
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

export interface ReceivePackageInput {
  userId: string
  store: string
  description: string
  weightKg: number
  expectedPackageId?: string
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  declaredValueUsd?: number
  locationId?: string
}

export interface PackagePhoto {
  id: string
  url: string
}

export interface PackageLocationHistoryEntry {
  id: string
  fromCode: string | null
  toCode: string | null
  movedByName: string
  movedAt: string
}

export interface PackageDetail {
  id: string
  store: string
  description: string
  weightKg: number
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  declaredValueUsd: number
  status: 'received' | 'in_review' | 'ready' | 'consolidating' | 'shipped' | 'discarded'
  receivedAt: string
  userId: string
  customerName: string
  customerSuite: string | null
  locationId: string | null
  locationCode: string | null
  photos: PackagePhoto[]
  history: PackageLocationHistoryEntry[]
}

export interface PaidConsolidationItem {
  packageId: string
  store: string
  description: string
  weightKg: number
  locationId: string | null
  locationCode: string | null
}

export interface PaidConsolidation {
  id: string
  customerName: string
  city: string
  country: string
  declaredValueUsd: number
  carrier: string | null
  trackingCode: string | null
  items: PaidConsolidationItem[]
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

interface ExpectedPackageRow {
  id: string
  store: string
  tracking_number: string
  description: string
  declared_value_usd: number
  status: ExpectedPackage['status']
  created_at: string
}

interface LocationCodeEmbed {
  code: string
}

interface PackageDetailRow {
  id: string
  store: string
  description: string
  weight_kg: number
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  declared_value_usd: number
  status: PackageDetail['status']
  received_at: string
  user_id: string
  location_id: string | null
  warehouse_locations: MaybeArray<LocationCodeEmbed>
  profiles: MaybeArray<ProfileEmbed>
}

interface PackagePhotoRow {
  id: string
  storage_path: string
}

interface PackageLocationHistoryRow {
  id: string
  moved_at: string
  from_location: MaybeArray<LocationCodeEmbed>
  to_location: MaybeArray<LocationCodeEmbed>
  profiles: MaybeArray<{ name: string }>
}

interface PaidConsolidationItemRow {
  packages: MaybeArray<{
    id: string
    store: string
    description: string
    weight_kg: number
    location_id: string | null
    warehouse_locations: MaybeArray<LocationCodeEmbed>
  }>
}

interface PaidUnshippedRow {
  id: string
  city: string
  country: string
  paid_at: string
}

interface StorageOverdueRow {
  id: string
  store: string
  received_at: string
  profiles: MaybeArray<{ suites: MaybeArray<SuiteEmbed> }>
}

interface ShippedConsolidationRow {
  id: string
  city: string
  country: string
  shipped_at: string | null
}

interface PaidConsolidationRow {
  id: string
  city: string
  country: string
  declared_value_usd: number
  carrier: string | null
  tracking_code: string | null
  profiles: MaybeArray<{ name: string }>
  consolidation_items: PaidConsolidationItemRow[] | null
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

function mapExpectedPackage(row: ExpectedPackageRow): ExpectedPackage {
  return {
    id: row.id,
    store: row.store,
    trackingNumber: row.tracking_number,
    description: row.description,
    declaredValueUsd: row.declared_value_usd,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapLocationHistoryEntry(row: PackageLocationHistoryRow): PackageLocationHistoryEntry {
  return {
    id: row.id,
    fromCode: firstOf(row.from_location)?.code ?? null,
    toCode: firstOf(row.to_location)?.code ?? null,
    movedByName: firstOf(row.profiles)?.name ?? '',
    movedAt: row.moved_at,
  }
}

function mapPaidConsolidation(row: PaidConsolidationRow): PaidConsolidation {
  const profile = firstOf(row.profiles)
  const items = (row.consolidation_items ?? []).flatMap((item): PaidConsolidationItem[] => {
    const pkg = firstOf(item.packages)
    if (!pkg) return []
    return [
      {
        packageId: pkg.id,
        store: pkg.store,
        description: pkg.description,
        weightKg: pkg.weight_kg,
        locationId: pkg.location_id,
        locationCode: firstOf(pkg.warehouse_locations)?.code ?? null,
      },
    ]
  })
  return {
    id: row.id,
    customerName: profile?.name ?? '',
    city: row.city,
    country: row.country,
    declaredValueUsd: row.declared_value_usd,
    carrier: row.carrier,
    trackingCode: row.tracking_code,
    items,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const adminService = {
  /**
   * Painel de Pendências: tudo que exige ação do operador numa chamada só.
   * Leituras não filtram por currentUserId — staff enxerga todo mundo via
   * RLS (packages_select_own_or_staff etc.), diferente das leituras "minhas"
   * de packageService/profileService.
   *
   * Os prazos (armazenagem grátis, alerta de pago-sem-envio) vêm da tabela
   * settings (staff pode ler via RLS) — buscada primeiro porque define os
   * cortes de data das demais queries; chave ausente cai no default do seed
   * (30/2 dias) para o painel nunca quebrar.
   *
   * Conciliação: consolidações 'shipped' sem payment 'succeeded' — derivada
   * no código (anti-join client-side) a partir de duas listas, o PostgREST
   * não expressa "not exists" de forma simples.
   */
  async getPendingActions(): Promise<PendingActions> {
    const { data: settingsData, error: settingsError } = await supabase.from('settings').select('key, value')
    if (settingsError) throw new Error(settingsError.message)

    const settings = new Map(((settingsData ?? []) as { key: string; value: string }[]).map((row) => [row.key, row.value]))
    const freeStorageDays = Number(settings.get('free_storage_days') ?? '30')
    const paidUnshippedAlertDays = Number(settings.get('paid_unshipped_alert_days') ?? '2')

    const dayMs = 24 * 60 * 60 * 1000
    const paidCutoff = new Date(Date.now() - paidUnshippedAlertDays * dayMs).toISOString()
    const storageCutoff = new Date(Date.now() - freeStorageDays * dayMs).toISOString()

    const [awaitingResult, paidUnshippedResult, dataRequestsResult, storageResult, shippedResult] = await Promise.all([
      supabase.from('packages').select('id', { count: 'exact', head: true }).in('status', ['received', 'in_review']),
      supabase
        .from('consolidations')
        .select('id, city, country, paid_at')
        .eq('status', 'paid')
        .lt('paid_at', paidCutoff)
        .order('paid_at', { ascending: true }),
      supabase.from('data_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
      supabase
        .from('packages')
        .select('id, store, received_at, profiles (suites (suite_number))')
        .in('status', ['received', 'in_review', 'ready', 'consolidating'])
        .lt('received_at', storageCutoff)
        .order('received_at', { ascending: true }),
      supabase
        .from('consolidations')
        .select('id, city, country, shipped_at')
        .eq('status', 'shipped')
        .order('shipped_at', { ascending: true }),
    ])
    if (awaitingResult.error) throw new Error(awaitingResult.error.message)
    if (paidUnshippedResult.error) throw new Error(paidUnshippedResult.error.message)
    if (dataRequestsResult.error) throw new Error(dataRequestsResult.error.message)
    if (storageResult.error) throw new Error(storageResult.error.message)
    if (shippedResult.error) throw new Error(shippedResult.error.message)

    const shipped = (shippedResult.data ?? []) as ShippedConsolidationRow[]
    let reconciledIds = new Set<string>()
    if (shipped.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('consolidation_id')
        .eq('status', 'succeeded')
        .in(
          'consolidation_id',
          shipped.map((row) => row.id),
        )
      if (paymentsError) throw new Error(paymentsError.message)
      reconciledIds = new Set(((paymentsData ?? []) as { consolidation_id: string }[]).map((row) => row.consolidation_id))
    }

    return {
      awaitingReview: awaitingResult.count ?? 0,
      paidUnshipped: ((paidUnshippedResult.data ?? []) as PaidUnshippedRow[]).map((row) => ({
        id: row.id,
        city: row.city,
        country: row.country,
        paidAt: row.paid_at,
      })),
      openDataRequests: dataRequestsResult.count ?? 0,
      storageOverdue: ((storageResult.data ?? []) as StorageOverdueRow[]).map((row) => {
        const profile = firstOf(row.profiles)
        const suite = profile ? firstOf(profile.suites) : null
        return {
          id: row.id,
          store: row.store,
          suiteNumber: suite?.suite_number ?? null,
          receivedAt: row.received_at,
        }
      }),
      unreconciled: shipped
        .filter((row) => !reconciledIds.has(row.id))
        .map((row) => ({ id: row.id, city: row.city, country: row.country, shippedAt: row.shipped_at })),
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

    // Só transiciona a partir de received/in_review; 0 linhas afetadas
    // (status inesperado ou id inexistente) falha alto em vez de reportar
    // sucesso otimista — mesmo padrão de discardPackage/markConsolidationShipped.
    const { error, data } = await supabase
      .from('packages')
      .update({ status: 'ready' })
      .eq('id', packageId)
      .in('status', ['received', 'in_review'])
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Package is not awaiting review or was not found')
  },

  /**
   * Descarta um pacote que ainda está em revisão. O `.eq('status',
   * 'in_review')` + `.select()` garantem que descartar algo fora de revisão
   * (ou inexistente) falhe alto em vez de silenciosamente não afetar nenhuma
   * linha (padrão anti-otimista de markConsolidationShipped).
   */
  async discardPackage(packageId: string): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('packages')
      .update({ status: 'discarded' })
      .eq('id', packageId)
      .eq('status', 'in_review')
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Package is not in review or was not found')
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

  /**
   * Pré-alertas pendentes de UM cliente, para o match no recebimento (o
   * operador escolhe qual pré-alerta corresponde ao pacote que chegou).
   */
  async getPendingPreAlerts(userId: string): Promise<ExpectedPackage[]> {
    const { data, error } = await supabase
      .from('expected_packages')
      .select('id, store, tracking_number, description, declared_value_usd, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as ExpectedPackageRow[]).map(mapExpectedPackage)
  },

  /**
   * Registra o pacote físico e retorna o id criado (a UI precisa dele para a
   * etiqueta QR). `expected_package_id` aciona o trigger de match do
   * pré-alerta; `location_id` endereça o pacote já no recebimento. Campos
   * opcionais só entram no INSERT quando informados — os defaults do banco
   * (declared_value_usd 0, dimensões null) cobrem o resto.
   */
  async receivePackage(input: ReceivePackageInput): Promise<string> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const payload: Record<string, unknown> = {
      user_id: input.userId,
      store: input.store,
      description: input.description,
      weight_kg: input.weightKg,
    }
    if (input.expectedPackageId != null) payload.expected_package_id = input.expectedPackageId
    if (input.lengthCm != null) payload.length_cm = input.lengthCm
    if (input.widthCm != null) payload.width_cm = input.widthCm
    if (input.heightCm != null) payload.height_cm = input.heightCm
    if (input.declaredValueUsd != null) payload.declared_value_usd = input.declaredValueUsd
    if (input.locationId != null) payload.location_id = input.locationId

    const { data, error } = await supabase.from('packages').insert(payload).select('id').single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  },

  /**
   * Sobe a foto para o bucket privado e registra em package_photos. O caminho
   * é OBRIGATORIAMENTE `<user_id>/<package_id>/<arquivo>` — a policy de
   * INSERT do Storage (migration Fase 3) valida os dois primeiros segmentos
   * contra o dono real do pacote, então buscamos o user_id primeiro.
   */
  async uploadPackagePhoto(packageId: string, file: File): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('user_id')
      .eq('id', packageId)
      .single()
    if (pkgError) throw new Error(pkgError.message)

    const storagePath = `${(pkg as { user_id: string }).user_id}/${packageId}/${file.name}`
    const { error: uploadError } = await supabase.storage.from('package-photos').upload(storagePath, file)
    if (uploadError) throw new Error(uploadError.message)

    const { error } = await supabase
      .from('package_photos')
      .insert({ package_id: packageId, storage_path: storagePath })
    if (error) throw new Error(error.message)
  },

  /**
   * Ficha completa do pacote (destino do QR da etiqueta): dados + cliente,
   * fotos com URLs assinadas (1h) e trilha de movimentação com os códigos
   * das posições (embed desambiguado pelas duas FKs para
   * warehouse_locations).
   */
  async getPackageDetail(id: string): Promise<PackageDetail> {
    const [pkgResult, photosResult, historyResult] = await Promise.all([
      supabase
        .from('packages')
        .select(
          'id, store, description, weight_kg, length_cm, width_cm, height_cm, declared_value_usd, status, received_at, user_id, location_id, warehouse_locations (code), profiles (name, suites (suite_number))',
        )
        .eq('id', id)
        .single(),
      supabase.from('package_photos').select('id, storage_path').eq('package_id', id).order('created_at', { ascending: true }),
      supabase
        .from('package_location_history')
        .select(
          'id, moved_at, from_location:warehouse_locations!from_location_id (code), to_location:warehouse_locations!to_location_id (code), profiles (name)',
        )
        .eq('package_id', id)
        .order('moved_at', { ascending: false }),
    ])
    if (pkgResult.error) throw new Error(pkgResult.error.message)
    if (photosResult.error) throw new Error(photosResult.error.message)
    if (historyResult.error) throw new Error(historyResult.error.message)

    const photos = await Promise.all(
      (photosResult.data as PackagePhotoRow[]).map(async (photo): Promise<PackagePhoto> => {
        const { data, error } = await supabase.storage.from('package-photos').createSignedUrl(photo.storage_path, 3600)
        if (error) throw new Error(error.message)
        return { id: photo.id, url: (data as { signedUrl: string }).signedUrl }
      }),
    )

    const row = pkgResult.data as PackageDetailRow
    const profile = firstOf(row.profiles)
    const suite = profile ? firstOf(profile.suites) : null
    return {
      id: row.id,
      store: row.store,
      description: row.description,
      weightKg: row.weight_kg,
      lengthCm: row.length_cm,
      widthCm: row.width_cm,
      heightCm: row.height_cm,
      declaredValueUsd: row.declared_value_usd,
      status: row.status,
      receivedAt: row.received_at,
      userId: row.user_id,
      customerName: profile?.name ?? '',
      customerSuite: suite?.suite_number ?? null,
      locationId: row.location_id,
      locationCode: firstOf(row.warehouse_locations)?.code ?? null,
      photos,
      history: (historyResult.data as PackageLocationHistoryRow[]).map(mapLocationHistoryEntry),
    }
  },

  /**
   * Fila de expedição real: só consolidações PAGAS entram, com os itens (e o
   * código da posição de cada pacote) para montar a lista de coleta no
   * galpão. O embed aninhado consolidation_items → packages →
   * warehouse_locations resolve via FKs diretas (packages.location_id).
   */
  async getPaidConsolidations(): Promise<PaidConsolidation[]> {
    const { data, error } = await supabase
      .from('consolidations')
      .select(
        'id, city, country, declared_value_usd, carrier, tracking_code, profiles (name), consolidation_items ( packages (id, store, description, weight_kg, location_id, warehouse_locations (code)) )',
      )
      .eq('status', 'paid')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as PaidConsolidationRow[]).map(mapPaidConsolidation)
  },

  /**
   * Só transiciona a partir de 'paid' — o `.eq('status', 'paid')` +
   * `.select()` garantem que expedir algo não pago (ou já expedido) falhe
   * alto em vez de silenciosamente não afetar nenhuma linha.
   */
  async markConsolidationShipped(id: string, input: MarkShippedInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('consolidations')
      .update({
        carrier: input.carrier,
        tracking_code: input.trackingCode,
        status: 'shipped',
        shipped_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'paid')
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Consolidation is not paid or was not found')
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
