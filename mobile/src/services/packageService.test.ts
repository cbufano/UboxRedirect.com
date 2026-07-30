import { packageService } from './packageService'
import { supabase } from '../lib/supabase'

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}))

const mockedSupabase = supabase as jest.Mocked<typeof supabase>
const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

beforeEach(() => jest.clearAllMocks())

describe('createExpectedPackage', () => {
  it('inserts a new expected package for the current user', async () => {
    mockSession('uuid-1')
    const insert = jest.fn().mockResolvedValue({ data: null, error: null })
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
    const insert = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
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
    const order = jest.fn().mockResolvedValue({ data: rows, error: null })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
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
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
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
    const order = jest.fn().mockResolvedValue({ data: rows, error: null })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
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

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(packageService.getMyReceivedPackages()).rejects.toThrow('boom')
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
    const order = jest.fn().mockResolvedValue({ data: rows, error: null })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
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
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(packageService.getMyConsolidations()).rejects.toThrow('boom')
  })
})

describe('cancelExpectedPackage', () => {
  it('updates the status to cancelled scoped to the current user', async () => {
    mockSession('uuid-1')
    const eqUser = jest.fn().mockResolvedValue({ data: null, error: null })
    const eqId = jest.fn().mockReturnValue({ eq: eqUser })
    const update = jest.fn().mockReturnValue({ eq: eqId })
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
