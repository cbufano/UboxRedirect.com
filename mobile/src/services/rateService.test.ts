import { rateService } from './rateService'
import { supabase } from '../lib/supabase'

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}))

const mockedSupabase = supabase as jest.Mocked<typeof supabase>

beforeEach(() => jest.clearAllMocks())

function mockRateRows(rows: unknown[]) {
  const inFn = jest.fn().mockResolvedValue({ data: rows, error: null })
  const select = jest.fn().mockReturnValue({ in: inFn })
  mockedSupabase.from.mockReturnValue({ select } as never)
  return { select, in: inFn }
}

describe('estimateShippingCost', () => {
  it('returns rate options for a matching destination zone', async () => {
    mockRateRows([
      {
        destination_zone: 'BR',
        carrier: 'Economy',
        eta_days: '8-14',
        base_fee_usd: 8,
        rate_per_kg_usd: 14,
        multiplier: 1.0,
      },
      {
        destination_zone: 'BR',
        carrier: 'Express',
        eta_days: '3-5',
        base_fee_usd: 8,
        rate_per_kg_usd: 14,
        multiplier: 1.6,
      },
      {
        destination_zone: 'DEFAULT',
        carrier: 'Economy',
        eta_days: '8-14',
        base_fee_usd: 8,
        rate_per_kg_usd: 18,
        multiplier: 1.0,
      },
    ])

    const result = await rateService.estimateShippingCost({
      destinationCountry: 'BR',
      weightKg: 2,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    })

    expect(mockedSupabase.from).toHaveBeenCalledWith('rate_tables')
    expect(result.chargeableWeightKg).toBe(2)
    expect(result.currency).toBe('USD')
    expect(result.options).toEqual([
      { carrier: 'Economy', etaDays: '8-14', costUsd: 36 },
      { carrier: 'Express', etaDays: '3-5', costUsd: 52.8 },
    ])
  })

  it('falls back to DEFAULT rows when the destination zone has no rows', async () => {
    mockRateRows([
      {
        destination_zone: 'DEFAULT',
        carrier: 'Economy',
        eta_days: '8-14',
        base_fee_usd: 8,
        rate_per_kg_usd: 18,
        multiplier: 1.0,
      },
    ])

    const result = await rateService.estimateShippingCost({
      destinationCountry: 'ZZ',
      weightKg: 1,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    })

    expect(result.options).toEqual([{ carrier: 'Economy', etaDays: '8-14', costUsd: 8 + 1 * 18 * 1.0 }])
  })

  it('computes chargeable weight using dimensional weight when it exceeds actual weight', async () => {
    mockRateRows([
      {
        destination_zone: 'US',
        carrier: 'Economy',
        eta_days: '8-14',
        base_fee_usd: 8,
        rate_per_kg_usd: 6,
        multiplier: 1.0,
      },
    ])

    const result = await rateService.estimateShippingCost({
      destinationCountry: 'US',
      weightKg: 1,
      lengthCm: 50,
      widthCm: 50,
      heightCm: 50,
    })

    // dimWeight = 50*50*50 / 5000 = 25
    expect(result.chargeableWeightKg).toBe(25)
    expect(result.options).toEqual([{ carrier: 'Economy', etaDays: '8-14', costUsd: 8 + 25 * 6 * 1.0 }])
  })

  it('throws a clear error when neither the destination zone nor DEFAULT have any rate rows', async () => {
    mockRateRows([])

    await expect(
      rateService.estimateShippingCost({
        destinationCountry: 'ZZ',
        weightKg: 1,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      }),
    ).rejects.toThrow('No shipping rates available for this destination')
  })

  it('throws when weightKg is not positive', async () => {
    await expect(
      rateService.estimateShippingCost({
        destinationCountry: 'BR',
        weightKg: 0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      }),
    ).rejects.toThrow('weightKg must be positive')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })
})
