import { describe, it, expect, vi, beforeEach } from 'vitest'
import { packageService } from './packageService'
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

beforeEach(() => vi.clearAllMocks())

describe('createExpectedPackage', () => {
  it('inserts a new expected package for the current user', async () => {
    mockSession('uuid-1')
    const insert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await packageService.createExpectedPackage({
      store: 'Amazon',
      trackingNumber: '1Z999',
      description: 'Sneakers',
      declaredValueUsd: 120,
    })

    expect(mockedSupabase.from).toHaveBeenCalledWith('expected_packages')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'uuid-1',
      store: 'Amazon',
      tracking_number: '1Z999',
      description: 'Sneakers',
      declared_value_usd: 120,
    })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(
      packageService.createExpectedPackage({
        store: 'Amazon',
        trackingNumber: '',
        description: 'Sneakers',
        declaredValueUsd: 120,
      }),
    ).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('uuid-1')
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(
      packageService.createExpectedPackage({
        store: 'Amazon',
        trackingNumber: '',
        description: 'Sneakers',
        declaredValueUsd: 120,
      }),
    ).rejects.toThrow('boom')
  })
})

describe('getMyExpectedPackages', () => {
  const rows = [
    {
      id: 'p1',
      store: 'Amazon',
      tracking_number: '1Z999',
      description: 'Sneakers',
      declared_value_usd: 120,
      status: 'pending',
      created_at: '2026-07-01T00:00:00Z',
    },
  ]

  it('returns the mapped list ordered by created_at descending', async () => {
    mockSession('uuid-1')
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await packageService.getMyExpectedPackages()

    expect(mockedSupabase.from).toHaveBeenCalledWith('expected_packages')
    expect(eq).toHaveBeenCalledWith('user_id', 'uuid-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'p1',
        store: 'Amazon',
        trackingNumber: '1Z999',
        description: 'Sneakers',
        declaredValueUsd: 120,
        status: 'pending',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ])
  })

  it('returns an empty array when signed out', async () => {
    mockSession(null)
    expect(await packageService.getMyExpectedPackages()).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(packageService.getMyExpectedPackages()).rejects.toThrow('boom')
  })
})

describe('getMyReceivedPackages', () => {
  const rows = [
    {
      id: 'r1',
      store: 'Best Buy',
      description: 'Headphones',
      weight_kg: 1.2,
      status: 'received',
      received_at: '2026-07-02T00:00:00Z',
    },
  ]

  it('returns the mapped list ordered by received_at descending', async () => {
    mockSession('uuid-1')
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await packageService.getMyReceivedPackages()

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(eq).toHaveBeenCalledWith('user_id', 'uuid-1')
    expect(order).toHaveBeenCalledWith('received_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'r1',
        store: 'Best Buy',
        description: 'Headphones',
        weightKg: 1.2,
        status: 'received',
        receivedAt: '2026-07-02T00:00:00Z',
      },
    ])
  })

  it('returns an empty array when signed out', async () => {
    mockSession(null)
    expect(await packageService.getMyReceivedPackages()).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })
})

describe('getMyConsolidations', () => {
  const rows = [
    {
      id: 'c1',
      status: 'pending',
      recipient_name: 'John Doe',
      city: 'Springfield',
      country: 'US',
      carrier: 'Economy',
      tracking_code: null,
      cost_usd: 43,
      created_at: '2026-07-20T00:00:00Z',
      paid_at: null,
      shipped_at: null,
    },
    {
      id: 'c2',
      status: 'shipped',
      recipient_name: 'Jane Doe',
      city: 'Miami',
      country: 'BR',
      carrier: 'Express',
      tracking_code: 'TRACK123',
      cost_usd: 88.5,
      created_at: '2026-07-10T00:00:00Z',
      paid_at: '2026-07-11T00:00:00Z',
      shipped_at: '2026-07-15T00:00:00Z',
    },
  ]

  it('returns the mapped list ordered by created_at descending', async () => {
    mockSession('uuid-1')
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await packageService.getMyConsolidations()

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(eq).toHaveBeenCalledWith('user_id', 'uuid-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'c1',
        status: 'pending',
        recipientName: 'John Doe',
        city: 'Springfield',
        country: 'US',
        carrier: 'Economy',
        trackingCode: null,
        costUsd: 43,
        createdAt: '2026-07-20T00:00:00Z',
        paidAt: null,
        shippedAt: null,
      },
      {
        id: 'c2',
        status: 'shipped',
        recipientName: 'Jane Doe',
        city: 'Miami',
        country: 'BR',
        carrier: 'Express',
        trackingCode: 'TRACK123',
        costUsd: 88.5,
        createdAt: '2026-07-10T00:00:00Z',
        paidAt: '2026-07-11T00:00:00Z',
        shippedAt: '2026-07-15T00:00:00Z',
      },
    ])
  })

  it('returns an empty array when signed out', async () => {
    mockSession(null)
    expect(await packageService.getMyConsolidations()).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(packageService.getMyConsolidations()).rejects.toThrow('boom')
  })
})

describe('createConsolidation', () => {
  const input = {
    recipientName: 'John Doe',
    street: '123 Main St',
    city: 'Springfield',
    stateProvince: 'IL',
    postalCode: '62704',
    country: 'US',
    carrier: 'Economy',
    chargeableWeightKg: 2.5,
    costUsd: 43,
    contentsDescription: 'Clothing',
    declaredValueUsd: 100,
  }

  it('inserts a new consolidation for the current user and returns its id', async () => {
    mockSession('uuid-1')
    const single = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    const id = await packageService.createConsolidation(input)

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'uuid-1',
      recipient_name: 'John Doe',
      street: '123 Main St',
      city: 'Springfield',
      state_province: 'IL',
      postal_code: '62704',
      country: 'US',
      carrier: 'Economy',
      chargeable_weight_kg: 2.5,
      cost_usd: 43,
      contents_description: 'Clothing',
      declared_value_usd: 100,
    })
    expect(id).toBe('c1')
  })

  it('defaults stateProvince to an empty string when omitted', async () => {
    mockSession('uuid-1')
    const single = vi.fn().mockResolvedValue({ data: { id: 'c2' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await packageService.createConsolidation({ ...input, stateProvince: undefined })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ state_province: '' }))
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(packageService.createConsolidation(input)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('uuid-1')
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(packageService.createConsolidation(input)).rejects.toThrow('boom')
  })
})

describe('addConsolidationItems', () => {
  it('inserts one row per package id', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await packageService.addConsolidationItems('c1', ['p1', 'p2'])

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidation_items')
    expect(insert).toHaveBeenCalledWith([
      { consolidation_id: 'c1', package_id: 'p1' },
      { consolidation_id: 'c1', package_id: 'p2' },
    ])
  })

  it('does nothing when there are no package ids', async () => {
    await packageService.addConsolidationItems('c1', [])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(packageService.addConsolidationItems('c1', ['p1'])).rejects.toThrow('boom')
  })
})

describe('cancelExpectedPackage', () => {
  it('updates the status to cancelled scoped to the current user', async () => {
    mockSession('uuid-1')
    const eqUser = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqId = vi.fn().mockReturnValue({ eq: eqUser })
    const update = vi.fn().mockReturnValue({ eq: eqId })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await packageService.cancelExpectedPackage('p1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('expected_packages')
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(eqId).toHaveBeenCalledWith('id', 'p1')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'uuid-1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(packageService.cancelExpectedPackage('p1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })
})
