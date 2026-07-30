import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminService } from './adminService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)
const mockedStorage = vi.mocked(supabase.storage, { partial: true })

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

describe('discardPackage', () => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eqStatus = vi.fn().mockReturnValue({ select })
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus })
    const update = vi.fn().mockReturnValue({ eq: eqId })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eqId, eqStatus, select }
  }

  it('discards only packages that are still in review', async () => {
    mockSession('staff-1')
    const { update, eqId, eqStatus, select } = mockUpdateChain({ data: [{ id: 'pkg1' }], error: null })

    await adminService.discardPackage('pkg1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(update).toHaveBeenCalledWith({ status: 'discarded' })
    expect(eqId).toHaveBeenCalledWith('id', 'pkg1')
    expect(eqStatus).toHaveBeenCalledWith('status', 'in_review')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when no row is affected (package not in review)', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: [], error: null })

    await expect(adminService.discardPackage('pkg1')).rejects.toThrow(
      'Package is not in review or was not found',
    )
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.discardPackage('pkg1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(adminService.discardPackage('pkg1')).rejects.toThrow('boom')
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

  function mockInsertChain(result: { data: unknown; error: { message: string } | null }) {
    const single = vi.fn().mockResolvedValue(result)
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockedSupabase.from.mockReturnValue({ insert } as never)
    return { insert, select, single }
  }

  it('inserts a new package for the target customer and returns the created id', async () => {
    mockSession('staff-1')
    const { insert, select } = mockInsertChain({ data: { id: 'pkg-new' }, error: null })

    const id = await adminService.receivePackage(input)

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'cust-1',
      store: 'Amazon',
      description: 'Shoes',
      weight_kg: 1.1,
    })
    expect(select).toHaveBeenCalledWith('id')
    expect(id).toBe('pkg-new')
  })

  it('maps the optional fields to snake_case columns when provided', async () => {
    mockSession('staff-1')
    const { insert } = mockInsertChain({ data: { id: 'pkg-new' }, error: null })

    await adminService.receivePackage({
      ...input,
      expectedPackageId: 'exp-1',
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
      declaredValueUsd: 99.9,
      locationId: 'loc-1',
    })

    expect(insert).toHaveBeenCalledWith({
      user_id: 'cust-1',
      store: 'Amazon',
      description: 'Shoes',
      weight_kg: 1.1,
      expected_package_id: 'exp-1',
      length_cm: 30,
      width_cm: 20,
      height_cm: 10,
      declared_value_usd: 99.9,
      location_id: 'loc-1',
    })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.receivePackage(input)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('staff-1')
    mockInsertChain({ data: null, error: { message: 'boom' } })

    await expect(adminService.receivePackage(input)).rejects.toThrow('boom')
  })
})

describe('getPendingPreAlerts', () => {
  it('returns pending pre-alerts for the customer, newest first', async () => {
    const rows = [
      {
        id: 'exp-1',
        store: 'Amazon',
        tracking_number: 'TRK1',
        description: 'Shoes',
        declared_value_usd: 50,
        status: 'pending',
        created_at: '2026-07-29T00:00:00Z',
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eqStatus = vi.fn().mockReturnValue({ order })
    const eqUser = vi.fn().mockReturnValue({ eq: eqStatus })
    const select = vi.fn().mockReturnValue({ eq: eqUser })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPendingPreAlerts('cust-1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('expected_packages')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'cust-1')
    expect(eqStatus).toHaveBeenCalledWith('status', 'pending')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'exp-1',
        store: 'Amazon',
        trackingNumber: 'TRK1',
        description: 'Shoes',
        declaredValueUsd: 50,
        status: 'pending',
        createdAt: '2026-07-29T00:00:00Z',
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eqStatus = vi.fn().mockReturnValue({ order })
    const eqUser = vi.fn().mockReturnValue({ eq: eqStatus })
    const select = vi.fn().mockReturnValue({ eq: eqUser })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.getPendingPreAlerts('cust-1')).rejects.toThrow('boom')
  })
})

describe('uploadPackagePhoto', () => {
  const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })

  function mockTables(overrides?: {
    ownerError?: { message: string }
    photoInsertError?: { message: string }
  }) {
    const single = vi.fn().mockResolvedValue(
      overrides?.ownerError
        ? { data: null, error: overrides.ownerError }
        : { data: { user_id: 'cust-1' }, error: null },
    )
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const insert = vi.fn().mockResolvedValue({ data: null, error: overrides?.photoInsertError ?? null })
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'packages') return { select } as never
      if (table === 'package_photos') return { insert } as never
      throw new Error(`unexpected table ${String(table)}`)
    })
    return { select, eq, insert }
  }

  it('uploads the file under user/package path and records it in package_photos', async () => {
    mockSession('staff-1')
    const { eq, insert } = mockTables()
    const upload = vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null })
    mockedStorage.from.mockReturnValue({ upload } as never)

    await adminService.uploadPackagePhoto('pkg-1', file)

    expect(eq).toHaveBeenCalledWith('id', 'pkg-1')
    expect(mockedStorage.from).toHaveBeenCalledWith('package-photos')
    expect(upload).toHaveBeenCalledWith('cust-1/pkg-1/photo.jpg', file)
    expect(insert).toHaveBeenCalledWith({ package_id: 'pkg-1', storage_path: 'cust-1/pkg-1/photo.jpg' })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(adminService.uploadPackagePhoto('pkg-1', file)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the package owner lookup fails', async () => {
    mockSession('staff-1')
    mockTables({ ownerError: { message: 'not found' } })

    await expect(adminService.uploadPackagePhoto('pkg-1', file)).rejects.toThrow('not found')
    expect(mockedStorage.from).not.toHaveBeenCalled()
  })

  it('throws when the storage upload fails and does not insert the row', async () => {
    mockSession('staff-1')
    const { insert } = mockTables()
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'storage boom' } })
    mockedStorage.from.mockReturnValue({ upload } as never)

    await expect(adminService.uploadPackagePhoto('pkg-1', file)).rejects.toThrow('storage boom')
    expect(insert).not.toHaveBeenCalled()
  })

  it('throws when the package_photos insert fails', async () => {
    mockSession('staff-1')
    mockTables({ photoInsertError: { message: 'boom' } })
    const upload = vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null })
    mockedStorage.from.mockReturnValue({ upload } as never)

    await expect(adminService.uploadPackagePhoto('pkg-1', file)).rejects.toThrow('boom')
  })
})

describe('getPackageDetail', () => {
  const pkgRow = {
    id: 'pkg-1',
    store: 'Amazon',
    description: 'Shoes',
    weight_kg: 1.2,
    length_cm: 30,
    width_cm: 20,
    height_cm: 10,
    declared_value_usd: 99.9,
    status: 'received',
    received_at: '2026-07-29T00:00:00Z',
    user_id: 'cust-1',
    location_id: 'loc-1',
    warehouse_locations: { code: 'G-A-01-1-01' },
    profiles: { name: 'Ana', suites: { suite_number: 'BUF-10001' } },
  }

  function mockDetailTables(overrides?: {
    pkg?: unknown
    pkgError?: { message: string }
    photosError?: { message: string }
    historyError?: { message: string }
    photos?: unknown[]
    history?: unknown[]
  }) {
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'packages') {
        const single = vi.fn().mockResolvedValue({
          data: overrides?.pkgError ? null : (overrides?.pkg ?? pkgRow),
          error: overrides?.pkgError ?? null,
        })
        const eq = vi.fn().mockReturnValue({ single })
        return { select: vi.fn().mockReturnValue({ eq }) } as never
      }
      if (table === 'package_photos') {
        const order = vi.fn().mockResolvedValue({
          data: overrides?.photosError ? null : (overrides?.photos ?? []),
          error: overrides?.photosError ?? null,
        })
        const eq = vi.fn().mockReturnValue({ order })
        return { select: vi.fn().mockReturnValue({ eq }) } as never
      }
      if (table === 'package_location_history') {
        const order = vi.fn().mockResolvedValue({
          data: overrides?.historyError ? null : (overrides?.history ?? []),
          error: overrides?.historyError ?? null,
        })
        const eq = vi.fn().mockReturnValue({ order })
        return { select: vi.fn().mockReturnValue({ eq }) } as never
      }
      throw new Error(`unexpected table ${String(table)}`)
    })
  }

  it('returns the package with customer, location code, signed photos and history', async () => {
    mockDetailTables({
      photos: [{ id: 'ph-1', storage_path: 'cust-1/pkg-1/photo.jpg' }],
      history: [
        {
          id: 'h-1',
          moved_at: '2026-07-29T01:00:00Z',
          from_location: null,
          to_location: { code: 'G-A-01-1-01' },
          profiles: { name: 'Op Staff' },
        },
      ],
    })
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/photo.jpg' }, error: null })
    mockedStorage.from.mockReturnValue({ createSignedUrl } as never)

    const result = await adminService.getPackageDetail('pkg-1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(mockedSupabase.from).toHaveBeenCalledWith('package_photos')
    expect(mockedSupabase.from).toHaveBeenCalledWith('package_location_history')
    expect(createSignedUrl).toHaveBeenCalledWith('cust-1/pkg-1/photo.jpg', 3600)
    expect(result).toEqual({
      id: 'pkg-1',
      store: 'Amazon',
      description: 'Shoes',
      weightKg: 1.2,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
      declaredValueUsd: 99.9,
      status: 'received',
      receivedAt: '2026-07-29T00:00:00Z',
      userId: 'cust-1',
      customerName: 'Ana',
      customerSuite: 'BUF-10001',
      locationId: 'loc-1',
      locationCode: 'G-A-01-1-01',
      photos: [{ id: 'ph-1', url: 'https://signed/photo.jpg' }],
      history: [
        {
          id: 'h-1',
          fromCode: null,
          toCode: 'G-A-01-1-01',
          movedByName: 'Op Staff',
          movedAt: '2026-07-29T01:00:00Z',
        },
      ],
    })
  })

  it('handles a package without location, photos or history', async () => {
    mockDetailTables({
      pkg: { ...pkgRow, location_id: null, warehouse_locations: null },
    })

    const result = await adminService.getPackageDetail('pkg-1')

    expect(result.locationId).toBeNull()
    expect(result.locationCode).toBeNull()
    expect(result.photos).toEqual([])
    expect(result.history).toEqual([])
  })

  it('throws when the package query fails', async () => {
    mockDetailTables({ pkgError: { message: 'boom' } })
    await expect(adminService.getPackageDetail('pkg-1')).rejects.toThrow('boom')
  })

  it('throws when a signed URL cannot be created', async () => {
    mockDetailTables({ photos: [{ id: 'ph-1', storage_path: 'cust-1/pkg-1/photo.jpg' }] })
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'sign boom' } })
    mockedStorage.from.mockReturnValue({ createSignedUrl } as never)

    await expect(adminService.getPackageDetail('pkg-1')).rejects.toThrow('sign boom')
  })
})

describe('getPaidConsolidations', () => {
  it('returns paid consolidations with their pick-list items and location codes', async () => {
    const rows = [
      {
        id: 'c1',
        city: 'Springfield',
        country: 'US',
        declared_value_usd: 100,
        carrier: 'DHL',
        tracking_code: null,
        profiles: { name: 'Ana' },
        consolidation_items: [
          {
            packages: {
              id: 'pkg-1',
              store: 'Amazon',
              description: 'Shoes',
              weight_kg: 1.2,
              location_id: 'loc-1',
              warehouse_locations: { code: 'G-A-01-1-01' },
            },
          },
          {
            packages: {
              id: 'pkg-2',
              store: 'Nike',
              description: 'Jacket',
              weight_kg: 0.8,
              location_id: null,
              warehouse_locations: null,
            },
          },
        ],
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPaidConsolidations()

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(eq).toHaveBeenCalledWith('status', 'paid')
    expect(result).toEqual([
      {
        id: 'c1',
        customerName: 'Ana',
        city: 'Springfield',
        country: 'US',
        declaredValueUsd: 100,
        carrier: 'DHL',
        trackingCode: null,
        items: [
          {
            packageId: 'pkg-1',
            store: 'Amazon',
            description: 'Shoes',
            weightKg: 1.2,
            locationId: 'loc-1',
            locationCode: 'G-A-01-1-01',
          },
          {
            packageId: 'pkg-2',
            store: 'Nike',
            description: 'Jacket',
            weightKg: 0.8,
            locationId: null,
            locationCode: null,
          },
        ],
      },
    ])
  })

  it('returns an empty items list when the consolidation has no items embed', async () => {
    const rows = [
      {
        id: 'c2',
        city: 'Rio',
        country: 'BR',
        declared_value_usd: 40,
        carrier: null,
        tracking_code: null,
        profiles: [{ name: 'Bia' }],
        consolidation_items: null,
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await adminService.getPaidConsolidations()

    expect(result[0].customerName).toBe('Bia')
    expect(result[0].items).toEqual([])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(adminService.getPaidConsolidations()).rejects.toThrow('boom')
  })
})

describe('markConsolidationShipped', () => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eqStatus = vi.fn().mockReturnValue({ select })
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus })
    const update = vi.fn().mockReturnValue({ eq: eqId })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eqId, eqStatus, select }
  }

  it('sets carrier, tracking code, status and shipped_at only for paid consolidations', async () => {
    mockSession('staff-1')
    const { update, eqId, eqStatus, select } = mockUpdateChain({ data: [{ id: 'c1' }], error: null })

    await adminService.markConsolidationShipped('c1', { carrier: 'DHL', trackingCode: 'TRK123' })

    expect(mockedSupabase.from).toHaveBeenCalledWith('consolidations')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ carrier: 'DHL', tracking_code: 'TRK123', status: 'shipped' }),
    )
    const updateArg = update.mock.calls[0][0] as { shipped_at: string }
    expect(typeof updateArg.shipped_at).toBe('string')
    expect(eqId).toHaveBeenCalledWith('id', 'c1')
    expect(eqStatus).toHaveBeenCalledWith('status', 'paid')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when no row is affected (consolidation not paid)', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: [], error: null })

    await expect(
      adminService.markConsolidationShipped('c1', { carrier: 'DHL', trackingCode: 'TRK123' }),
    ).rejects.toThrow('Consolidation is not paid or was not found')
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
    mockUpdateChain({ data: null, error: { message: 'boom' } })

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
