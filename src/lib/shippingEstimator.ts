export interface EstimateInput {
  destinationCountry: string
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}
export interface EstimateResult {
  chargeableWeightKg: number
  currency: 'USD'
  options: { carrier: string; etaDays: string; costUsd: number }[]
}

const DIM_DIVISOR = 5000 // cm³ per kg
const ZONE_RATE: Record<string, number> = { BR: 14, US: 6, DEFAULT: 18 }
const CARRIERS = [
  { carrier: 'Economy', etaDays: '8-14', mult: 1.0 },
  { carrier: 'Express', etaDays: '3-5', mult: 1.6 },
]
const BASE_FEE_USD = 8

export function estimateShipping(input: EstimateInput): EstimateResult {
  if (!(input.weightKg > 0)) throw new Error('weightKg must be positive')
  const dimWeight = (input.lengthCm * input.widthCm * input.heightCm) / DIM_DIVISOR
  const chargeable = Math.round(Math.max(input.weightKg, dimWeight) * 100) / 100
  const rate = ZONE_RATE[input.destinationCountry] ?? ZONE_RATE.DEFAULT
  const options = CARRIERS.map((c) => ({
    carrier: c.carrier,
    etaDays: c.etaDays,
    costUsd: Math.round((BASE_FEE_USD + chargeable * rate * c.mult) * 100) / 100,
  }))
  return { chargeableWeightKg: chargeable, currency: 'USD', options }
}
