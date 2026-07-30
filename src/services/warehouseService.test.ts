import { describe, it, expect, vi, beforeEach } from 'vitest'
import { warehouseService } from './warehouseService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
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

describe('generateGrid', () => {
  it('calls the rpc with the grid arguments and returns the created count', async () => {
    mockSession('admin-1')
    mockedSupabase.rpc.mockResolvedValue({ data: 180, error: null } as never)

    const count = await warehouseService.generateGrid('G', ['A', 'B'], 10, 3, 3)

    expect(mockedSupabase.rpc).toHaveBeenCalledWith('generate_warehouse_locations', {
      _zone: 'G',
      _aisles: ['A', 'B'],
      _racks: 10,
      _levels: 3,
      _bins: 3,
    })
    expect(count).toBe(180)
  })

  it('defaults a missing count to zero', async () => {
    mockSession('admin-1')
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: null } as never)

    expect(await warehouseService.generateGrid('G', ['A'], 1, 1, 1)).toBe(0)
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(warehouseService.generateGrid('G', ['A'], 1, 1, 1)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.rpc).not.toHaveBeenCalled()
  })

  it('throws when the rpc fails', async () => {
    mockSession('admin-1')
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } } as never)

    await expect(warehouseService.generateGrid('G', ['A'], 1, 1, 1)).rejects.toThrow('boom')
  })
})

describe('nextFreeLocation', () => {
  it('returns the first free location suggested by the rpc', async () => {
    mockSession('staff-1')
    mockedSupabase.rpc.mockResolvedValue({
      data: [{ id: 'loc-1', code: 'G-A-01-1-01' }],
      error: null,
    } as never)

    const result = await warehouseService.nextFreeLocation()

    expect(mockedSupabase.rpc).toHaveBeenCalledWith('next_free_location')
    expect(result).toEqual({ id: 'loc-1', code: 'G-A-01-1-01' })
  })

  it('returns null when the warehouse has no free location', async () => {
    mockSession('staff-1')
    mockedSupabase.rpc.mockResolvedValue({ data: [], error: null } as never)

    expect(await warehouseService.nextFreeLocation()).toBeNull()
  })

  it('returns null when the rpc returns no data', async () => {
    mockSession('staff-1')
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: null } as never)

    expect(await warehouseService.nextFreeLocation()).toBeNull()
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(warehouseService.nextFreeLocation()).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.rpc).not.toHaveBeenCalled()
  })

  it('throws when the rpc fails', async () => {
    mockSession('staff-1')
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } } as never)

    await expect(warehouseService.nextFreeLocation()).rejects.toThrow('boom')
  })
})

describe('getOccupancy', () => {
  it('returns mapped occupancy slots ordered by code', async () => {
    mockSession('staff-1')
    const rows = [
      {
        id: 'loc-1',
        code: 'G-A-01-1-01',
        zone: 'G',
        aisle: 'A',
        rack: '01',
        level: '1',
        bin: '01',
        active: true,
        package_id: 'pkg-1',
        package_status: 'received',
        suite_number: 'BUF-10001',
      },
      {
        id: 'loc-2',
        code: 'G-A-01-1-02',
        zone: 'G',
        aisle: 'A',
        rack: '01',
        level: '1',
        bin: '02',
        active: false,
        package_id: null,
        package_status: null,
        suite_number: null,
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await warehouseService.getOccupancy()

    expect(mockedSupabase.from).toHaveBeenCalledWith('warehouse_occupancy')
    expect(order).toHaveBeenCalledWith('code', { ascending: true })
    expect(result).toEqual([
      {
        id: 'loc-1',
        code: 'G-A-01-1-01',
        zone: 'G',
        aisle: 'A',
        rack: '01',
        level: '1',
        bin: '01',
        active: true,
        packageId: 'pkg-1',
        packageStatus: 'received',
        suiteNumber: 'BUF-10001',
      },
      {
        id: 'loc-2',
        code: 'G-A-01-1-02',
        zone: 'G',
        aisle: 'A',
        rack: '01',
        level: '1',
        bin: '02',
        active: false,
        packageId: null,
        packageStatus: null,
        suiteNumber: null,
      },
    ])
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(warehouseService.getOccupancy()).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('staff-1')
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(warehouseService.getOccupancy()).rejects.toThrow('boom')
  })
})

describe('setLocationActive', () => {
  it('updates the location and confirms a row was affected', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'loc-1' }], error: null })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await warehouseService.setLocationActive('loc-1', false)

    expect(mockedSupabase.from).toHaveBeenCalledWith('warehouse_locations')
    expect(update).toHaveBeenCalledWith({ active: false })
    expect(eq).toHaveBeenCalledWith('id', 'loc-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when no row is affected', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(warehouseService.setLocationActive('loc-1', true)).rejects.toThrow(
      'Location not found or update not permitted',
    )
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(warehouseService.setLocationActive('loc-1', true)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(warehouseService.setLocationActive('loc-1', true)).rejects.toThrow('boom')
  })
})

describe('movePackage', () => {
  it('updates the package location and confirms a row was affected', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'pkg-1' }], error: null })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await warehouseService.movePackage('pkg-1', 'loc-2')

    expect(mockedSupabase.from).toHaveBeenCalledWith('packages')
    expect(update).toHaveBeenCalledWith({ location_id: 'loc-2' })
    expect(eq).toHaveBeenCalledWith('id', 'pkg-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('accepts null to clear the location', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'pkg-1' }], error: null })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await warehouseService.movePackage('pkg-1', null)

    expect(update).toHaveBeenCalledWith({ location_id: null })
  })

  it('throws when no row is affected', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(warehouseService.movePackage('pkg-1', 'loc-2')).rejects.toThrow(
      'Package not found or update not permitted',
    )
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(warehouseService.movePackage('pkg-1', 'loc-2')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)

    await expect(warehouseService.movePackage('pkg-1', 'loc-2')).rejects.toThrow('boom')
  })
})
