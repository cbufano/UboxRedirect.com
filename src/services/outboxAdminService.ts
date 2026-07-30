/**
 * outboxAdminService — leitura do outbox de e-mails no painel staff
 * (Fase 7.4). SÓ leitura: quem insere é o trigger enqueue_email (banco) e
 * quem transiciona status é a Edge Function send-emails (service_role); nada
 * em `authenticated` escreve nesta tabela. Autorização é da RLS
 * (email_outbox_select_staff) — mesma convenção de
 * adminService/financeAdminService.
 */
import { supabase } from '../lib/supabase'

export type OutboxTemplate =
  | 'package_received'
  | 'package_ready'
  | 'payment_confirmed'
  | 'shipped'
  | 'storage_warning'

export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface OutboxEmail {
  id: string
  template: OutboxTemplate
  status: OutboxStatus
  error: string
  createdAt: string
  sentAt: string | null
  customerName: string
}

type MaybeArray<T> = T | T[] | null

interface OutboxEmailRow {
  id: string
  template: OutboxTemplate
  status: OutboxStatus
  error: string
  created_at: string
  sent_at: string | null
  profiles: MaybeArray<{ name: string }>
}

/** Mesmo tratamento de embeds objeto-ou-array de adminService.firstOf. */
function firstOf<T>(value: MaybeArray<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapOutboxEmail(row: OutboxEmailRow): OutboxEmail {
  return {
    id: row.id,
    template: row.template,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    customerName: firstOf(row.profiles)?.name ?? '',
  }
}

export const outboxAdminService = {
  /**
   * Últimos 100 e-mails do outbox (mais recentes primeiro), opcionalmente
   * filtrados por status, com o nome do destinatário via embed
   * email_outbox → profiles. O filtro entra ANTES de order/limit (o limite
   * corta dentro do status escolhido, não depois).
   */
  async getOutbox(statusFilter?: OutboxStatus): Promise<OutboxEmail[]> {
    let query = supabase
      .from('email_outbox')
      .select('id, template, status, error, created_at, sent_at, profiles (name)')
    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
    if (error) throw new Error(error.message)
    return (data as OutboxEmailRow[]).map(mapOutboxEmail)
  },
}
