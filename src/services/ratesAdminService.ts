/**
 * ratesAdminService — administração de tarifas de envio (rate_tables) e taxas
 * de serviço (service_fees) para a tela /admin/rates (Fase 7.2). Espelha as
 * convenções de warehouseService/financeAdminService (currentUserId local,
 * mapeamento para camelCase, `throw new Error(error.message)`, anti-0-linhas
 * com `.select()` em toda mutação — inclusive delete: excluir sem afetar
 * linha é erro, nunca sucesso otimista silencioso).
 *
 * Autorização real é do banco: rate_tables_write_admin (migration
 * 20260730000001_packages_consolidation.sql) e service_fees_write_admin
 * (migration 20260731000003_finance.sql) restringem a escrita a admin;
 * leitura das duas tabelas é pública (a calculadora anônima do site e o
 * checkout do cliente consomem as mesmas linhas).
 *
 * service_fees NÃO tem create/delete de propósito: as 5 chaves
 * (consolidation_per_package, extra_photo, repackaging, storage_per_day,
 * value_protection) são fixas do seed da migration 20260731000003_finance.sql
 * e o site as referencia pela chave — aqui só se edita label/valores/ativo.
 */
import { supabase } from '../lib/supabase'

export interface RateRow {
  id: string
  destinationZone: string
  carrier: string
  etaDays: string
  baseFeeUsd: number
  ratePerKgUsd: number
  multiplier: number
}

export interface RateRowInput {
  destinationZone: string
  carrier: string
  etaDays: string
  baseFeeUsd: number
  ratePerKgUsd: number
  multiplier: number
}

export interface ServiceFee {
  key: string
  label: string
  amountUsd: number | null
  percent: number | null
  active: boolean
}

export interface UpdateServiceFeeInput {
  label?: string
  amountUsd?: number | null
  percent?: number | null
  active?: boolean
}

interface RateTableRow {
  id: string
  destination_zone: string
  carrier: string
  eta_days: string
  base_fee_usd: number
  rate_per_kg_usd: number
  multiplier: number
}

interface ServiceFeeRow {
  key: string
  label: string
  amount_usd: number | null
  percent: number | null
  active: boolean
}

function mapRateRow(row: RateTableRow): RateRow {
  return {
    id: row.id,
    destinationZone: row.destination_zone,
    carrier: row.carrier,
    etaDays: row.eta_days,
    baseFeeUsd: row.base_fee_usd,
    ratePerKgUsd: row.rate_per_kg_usd,
    multiplier: row.multiplier,
  }
}

function mapServiceFee(row: ServiceFeeRow): ServiceFee {
  return {
    key: row.key,
    label: row.label,
    amountUsd: row.amount_usd,
    percent: row.percent,
    active: row.active,
  }
}

function toRatePayload(input: RateRowInput) {
  return {
    destination_zone: input.destinationZone,
    carrier: input.carrier,
    eta_days: input.etaDays,
    base_fee_usd: input.baseFeeUsd,
    rate_per_kg_usd: input.ratePerKgUsd,
    multiplier: input.multiplier,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const ratesAdminService = {
  /** Todas as linhas de tarifa, ordenadas por zona e transportadora. */
  async getRateRows(): Promise<RateRow[]> {
    const { data, error } = await supabase
      .from('rate_tables')
      .select('id, destination_zone, carrier, eta_days, base_fee_usd, rate_per_kg_usd, multiplier')
      .order('destination_zone', { ascending: true })
      .order('carrier', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as RateTableRow[]).map(mapRateRow)
  },

  /** Cria uma linha de tarifa e retorna o id criado. */
  async createRateRow(input: RateRowInput): Promise<string> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('rate_tables').insert(toRatePayload(input)).select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Rate row was not created')
    return (data[0] as { id: string }).id
  },

  async updateRateRow(id: string, input: RateRowInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('rate_tables').update(toRatePayload(input)).eq('id', id).select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Rate row not found or update not permitted')
  },

  async deleteRateRow(id: string): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('rate_tables').delete().eq('id', id).select('id')
    if (error) throw new Error(error.message)
    // Delete que não afeta linha (id inexistente ou RLS negou) = erro.
    if (!data || data.length === 0) throw new Error('Rate row not found or delete not permitted')
  },

  /** As 5 taxas de serviço do seed, ordenadas por chave. */
  async getServiceFees(): Promise<ServiceFee[]> {
    const { data, error } = await supabase
      .from('service_fees')
      .select('key, label, amount_usd, percent, active')
      .order('key', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as ServiceFeeRow[]).map(mapServiceFee)
  },

  /**
   * Edita uma taxa existente (campos omitidos ficam intactos; amountUsd e
   * percent aceitam null explícito para limpar — o CHECK do banco garante que
   * pelo menos um dos dois permaneça preenchido).
   */
  async updateServiceFee(key: string, input: UpdateServiceFeeInput): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const patch: Record<string, unknown> = {}
    if (input.label !== undefined) patch.label = input.label
    if (input.amountUsd !== undefined) patch.amount_usd = input.amountUsd
    if (input.percent !== undefined) patch.percent = input.percent
    if (input.active !== undefined) patch.active = input.active
    if (Object.keys(patch).length === 0) throw new Error('Nothing to update')

    const { data, error } = await supabase.from('service_fees').update(patch).eq('key', key).select('key')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Service fee not found or update not permitted')
  },
}
