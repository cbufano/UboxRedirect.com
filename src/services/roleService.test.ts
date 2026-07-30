import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleService, isStaffRole } from './roleService'
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

describe('getMyRoles', () => {
  it('returns the mapped roles for the current user', async () => {
    mockSession('uuid-1')
    const eq = vi.fn().mockResolvedValue({ data: [{ role: 'ops' }, { role: 'admin' }], error: null })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const roles = await roleService.getMyRoles()

    expect(mockedSupabase.from).toHaveBeenCalledWith('user_roles')
    expect(select).toHaveBeenCalledWith('role')
    expect(eq).toHaveBeenCalledWith('user_id', 'uuid-1')
    expect(roles).toEqual(['ops', 'admin'])
  })

  it('returns an empty array when signed out, without querying', async () => {
    mockSession(null)
    expect(await roleService.getMyRoles()).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('returns an empty array instead of throwing when the query fails', async () => {
    mockSession('uuid-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    expect(await roleService.getMyRoles()).toEqual([])
  })

  it('returns an empty array instead of throwing when the session lookup itself throws', async () => {
    mockedAuth.getSession.mockRejectedValue(new Error('network down'))
    expect(await roleService.getMyRoles()).toEqual([])
  })
})

describe('isStaff', () => {
  it.each(['ops', 'admin', 'super_admin'] as const)('is true when roles include %s', async (role) => {
    mockSession('uuid-1')
    const eq = vi.fn().mockResolvedValue({ data: [{ role }], error: null })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    expect(await roleService.isStaff()).toBe(true)
  })

  it('is false for customer/support-only roles', async () => {
    mockSession('uuid-1')
    const eq = vi.fn().mockResolvedValue({ data: [{ role: 'customer' }, { role: 'support' }], error: null })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    expect(await roleService.isStaff()).toBe(false)
  })

  it('is false when signed out', async () => {
    mockSession(null)
    expect(await roleService.isStaff()).toBe(false)
  })
})

describe('isStaffRole (pure helper)', () => {
  it('is true when roles include ops, admin, or super_admin', () => {
    expect(isStaffRole(['customer', 'ops'])).toBe(true)
    expect(isStaffRole(['admin'])).toBe(true)
    expect(isStaffRole(['super_admin'])).toBe(true)
  })

  it('is false for empty, customer-only, or support-only roles', () => {
    expect(isStaffRole([])).toBe(false)
    expect(isStaffRole(['customer'])).toBe(false)
    expect(isStaffRole(['support'])).toBe(false)
    expect(isStaffRole(['customer', 'support'])).toBe(false)
  })
})
