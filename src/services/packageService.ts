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
