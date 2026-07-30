/**
 * rateService — tarifas de envio a partir de `rate_tables` (leitura pública,
 * sem autenticação). Porta 1:1 de `src/services/rateService.ts` (site) — é
 * TypeScript puro + chamada Supabase, sem dependência de DOM.
 */
import { supabase } from '../lib/supabase'

export interface RateOption {
  carrier: string
  etaDays: string
  costUsd: number
}

export interface RateEstimate {
  chargeableWeightKg: number
  currency: 'USD'
  options: RateOption[]
}

export interface EstimateShippingCostInput {
  destinationCountry: string
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

interface RateTableRow {
  destination_zone: string
  carrier: string
  eta_days: string
  base_fee_usd: number
  rate_per_kg_usd: number
  multiplier: number
}

const DIM_DIVISOR = 5000 // cm³ per kg
const DEFAULT_ZONE = 'DEFAULT'

export const rateService = {
  async estimateShippingCost(input: EstimateShippingCostInput): Promise<RateEstimate> {
    if (!(input.weightKg > 0)) throw new Error('weightKg must be positive')

    const dimWeight = (input.lengthCm * input.widthCm * input.heightCm) / DIM_DIVISOR
    const chargeableWeightKg = Math.round(Math.max(input.weightKg, dimWeight) * 100) / 100

    const { data, error } = await supabase
      .from('rate_tables')
      .select('destination_zone, carrier, eta_days, base_fee_usd, rate_per_kg_usd, multiplier')
      .in('destination_zone', [input.destinationCountry, DEFAULT_ZONE])
    if (error) throw new Error(error.message)

    const rows = data as RateTableRow[]
    const specificRows = rows.filter((row) => row.destination_zone === input.destinationCountry)
    const rowsToUse = specificRows.length > 0 ? specificRows : rows.filter((row) => row.destination_zone === DEFAULT_ZONE)

    if (rowsToUse.length === 0) {
      // A shipping route with zero pricing rows (neither the destination
      // zone nor DEFAULT) is a rate_tables configuration gap, not a valid
      // "no options" result — fail loudly so callers surface it clearly.
      throw new Error('No shipping rates available for this destination')
    }

    const options: RateOption[] = rowsToUse.map((row) => ({
      carrier: row.carrier,
      etaDays: row.eta_days,
      costUsd: Math.round((row.base_fee_usd + chargeableWeightKg * row.rate_per_kg_usd * row.multiplier) * 100) / 100,
    }))

    return { chargeableWeightKg, currency: 'USD', options }
  },
}
