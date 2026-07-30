import { describe, it, expect, vi, beforeEach } from 'vitest'
import { currencyService, COUNTRY_CURRENCY } from './currencyService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)

beforeEach(() => vi.clearAllMocks())

function mockTables({
  currencies,
  rates,
}: {
  currencies: { data: unknown; error: { message: string } | null }
  rates: { data: unknown; error: { message: string } | null }
}) {
  mockedSupabase.from.mockImplementation((table: unknown) => {
    if (table === 'currencies') {
      const eq = vi.fn().mockResolvedValue(currencies)
      return { select: vi.fn().mockReturnValue({ eq }) } as never
    }
    if (table === 'exchange_rates') {
      const order = vi.fn().mockResolvedValue(rates)
      return { select: vi.fn().mockReturnValue({ order }) } as never
    }
    throw new Error(`unexpected table ${String(table)}`)
  })
}

describe('getLatestRates', () => {
  it('returns the most recent rate per active currency without requiring a session', async () => {
    mockTables({
      currencies: {
        data: [
          { code: 'BRL', symbol: 'R$' },
          { code: 'EUR', symbol: '€' },
          { code: 'USD', symbol: '$' },
        ],
        error: null,
      },
      rates: {
        data: [
          { currency_code: 'BRL', rate_per_usd: 5.43, quoted_at: '2026-07-30' },
          { currency_code: 'EUR', rate_per_usd: 0.91, quoted_at: '2026-07-30' },
          { currency_code: 'BRL', rate_per_usd: 5.5, quoted_at: '2026-07-29' },
        ],
        error: null,
      },
    })

    const result = await currencyService.getLatestRates()

    // Tabelas públicas: nunca checa sessão
    expect(mockedAuth.getSession).not.toHaveBeenCalled()
    // BRL pega a cotação mais recente; USD (ativa, sem cotação) fica de fora
    expect(result).toEqual([
      { code: 'BRL', symbol: 'R$', ratePerUsd: 5.43, quotedAt: '2026-07-30' },
      { code: 'EUR', symbol: '€', ratePerUsd: 0.91, quotedAt: '2026-07-30' },
    ])
  })

  it('queries only active currencies and orders rates newest first', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'currencies') return { select: vi.fn().mockReturnValue({ eq }) } as never
      return { select: vi.fn().mockReturnValue({ order }) } as never
    })

    await currencyService.getLatestRates()

    expect(eq).toHaveBeenCalledWith('active', true)
    expect(order).toHaveBeenCalledWith('quoted_at', { ascending: false })
  })

  it('returns an empty list when there are no rates yet', async () => {
    mockTables({
      currencies: { data: [{ code: 'BRL', symbol: 'R$' }], error: null },
      rates: { data: null, error: null },
    })

    expect(await currencyService.getLatestRates()).toEqual([])
  })

  it('throws when the currencies query fails', async () => {
    mockTables({
      currencies: { data: null, error: { message: 'boom' } },
      rates: { data: [], error: null },
    })

    await expect(currencyService.getLatestRates()).rejects.toThrow('boom')
  })

  it('throws when the rates query fails', async () => {
    mockTables({
      currencies: { data: [], error: null },
      rates: { data: null, error: { message: 'boom' } },
    })

    await expect(currencyService.getLatestRates()).rejects.toThrow('boom')
  })
})

describe('approximate', () => {
  it('converts and rounds to 2 decimal places', () => {
    expect(currencyService.approximate(100, 5.4321)).toBe(543.21)
    expect(currencyService.approximate(10.05, 5.4321)).toBe(54.59)
    expect(currencyService.approximate(0, 5.4321)).toBe(0)
  })
})

describe('COUNTRY_CURRENCY', () => {
  it('maps supported profile countries to display currencies', () => {
    expect(COUNTRY_CURRENCY).toEqual({
      BR: 'BRL',
      US: 'USD',
      PT: 'EUR',
      ES: 'EUR',
      MX: 'MXN',
      AR: 'ARS',
      GB: 'GBP',
    })
  })

  it('has no entry for unsupported countries (caller shows no conversion)', () => {
    expect(COUNTRY_CURRENCY['JP']).toBeUndefined()
  })
})
