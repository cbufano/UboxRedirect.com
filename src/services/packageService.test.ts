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
