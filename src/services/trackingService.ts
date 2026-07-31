/**
 * trackingService — linha do tempo de rastreio (tracking_events) para o
 * CLIENTE logado. Sem checagem de papel aqui: a RLS
 * (tracking_events_select_own_or_staff, migration 20260731000007) garante que
 * só voltam eventos das PRÓPRIAS consolidações (staff enxerga tudo pela mesma
 * policy). Escrita não existe neste módulo — quem insere é a Edge Function
 * tracking-webhook (service_role).
 */
import { supabase } from '../lib/supabase'

export type NormalizedTrackingStatus = 'in_transit' | 'customs' | 'out_for_delivery' | 'delivered' | 'exception'

export interface TrackingEvent {
  id: string
  rawStatus: string
  normalizedStatus: NormalizedTrackingStatus
  occurredAt: string
}

interface TrackingEventRow {
  id: string
  raw_status: string
  normalized_status: NormalizedTrackingStatus
  occurred_at: string
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const trackingService = {
  /**
   * Eventos de rastreio de UMA consolidação, mais recentes primeiro (a UI da
   * linha do tempo mostra o último status no topo). O `.eq('consolidation_id')`
   * escolhe a consolidação; quem decide se o usuário PODE vê-la é a RLS.
   */
  async getTrackingEvents(consolidationId: string): Promise<TrackingEvent[]> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('tracking_events')
      .select('id, raw_status, normalized_status, occurred_at')
      .eq('consolidation_id', consolidationId)
      .order('occurred_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as TrackingEventRow[]).map((row) => ({
      id: row.id,
      rawStatus: row.raw_status,
      normalizedStatus: row.normalized_status,
      occurredAt: row.occurred_at,
    }))
  },
}
