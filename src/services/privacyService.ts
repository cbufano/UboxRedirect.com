/**
 * privacyService — pedidos LGPD/GDPR (export/delete) do usuário logado.
 * Mesma convenção de packageService: currentUserId local, mapeamento para
 * camelCase, `throw new Error(error.message)` em erro de Supabase. Cliente
 * só insere e lê os PRÓPRIOS pedidos — RLS (data_requests_select_own_or_staff,
 * data_requests_insert_own) barra o resto; `status`/`resolution_notes`/
 * `completed_at` não são escritos aqui porque só staff pode alterá-los
 * (data_requests_update_staff).
 */
import { supabase } from '../lib/supabase'

export interface DataRequest {
  id: string
  kind: 'export' | 'delete'
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  requestNote: string
  resolutionNotes: string
  requestedAt: string
  completedAt: string | null
}

interface DataRequestRow {
  id: string
  kind: DataRequest['kind']
  status: DataRequest['status']
  request_note: string
  resolution_notes: string
  requested_at: string
  completed_at: string | null
}

function mapDataRequest(row: DataRequestRow): DataRequest {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    requestNote: row.request_note,
    resolutionNotes: row.resolution_notes,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const privacyService = {
  async submitDataRequest(input: { kind: 'export' | 'delete'; requestNote: string }): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase.from('data_requests').insert({
      user_id: userId,
      kind: input.kind,
      request_note: input.requestNote,
    })
    if (error) throw new Error(error.message)
  },

  async getMyDataRequests(): Promise<DataRequest[]> {
    const userId = await currentUserId()
    if (!userId) return []

    const { data, error } = await supabase
      .from('data_requests')
      .select('id, kind, status, request_note, resolution_notes, requested_at, completed_at')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as DataRequestRow[]).map(mapDataRequest)
  },
}
