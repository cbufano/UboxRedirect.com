import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminService } from './adminService'
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

describe('getOpsStats', () => {
  it('returns counts for each stat', async () => {
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'packages') {
        const inMock = vi.fn().mockResolvedValue({ count: 3, error: null })
        return { select: vi.fn().mockReturnValue({ in: inMock }) } as never
      }
      if (table === 'consolidations') {
        const eq = vi.fn().mockResolvedValue({ count: 2, error: null })
        return { select: vi.fn().mockReturnValue({ eq }) } as never
      }
      if (table === 'expected_packages') {
        const eq = vi.fn().mockResolvedValue({ count: 1, error: null })
        return { select: vi.fn().mockReturnValue({ eq }) } as never
      }
      throw new Error(`unexpected table ${String(table)}`)
    })

    const stats = await adminService.getOpsStats()

    expect(stats).toEqual({ awaitingReview: 3, pendingConsolidations: 2, openPreAlerts: 1 })
  })

  it('defaults missing counts to zero', async () => {
    mockedSupabase.from.mockImplementation(() => {
      const chain = { in: vi.fn().mockResolvedValue({ count: null, error: null }) }
      return { select: vi.fn().mockReturnValue({ ...chain, eq: vi.fn().mockResolvedValue({ count: null, error: null }) }) } as never
    })

    const stats = await adminService.getOpsStats()

    expect(stats).toEqual({ awaitingReview: 0, pendingConsolidations: 0, openPreAlerts: 0 })
  })

  it('throws when any count query fails', async () => {
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'packages') {
        const inMock = vi.fn().mockResolvedValue({ count: null, error: { message: 'boom' } })
        return { select: vi.fn().mockReturnValue({ in: inMock }) } as never
      }
      const eq = vi.fn().mockResolvedValue({ count: 0, error: null })
      return { select: vi.fn().mockReturnValue({ eq }) } as never
    })

    await expect(adminService.getOpsStats()).rejects.toThrow('boom')
  })
})

describe('getPackagesNeedingReview', () => {
  it('returns mapped packages with customer name and suite (object-shaped embeds)', async () => {
    const rows = [
      {
        id: 'pkg1',
        store: 'Amazon',
        description: 'Shoes',
        weight_kg: 1.2,
        status: 'received',
        profiles: { name: 'Ana', suites: { suite_number: 'BUF-10001' } },
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const inMock = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inMock })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPackagesNeedingReview()

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(inMock).toHaveBeenCalledWith('status', ['received', 'in_review'])
    expect(result).toEqual([
      {
        id: 'pkg1',
        store: 'Amazon',
        description: 'Shoes',
        weightKg: 1.2,
        status: 'received',
        customerName: 'Ana',
        customerSuite: 'BUF-10001',
      },
    ])
  })

  it('handles array-shaped embeds and a missing suite', async () => {
    const rows = [
      {
        id: 'pkg2',
        store: 'Nike',
        description: 'Jacket',
        weight_kg: 0.8,
        status: 'in_review',
        profiles: [{ name: 'Bia', suites: [] }],
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const inMock = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inMock })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPackagesNeedingReview()

    expect(result[0]).toEqual({
      id: 'pkg2',
      store: 'Nike',
      description: 'Jacket',
      weightKg: 0.8,
      status: 'in_review',
      customerName: 'Bia',
      customerSuite: null,
    })
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const inMock = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inMock })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.getPackagesNeedingReview()).rejects.toThrow('boom')
  })
})

describe('markPackageReady', () => {
  it('updates the package status to ready', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await adminService.markPackageReady('pkg1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(update).toHaveBeenCalledWith({ status: 'ready' })
    expect(eq).toHaveBeenCalledWith('id', 'pkg1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.markPackageReady('pkg1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(adminService.markPackageReady('pkg1')).rejects.toThrow('boom')
  })
})

describe('findUserBySuite', () => {
  it('returns the matching user with compliance status', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        user_id: 'u1',
        profiles: { name: 'Ana', kyc_status: 'pending', ofac_screening_status: 'not_started' },
      },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.findUserBySuite('BUF-10001')

    expect(mockedSupabase.from).toHaveBeenCalledWith('suites')
    expect(eq).toHaveBeenCalledWith('suite_number', 'BUF-10001')
    expect(result).toEqual({
      userId: 'u1',
      name: 'Ana',
      kycStatus: 'pending',
      ofacStatus: 'not_started',
    })
  })

  it('returns null when no suite matches', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    expect(await adminService.findUserBySuite('missing')).toBeNull()
  })

  it('throws when the query fails', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.findUserBySuite('BUF-10001')).rejects.toThrow('boom')
  })
})

describe('receivePackage', () => {
  const input = { userId: 'cust-1', store: 'Amazon', description: 'Shoes', weightKg: 1.1 }

  it('inserts a new package for the target customer', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await adminService.receivePackage(input)

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'cust-1',
      store: 'Amazon',
      description: 'Shoes',
      weight_kg: 1.1,
    })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.receivePackage(input)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(adminService.receivePackage(input)).rejects.toThrow('boom')
  })
})

describe('getPendingConsolidations', () => {
  it('returns mapped pending consolidations', async () => {
    const rows = [
      {
        id: 'c1',
        city: 'Springfield',
        country: 'US',
        declared_value_usd: 100,
        carrier: null,
        tracking_code: null,
        profiles: { name: 'Ana' },
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPendingConsolidations()

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(eq).toHaveBeenCalledWith('status', 'pending')
    expect(result).toEqual([
      {
        id: 'c1',
        customerName: 'Ana',
        city: 'Springfield',
        country: 'US',
        declaredValueUsd: 100,
        carrier: null,
        trackingCode: null,
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.getPendingConsolidations()).rejects.toThrow('boom')
  })
})

describe('markConsolidationShipped', () => {
  it('sets carrier, tracking code, status and shipped_at', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await adminService.markConsolidationShipped('c1', { carrier: 'DHL', trackingCode: 'TRK123' })

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ carrier: 'DHL', tracking_code: 'TRK123', status: 'shipped' }),
    )
    const updateArg = update.mock.calls[0][0] as { shipped_at: string }
    expect(typeof updateArg.shipped_at).toBe('string')
    expect(eq).toHaveBeenCalledWith('id', 'c1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(
      adminService.markConsolidationShipped('c1', { carrier: 'DHL', trackingCode: 'TRK123' }),
    ).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(
      adminService.markConsolidationShipped('c1', { carrier: 'DHL', trackingCode: 'TRK123' }),
    ).rejects.toThrow('boom')
  })
})

describe('getOpenDataRequests', () => {
  it('returns mapped open data requests joined to profiles', async () => {
    const rows = [
      {
        id: 'r1',
        kind: 'export',
        status: 'pending',
        request_note: 'Please send my data',
        resolution_notes: '',
        requested_at: '2026-07-01T00:00:00Z',
        profiles: { name: 'Ana', email: 'ana@example.com' },
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const inMock = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inMock })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getOpenDataRequests()

    expect(mockedSupabase.from).toHaveBeenCalledWith('data_requests')
    expect(inMock).toHaveBeenCalledWith('status', ['pending', 'processing'])
    expect(result).toEqual([
      {
        id: 'r1',
        kind: 'export',
        status: 'pending',
        requestNote: 'Please send my data',
        resolutionNotes: '',
        requestedAt: '2026-07-01T00:00:00Z',
        customerName: 'Ana',
        customerEmail: 'ana@example.com',
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const inMock = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inMock })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.getOpenDataRequests()).rejects.toThrow('boom')
  })
})

describe('resolveDataRequest', () => {
  it('sets status, resolution notes and completed_at', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await adminService.resolveDataRequest('r1', { status: 'completed', resolutionNotes: 'Exported and emailed' })

    expect(mockedSupabase.from).toHaveBeenCalledWith('data_requests')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', resolution_notes: 'Exported and emailed' }),
    )
    const updateArg = update.mock.calls[0][0] as { completed_at: string }
    expect(typeof updateArg.completed_at).toBe('string')
    expect(eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(
      adminService.resolveDataRequest('r1', { status: 'rejected', resolutionNotes: '' }),
    ).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(
      adminService.resolveDataRequest('r1', { status: 'rejected', resolutionNotes: 'no basis' }),
    ).rejects.toThrow('boom')
  })
})

describe('setKycStatus', () => {
  it('updates kyc_status for the target profile', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await adminService.setKycStatus('cust-1', 'verified')

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ kyc_status: 'verified' })
    expect(eq).toHaveBeenCalledWith('id', 'cust-1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.setKycStatus('cust-1', 'verified')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(adminService.setKycStatus('cust-1', 'rejected')).rejects.toThrow('boom')
  })
})

describe('setOfacStatus', () => {
  it('updates ofac_screening_status for the target profile', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await adminService.setOfacStatus('cust-1', 'clear')

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ ofac_screening_status: 'clear' })
    expect(eq).toHaveBeenCalledWith('id', 'cust-1')
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.setOfacStatus('cust-1', 'flagged')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(adminService.setOfacStatus('cust-1', 'flagged')).rejects.toThrow('boom')
  })
})
