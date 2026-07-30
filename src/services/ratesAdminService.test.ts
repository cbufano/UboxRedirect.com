import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ratesAdminService } from './ratesAdminService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

const rateInput = {
  destinationZone: 'BR',
  carrier: 'Economy',
  etaDays: '8-14',
  baseFeeUsd: 8,
  ratePerKgUsd: 14,
  multiplier: 1,
}

const ratePayload = {
  destination_zone: 'BR',
  carrier: 'Economy',
  eta_days: '8-14',
  base_fee_usd: 8,
  rate_per_kg_usd: 14,
  multiplier: 1,
}

beforeEach(() => vi.clearAllMocks())

describe('getRateRows', () => {
  it('returns camelCase rows ordered by zone then carrier', async () => {
    const rows = [
      {
        id: 'rate-1',
        destination_zone: 'BR',
        carrier: 'Economy',
        eta_days: '8-14',
        base_fee_usd: 8,
        rate_per_kg_usd: 14,
        multiplier: 1,
      },
      {
        id: 'rate-2',
        destination_zone: 'BR',
        carrier: 'Express',
        eta_days: '3-5',
        base_fee_usd: 8,
        rate_per_kg_usd: 14,
        multiplier: 1.6,
      },
    ]
    const orderCarrier = vi.fn().mockResolvedValue({ data: rows, error: null })
    const orderZone = vi.fn().mockReturnValue({ order: orderCarrier })
    const select = vi.fn().mockReturnValue({ order: orderZone })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await ratesAdminService.getRateRows()

    expect(mockedSupabase.from).toHaveBeenCalledWith('rate_tables')
    expect(orderZone).toHaveBeenCalledWith('destination_zone', { ascending: true })
    expect(orderCarrier).toHaveBeenCalledWith('carrier', { ascending: true })
    expect(result).toEqual([
      {
        id: 'rate-1',
        destinationZone: 'BR',
        carrier: 'Economy',
        etaDays: '8-14',
        baseFeeUsd: 8,
        ratePerKgUsd: 14,
        multiplier: 1,
      },
      {
        id: 'rate-2',
        destinationZone: 'BR',
        carrier: 'Express',
        etaDays: '3-5',
        baseFeeUsd: 8,
        ratePerKgUsd: 14,
        multiplier: 1.6,
      },
    ])
  })

  it('throws when the query fails', async () => {
    const orderCarrier = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const orderZone = vi.fn().mockReturnValue({ order: orderCarrier })
    const select = vi.fn().mockReturnValue({ order: orderZone })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(ratesAdminService.getRateRows()).rejects.toThrow('boom')
  })
})

describe('createRateRow', () => {
  function mockInsertChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const insert = vi.fn().mockReturnValue({ select })
    mockedSupabase.from.mockReturnValue({ insert } as never)
    return { insert, select }
  }

  it('inserts the snake_case payload and returns the new id', async () => {
    mockSession('admin-1')
    const { insert, select } = mockInsertChain({ data: [{ id: 'rate-9' }], error: null })

    const id = await ratesAdminService.createRateRow(rateInput)

    expect(mockedSupabase.from).toHaveBeenCalledWith('rate_tables')
    expect(insert).toHaveBeenCalledWith(ratePayload)
    expect(select).toHaveBeenCalledWith('id')
    expect(id).toBe('rate-9')
  })

  it('throws when signed out without touching the database', async () => {
    mockSession(null)
    await expect(ratesAdminService.createRateRow(rateInput)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert affects no row (e.g. RLS denied)', async () => {
    mockSession('ops-1')
    mockInsertChain({ data: [], error: null })

    await expect(ratesAdminService.createRateRow(rateInput)).rejects.toThrow('Rate row was not created')
  })

  it('throws when the insert fails', async () => {
    mockSession('admin-1')
    mockInsertChain({ data: null, error: { message: 'boom' } })

    await expect(ratesAdminService.createRateRow(rateInput)).rejects.toThrow('boom')
  })
})

describe('updateRateRow', () => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eq, select }
  }

  it('updates the row by id with the snake_case payload', async () => {
    mockSession('admin-1')
    const { update, eq, select } = mockUpdateChain({ data: [{ id: 'rate-1' }], error: null })

    await ratesAdminService.updateRateRow('rate-1', rateInput)

    expect(mockedSupabase.from).toHaveBeenCalledWith('rate_tables')
    expect(update).toHaveBeenCalledWith(ratePayload)
    expect(eq).toHaveBeenCalledWith('id', 'rate-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(ratesAdminService.updateRateRow('rate-1', rateInput)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when no row is affected', async () => {
    mockSession('admin-1')
    mockUpdateChain({ data: [], error: null })

    await expect(ratesAdminService.updateRateRow('rate-1', rateInput)).rejects.toThrow(
      'Rate row not found or update not permitted',
    )
  })

  it('throws when the update fails', async () => {
    mockSession('admin-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(ratesAdminService.updateRateRow('rate-1', rateInput)).rejects.toThrow('boom')
  })
})

describe('deleteRateRow', () => {
  function mockDeleteChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const del = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ delete: del } as never)
    return { del, eq, select }
  }

  it('deletes the row by id', async () => {
    mockSession('admin-1')
    const { del, eq, select } = mockDeleteChain({ data: [{ id: 'rate-1' }], error: null })

    await ratesAdminService.deleteRateRow('rate-1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('rate_tables')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'rate-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(ratesAdminService.deleteRateRow('rate-1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the delete affects no row (missing id or RLS denied)', async () => {
    mockSession('admin-1')
    mockDeleteChain({ data: [], error: null })

    await expect(ratesAdminService.deleteRateRow('rate-1')).rejects.toThrow(
      'Rate row not found or delete not permitted',
    )
  })

  it('throws when the delete fails', async () => {
    mockSession('admin-1')
    mockDeleteChain({ data: null, error: { message: 'boom' } })

    await expect(ratesAdminService.deleteRateRow('rate-1')).rejects.toThrow('boom')
  })
})

describe('getServiceFees', () => {
  it('returns camelCase fees ordered by key', async () => {
    const rows = [
      { key: 'extra_photo', label: 'Extra photos (each)', amount_usd: 0.5, percent: null, active: true },
      {
        key: 'value_protection',
        label: 'Value protection (% of declared value)',
        amount_usd: null,
        percent: 2,
        active: false,
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await ratesAdminService.getServiceFees()

    expect(mockedSupabase.from).toHaveBeenCalledWith('service_fees')
    expect(order).toHaveBeenCalledWith('key', { ascending: true })
    expect(result).toEqual([
      { key: 'extra_photo', label: 'Extra photos (each)', amountUsd: 0.5, percent: null, active: true },
      {
        key: 'value_protection',
        label: 'Value protection (% of declared value)',
        amountUsd: null,
        percent: 2,
        active: false,
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(ratesAdminService.getServiceFees()).rejects.toThrow('boom')
  })
})

describe('updateServiceFee', () => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eq, select }
  }

  it('updates only the provided fields, mapping to snake_case', async () => {
    mockSession('admin-1')
    const { update, eq, select } = mockUpdateChain({ data: [{ key: 'extra_photo' }], error: null })

    await ratesAdminService.updateServiceFee('extra_photo', { label: 'Extra photos', amountUsd: 0.75, active: false })

    expect(mockedSupabase.from).toHaveBeenCalledWith('service_fees')
    expect(update).toHaveBeenCalledWith({ label: 'Extra photos', amount_usd: 0.75, active: false })
    expect(eq).toHaveBeenCalledWith('key', 'extra_photo')
    expect(select).toHaveBeenCalledWith('key')
  })

  it('passes explicit nulls through to clear amount or percent', async () => {
    mockSession('admin-1')
    const { update } = mockUpdateChain({ data: [{ key: 'value_protection' }], error: null })

    await ratesAdminService.updateServiceFee('value_protection', { amountUsd: null, percent: 2.5 })

    expect(update).toHaveBeenCalledWith({ amount_usd: null, percent: 2.5 })
  })

  it('throws when no field is provided without touching the database', async () => {
    mockSession('admin-1')
    await expect(ratesAdminService.updateServiceFee('extra_photo', {})).rejects.toThrow('Nothing to update')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(ratesAdminService.updateServiceFee('extra_photo', { active: true })).rejects.toThrow(
      'Not authenticated',
    )
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when no row is affected (unknown key or RLS denied)', async () => {
    mockSession('admin-1')
    mockUpdateChain({ data: [], error: null })

    await expect(ratesAdminService.updateServiceFee('unknown_key', { active: true })).rejects.toThrow(
      'Service fee not found or update not permitted',
    )
  })

  it('throws when the update fails', async () => {
    mockSession('admin-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(ratesAdminService.updateServiceFee('extra_photo', { active: true })).rejects.toThrow('boom')
  })
})
