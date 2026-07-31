/**
 * financeAdminService — financeiro do painel staff (Fase 7.2): histórico de
 * pagamentos, registro de pagamento manual (PIX direto/transferência),
 * pedidos de estorno e sua conciliação. Espelha as convenções de
 * adminService (currentUserId local, mapeamento para camelCase,
 * `throw new Error(error.message)`, anti-0-linhas com `.select()`).
 *
 * Autorização é decidida pelo banco: payments_insert_staff_manual exige
 * provider manual + status 'succeeded' + registered_by = auth.uid() +
 * provider_session_id null; refunds_* exigem staff (ver migration
 * 20260731000003_finance.sql).
 */
import { supabase } from '../lib/supabase'

export type ManualProvider = 'manual_pix' | 'manual_transfer' | 'manual_other'
export type PaymentProvider = 'stripe' | ManualProvider
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type RefundStatus = 'requested' | 'processed' | 'failed'

export interface AdminPayment {
  id: string
  consolidationId: string
  userId: string
  provider: PaymentProvider
  amountUsd: number
  status: PaymentStatus
  notes: string
  createdAt: string
  customerName: string
  city: string
  country: string
}

export interface RegisterManualPaymentInput {
  consolidationId: string
  userId: string
  amountUsd: number
  provider: ManualProvider
  notes: string
}

export interface RequestRefundInput {
  paymentId: string
  amountUsd: number
  reason: string
}

export interface AdminRefund {
  id: string
  paymentId: string
  amountUsd: number
  reason: string
  status: RefundStatus
  createdAt: string
  processedAt: string | null
  paymentAmountUsd: number | null
  paymentProvider: PaymentProvider | null
  customerName: string
}

type MaybeArray<T> = T | T[] | null

interface AdminPaymentRow {
  id: string
  consolidation_id: string
  user_id: string
  provider: PaymentProvider
  amount_usd: number
  status: PaymentStatus
  notes: string
  created_at: string
  profiles: MaybeArray<{ name: string }>
  consolidations: MaybeArray<{ city: string; country: string }>
}

interface AdminRefundRow {
  id: string
  payment_id: string
  amount_usd: number
  reason: string
  status: RefundStatus
  created_at: string
  processed_at: string | null
  payments: MaybeArray<{
    amount_usd: number
    provider: PaymentProvider
    profiles: MaybeArray<{ name: string }>
  }>
}

/** Mesmo tratamento de embeds objeto-ou-array de adminService.firstOf. */
function firstOf<T>(value: MaybeArray<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapAdminPayment(row: AdminPaymentRow): AdminPayment {
  const profile = firstOf(row.profiles)
  const consolidation = firstOf(row.consolidations)
  return {
    id: row.id,
    consolidationId: row.consolidation_id,
    userId: row.user_id,
    provider: row.provider,
    amountUsd: row.amount_usd,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    customerName: profile?.name ?? '',
    city: consolidation?.city ?? '',
    country: consolidation?.country ?? '',
  }
}

function mapAdminRefund(row: AdminRefundRow): AdminRefund {
  const payment = firstOf(row.payments)
  const profile = payment ? firstOf(payment.profiles) : null
  return {
    id: row.id,
    paymentId: row.payment_id,
    amountUsd: row.amount_usd,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    paymentAmountUsd: payment?.amount_usd ?? null,
    paymentProvider: payment?.provider ?? null,
    customerName: profile?.name ?? '',
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Transição de status compartilhada por markRefundProcessed/markRefundFailed:
 * só sai de 'requested' — 0 linhas afetadas (status inesperado ou id
 * inexistente) falha alto em vez de reportar sucesso otimista.
 */
async function transitionRefund(id: string, status: 'processed' | 'failed'): Promise<void> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('refunds')
    .update({ status, processed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'requested')
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Refund is not in requested status or was not found')
}

export const financeAdminService = {
  /**
   * Histórico completo de pagamentos com contexto do cliente e do destino da
   * consolidação, mais recentes primeiro. Leitura não filtra por
   * currentUserId — staff enxerga tudo via RLS (mesma convenção de
   * adminService).
   */
  async getPayments(): Promise<AdminPayment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, consolidation_id, user_id, provider, amount_usd, status, notes, created_at, profiles!payments_user_id_fkey (name), consolidations (city, country)',
      )
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as AdminPaymentRow[]).map(mapAdminPayment)
  },

  /**
   * Registra um pagamento recebido FORA do Stripe (PIX direto, transferência)
   * e marca a consolidação como paga. Dois passos sem transação:
   *
   * 1. INSERT em payments já 'succeeded' (a policy
   *    payments_insert_staff_manual exige provider manual, registered_by =
   *    uid do staff e provider_session_id nulo — por isso o campo fica de
   *    fora do payload).
   * 2. UPDATE da consolidação pending→paid com anti-0-linhas.
   *
   * Se o passo 2 não afetar nenhuma linha (consolidação cancelada/paga por
   * outra via no meio tempo), NÃO tentamos "desfazer" o insert: o pagamento
   * aconteceu no mundo real e a linha é trilha de auditoria — e o índice
   * único parcial payments_one_succeeded_per_consolidation já impede um
   * segundo 'succeeded' duplicado. Lançamos um erro explícito pedindo
   * revisão manual da inconsistência.
   *
   * Retorna o id do pagamento criado.
   */
  async registerManualPayment(input: RegisterManualPaymentInput): Promise<string> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        consolidation_id: input.consolidationId,
        user_id: input.userId,
        provider: input.provider,
        amount_usd: input.amountUsd,
        notes: input.notes,
        status: 'succeeded',
        registered_by: staffId,
      })
      .select('id')
      .single()
    if (insertError) throw new Error(insertError.message)

    const { data: updated, error: updateError } = await supabase
      .from('consolidations')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', input.consolidationId)
      .eq('status', 'pending')
      .select('id')
    if (updateError) {
      throw new Error(
        `Payment was recorded but marking the consolidation as paid failed: ${updateError.message}. Review the consolidation manually.`,
      )
    }
    if (!updated || updated.length === 0) {
      throw new Error(
        'Payment was recorded but the consolidation was no longer pending — review it manually to resolve the inconsistency.',
      )
    }

    return (payment as { id: string }).id
  },

  /**
   * Registra o PEDIDO de estorno (trilha de decisão). O estorno real no
   * Stripe é feito manualmente no dashboard deles nesta fase.
   */
  async requestRefund(input: RequestRefundInput): Promise<void> {
    const staffId = await currentUserId()
    if (!staffId) throw new Error('Not authenticated')

    const { error } = await supabase.from('refunds').insert({
      payment_id: input.paymentId,
      amount_usd: input.amountUsd,
      reason: input.reason,
      requested_by: staffId,
    })
    if (error) throw new Error(error.message)
  },

  /**
   * Estornos com contexto do pagamento original (valor, provider e nome do
   * cliente via embed aninhado refunds → payments → profiles), mais recentes
   * primeiro.
   */
  async getRefunds(): Promise<AdminRefund[]> {
    const { data, error } = await supabase
      .from('refunds')
      .select(
        'id, payment_id, amount_usd, reason, status, created_at, processed_at, payments (amount_usd, provider, profiles!payments_user_id_fkey (name))',
      )
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as AdminRefundRow[]).map(mapAdminRefund)
  },

  async markRefundProcessed(id: string): Promise<void> {
    return transitionRefund(id, 'processed')
  },

  async markRefundFailed(id: string): Promise<void> {
    return transitionRefund(id, 'failed')
  },
}
