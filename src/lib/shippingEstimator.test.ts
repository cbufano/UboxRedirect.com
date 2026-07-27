import { describe, it, expect } from 'vitest'
import { estimateShipping } from './shippingEstimator'

describe('estimateShipping', () => {
  it('uses dimensional weight when it exceeds actual weight', () => {
    // 60x40x40 / 5000 = 19.2kg dimensional > 2kg actual
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 2, lengthCm: 60, widthCm: 40, heightCm: 40 })
    expect(r.chargeableWeightKg).toBe(19.2)
  })
  it('uses actual weight when it exceeds dimensional', () => {
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 10, lengthCm: 20, widthCm: 20, heightCm: 20 })
    expect(r.chargeableWeightKg).toBe(10)
  })
  it('returns at least one carrier option with positive cost', () => {
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 5, lengthCm: 30, widthCm: 30, heightCm: 30 })
    expect(r.options.length).toBeGreaterThan(0)
    expect(r.options[0].costUsd).toBeGreaterThan(0)
  })
  it('throws on non-positive weight', () => {
    expect(() => estimateShipping({ destinationCountry: 'BR', weightKg: 0, lengthCm: 10, widthCm: 10, heightCm: 10 })).toThrow()
  })
})
