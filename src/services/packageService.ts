/**
 * packageService — pré-alertas (expected_packages) e pacotes recebidos
 * (packages) do usuário logado. Escrita de `packages` é só da equipe do
 * galpão (RLS bloqueia o cliente); aqui só expomos leitura.
 */
import { supabase } from '../lib/supabase'

export interface ExpectedPackage {
  id: string
  store: string
  trackingNumber: string
  description: string
  declaredValueUsd: number
  status: 'pending' | 'matched' | 'cancelled'
  createdAt: string
}

export interface ReceivedPackage {
  id: string
  store: string
  description: string
  weightKg: number
  status: 'received' | 'in_review' | 'ready' | 'consolidating' | 'shipped' | 'discarded'
  receivedAt: string
}

export interface CreateConsolidationInput {
  recipientName: string
  street: string
  city: string
  stateProvince?: string
  postalCode: string
  country: string
  carrier: string
  chargeableWeightKg: number
  costUsd: number
  contentsDescription: string
  declaredValueUsd: number
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

interface ReceivedPackageRow {
  id: string
  store: string
  description: string
  weight_kg: number
  status: ReceivedPackage['status']
  received_at: string
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

function mapReceivedPackage(row: ReceivedPackageRow): ReceivedPackage {
  return {
    id: row.id,
    store: row.store,
    description: row.description,
    weightKg: row.weight_kg,
    status: row.status,
    receivedAt: row.received_at,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const packageService = {
  async createExpectedPackage(input: {
    store: string
    trackingNumber: string
    description: string
    declaredValueUsd: number
  }): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase.from('expected_packages').insert({
      user_id: userId,
      store: input.store,
      tracking_number: input.trackingNumber,
      description: input.description,
      declared_value_usd: input.declaredValueUsd,
    })
    if (error) throw new Error(error.message)
  },

  async getMyExpectedPackages(): Promise<ExpectedPackage[]> {
    const userId = await currentUserId()
    if (!userId) return []

    const { data, error } = await supabase
      .from('expected_packages')
      .select('id, store, tracking_number, description, declared_value_usd, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as ExpectedPackageRow[]).map(mapExpectedPackage)
  },

  async getMyReceivedPackages(): Promise<ReceivedPackage[]> {
    const userId = await currentUserId()
    if (!userId) return []

    const { data, error } = await supabase
      .from('packages')
      .select('id, store, description, weight_kg, status, received_at')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as ReceivedPackageRow[]).map(mapReceivedPackage)
  },

  /**
   * Cria a consolidação em 'pending' (default da tabela). Não há caminho do
   * cliente para 'paid' nesta fase — isso é Fase 4 (pagamento), ainda não
   * construída; a linha fica honestamente parada em 'pending' até lá.
   */
  async createConsolidation(input: CreateConsolidationInput): Promise<string> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('consolidations')
      .insert({
        user_id: userId,
        recipient_name: input.recipientName,
        street: input.street,
        city: input.city,
        state_province: input.stateProvince ?? '',
        postal_code: input.postalCode,
        country: input.country,
        carrier: input.carrier,
        chargeable_weight_kg: input.chargeableWeightKg,
        cost_usd: input.costUsd,
        contents_description: input.contentsDescription,
        declared_value_usd: input.declaredValueUsd,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  },

  /**
   * Um item por pacote selecionado. O trigger consolidation_items_mark_package
   * (migration Fase 3) já move cada pacote para 'consolidating' — não
   * precisamos atualizar `packages` aqui.
   */
  async addConsolidationItems(consolidationId: string, packageIds: string[]): Promise<void> {
    if (packageIds.length === 0) return

    const { error } = await supabase
      .from('consolidation_items')
      .insert(packageIds.map((packageId) => ({ consolidation_id: consolidationId, package_id: packageId })))
    if (error) throw new Error(error.message)
  },

  async cancelExpectedPackage(id: string): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    // RLS já restringe a linhas do próprio usuário; o .eq('user_id', ...)
    // aqui é defesa em profundidade contra erro de programação.
    const { error } = await supabase
      .from('expected_packages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  },
}
