import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { peopleAdminService } from './peopleAdminService'
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

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (onFulfilled: (value: QueryResult) => unknown) => Promise<unknown>
}

/**
 * Cadeia fluente awaitável (thenable): qualquer sequência
 * select/eq/in/or/ilike/order/limit devolve a própria cadeia e `await` resolve
 * no resultado — permite mockar as várias formas de query do serviço com as
 * chamadas ainda inspecionáveis.
 */
function queryChain(result: QueryResult): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.ilike = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = (onFulfilled) => Promise.resolve(result).then(onFulfilled)
  return chain
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('searchCustomers', () => {
  const profileEmbed = {
    name: 'Ana',
    email: 'ana@example.com',
    country: 'BR',
    suspended_at: null,
    kyc_status: 'verified',
    ofac_screening_status: 'clear',
  }

  it('returns an empty list for a blank query without touching the database', async () => {
    expect(await peopleAdminService.searchCustomers('   ')).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('searches by exact suite (case-insensitive) when the query looks like BUF-…', async () => {
    const suites = queryChain({
      data: [{ user_id: 'user-1', suite_number: 'BUF-10482', profiles: profileEmbed }],
      error: null,
    })
    mockedSupabase.from.mockReturnValue(suites as never)

    const result = await peopleAdminService.searchCustomers('buf-10482')

    expect(mockedSupabase.from).toHaveBeenCalledTimes(1)
    expect(mockedSupabase.from).toHaveBeenCalledWith('suites')
    expect(suites.ilike).toHaveBeenCalledWith('suite_number', 'buf-10482')
    expect(suites.limit).toHaveBeenCalledWith(20)
    expect(result).toEqual([
      {
        userId: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        country: 'BR',
        suiteNumber: 'BUF-10482',
        suspendedAt: null,
        kycStatus: 'verified',
        ofacStatus: 'clear',
      },
    ])
  })

  it('falls back to name/email search when the BUF-… suite does not exist', async () => {
    const suites = queryChain({ data: [], error: null })
    const profiles = queryChain({
      data: [
        {
          id: 'user-2',
          name: 'Buf-eteria Ltda',
          email: 'contato@bufeteria.com',
          country: 'BR',
          suspended_at: '2026-07-01T00:00:00Z',
          kyc_status: 'pending',
          ofac_screening_status: 'not_started',
          suites: [{ suite_number: 'BUF-20001' }],
        },
      ],
      error: null,
    })
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'suites') return suites as never
      if (table === 'profiles') return profiles as never
      throw new Error(`unexpected table ${String(table)}`)
    })

    const result = await peopleAdminService.searchCustomers('BUF-eteria')

    expect(profiles.or).toHaveBeenCalledWith('name.ilike.%BUF-eteria%,email.ilike.%BUF-eteria%')
    expect(result).toEqual([
      {
        userId: 'user-2',
        name: 'Buf-eteria Ltda',
        email: 'contato@bufeteria.com',
        country: 'BR',
        suiteNumber: 'BUF-20001',
        suspendedAt: '2026-07-01T00:00:00Z',
        kycStatus: 'pending',
        ofacStatus: 'not_started',
      },
    ])
  })

  it('searches profiles by name or email with a 20-row limit', async () => {
    const profiles = queryChain({
      data: [
        {
          id: 'user-3',
          name: 'Carlos',
          email: 'carlos@example.com',
          country: 'PT',
          suspended_at: null,
          kyc_status: 'not_started',
          ofac_screening_status: 'not_started',
          suites: null,
        },
      ],
      error: null,
    })
    mockedSupabase.from.mockReturnValue(profiles as never)

    const result = await peopleAdminService.searchCustomers('carlos')

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(profiles.or).toHaveBeenCalledWith('name.ilike.%carlos%,email.ilike.%carlos%')
    expect(profiles.limit).toHaveBeenCalledWith(20)
    expect(result[0]).toMatchObject({ userId: 'user-3', suiteNumber: null })
  })

  it('strips commas and parentheses from the query before building the .or() filter', async () => {
    const profiles = queryChain({ data: [], error: null })
    mockedSupabase.from.mockReturnValue(profiles as never)

    await peopleAdminService.searchCustomers('Silva, Ana (mãe)')

    expect(profiles.or).toHaveBeenCalledWith('name.ilike.%Silva Ana mãe%,email.ilike.%Silva Ana mãe%')
  })

  it('returns an empty list when the query is only PostgREST syntax characters', async () => {
    expect(await peopleAdminService.searchCustomers('(,)')).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the suite query fails', async () => {
    mockedSupabase.from.mockReturnValue(queryChain({ data: null, error: { message: 'boom' } }) as never)
    await expect(peopleAdminService.searchCustomers('BUF-1')).rejects.toThrow('boom')
  })

  it('throws when the profile query fails', async () => {
    mockedSupabase.from.mockReturnValue(queryChain({ data: null, error: { message: 'boom' } }) as never)
    await expect(peopleAdminService.searchCustomers('ana')).rejects.toThrow('boom')
  })
})

describe('getCustomerProfile', () => {
  function mockTables(overrides: Partial<Record<string, QueryChain>> = {}) {
    const chains = {
      profiles:
        overrides.profiles ??
        queryChain({
          data: {
            id: 'user-1',
            name: 'Ana',
            email: 'ana@example.com',
            country: 'BR',
            suspended_at: null,
            kyc_status: 'verified',
            ofac_screening_status: 'clear',
            suites: { suite_number: 'BUF-10482' },
          },
          error: null,
        }),
      packages: overrides.packages ?? queryChain({ data: [{ id: 'pkg-1', store: 'Amazon', status: 'ready' }], error: null }),
      consolidations:
        overrides.consolidations ??
        queryChain({ data: [{ id: 'con-1', status: 'paid', city: 'São Paulo', country: 'BR' }], error: null }),
      payments:
        overrides.payments ??
        queryChain({ data: [{ id: 'pay-1', amount_usd: 42.5, provider: 'stripe', status: 'succeeded' }], error: null }),
      data_requests:
        overrides.data_requests ?? queryChain({ data: [{ id: 'req-1', kind: 'export', status: 'pending' }], error: null }),
      customer_notes:
        overrides.customer_notes ??
        queryChain({
          data: [{ id: 'note-1', note: 'VIP', created_at: '2026-07-29T10:00:00Z', author: { name: 'Beto (staff)' } }],
          error: null,
        }),
    }
    mockedSupabase.from.mockImplementation((table: unknown) => {
      const chain = chains[table as keyof typeof chains]
      if (!chain) throw new Error(`unexpected table ${String(table)}`)
      return chain as never
    })
    return chains
  }

  it('returns the profile with short lists of packages, consolidations, payments, data requests and notes', async () => {
    const chains = mockTables()

    const result = await peopleAdminService.getCustomerProfile('user-1')

    // pacotes vivos: fora de shipped/discarded, até 10
    expect(chains.packages.in).toHaveBeenCalledWith('status', ['received', 'in_review', 'ready', 'consolidating'])
    expect(chains.packages.limit).toHaveBeenCalledWith(10)
    expect(chains.consolidations.limit).toHaveBeenCalledWith(10)
    expect(chains.payments.limit).toHaveBeenCalledWith(10)
    expect(chains.data_requests.limit).toHaveBeenCalledWith(10)
    // notas: embed desambiguado pela FK author_id, mais recentes primeiro
    expect(chains.customer_notes.select).toHaveBeenCalledWith('id, note, created_at, author:profiles!author_id (name)')
    expect(chains.customer_notes.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chains.customer_notes.eq).toHaveBeenCalledWith('user_id', 'user-1')

    expect(result).toEqual({
      userId: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      suiteNumber: 'BUF-10482',
      suspendedAt: null,
      kycStatus: 'verified',
      ofacStatus: 'clear',
      packages: [{ id: 'pkg-1', store: 'Amazon', status: 'ready' }],
      consolidations: [{ id: 'con-1', status: 'paid', city: 'São Paulo', country: 'BR' }],
      payments: [{ id: 'pay-1', amountUsd: 42.5, provider: 'stripe', status: 'succeeded' }],
      dataRequests: [{ id: 'req-1', kind: 'export', status: 'pending' }],
      notes: [{ id: 'note-1', note: 'VIP', authorName: 'Beto (staff)', createdAt: '2026-07-29T10:00:00Z' }],
    })
  })

  it('throws when the profile query fails', async () => {
    mockTables({ profiles: queryChain({ data: null, error: { message: 'not found' } }) })

    await expect(peopleAdminService.getCustomerProfile('user-1')).rejects.toThrow('not found')
  })

  it('throws when one of the list queries fails', async () => {
    mockTables({ payments: queryChain({ data: null, error: { message: 'boom' } }) })
    await expect(peopleAdminService.getCustomerProfile('user-1')).rejects.toThrow('boom')
  })
})

describe('addCustomerNote', () => {
  it('inserts the trimmed note with the signed-in staff as author', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await peopleAdminService.addCustomerNote('user-1', '  Cliente pediu retirada em mãos  ')

    expect(mockedSupabase.from).toHaveBeenCalledWith('customer_notes')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      author_id: 'staff-1',
      note: 'Cliente pediu retirada em mãos',
    })
  })

  it('throws on an empty/whitespace note before touching the database', async () => {
    await expect(peopleAdminService.addCustomerNote('user-1', '   ')).rejects.toThrow('Note cannot be empty')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
    expect(mockedAuth.getSession).not.toHaveBeenCalled()
  })

  it('throws when signed out without touching the database', async () => {
    mockSession(null)
    await expect(peopleAdminService.addCustomerNote('user-1', 'nota')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ error: { message: 'rls denied' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(peopleAdminService.addCustomerNote('user-1', 'nota')).rejects.toThrow('rls denied')
  })
})

describe('setSuspended', () => {
  function mockUpdateChain(result: QueryResult) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eq, select }
  }

  it('suspends by writing the current timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'))
    mockSession('staff-1')
    const { update, eq, select } = mockUpdateChain({ data: [{ id: 'user-1' }], error: null })

    await peopleAdminService.setSuspended('user-1', true)

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ suspended_at: '2026-07-30T12:00:00.000Z' })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('reactivates by clearing suspended_at', async () => {
    mockSession('staff-1')
    const { update } = mockUpdateChain({ data: [{ id: 'user-1' }], error: null })

    await peopleAdminService.setSuspended('user-1', false)

    expect(update).toHaveBeenCalledWith({ suspended_at: null })
  })

  it('throws when no row is affected (missing profile)', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: [], error: null })

    await expect(peopleAdminService.setSuspended('user-1', true)).rejects.toThrow('Profile was not found')
  })

  it('throws when signed out without touching the database', async () => {
    mockSession(null)
    await expect(peopleAdminService.setSuspended('user-1', true)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(peopleAdminService.setSuspended('user-1', true)).rejects.toThrow('boom')
  })
})

describe('listUsersWithRoles', () => {
  // user_roles não tem FK para profiles (aponta para auth.users), então o
  // serviço faz DUAS consultas (papéis + perfis por id) e junta no código.
  function mockTables(rolesResult: QueryResult, profilesResult: QueryResult) {
    const rolesSelect = vi.fn().mockResolvedValue(rolesResult)
    const profilesIn = vi.fn().mockResolvedValue(profilesResult)
    const profilesSelect = vi.fn().mockReturnValue({ in: profilesIn })
    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'user_roles') return { select: rolesSelect } as never
      if (table === 'profiles') return { select: profilesSelect } as never
      throw new Error(`unexpected table ${String(table)}`)
    })
    return { rolesSelect, profilesSelect, profilesIn }
  }

  it('aggregates one entry per user with all their roles, sorted by name', async () => {
    const { rolesSelect, profilesSelect, profilesIn } = mockTables(
      {
        data: [
          { user_id: 'user-2', role: 'customer' },
          { user_id: 'user-1', role: 'customer' },
          { user_id: 'user-1', role: 'ops' },
        ],
        error: null,
      },
      {
        data: [
          { id: 'user-1', name: 'Ana', email: 'ana@example.com' },
          { id: 'user-2', name: 'Beto', email: 'beto@example.com' },
        ],
        error: null,
      },
    )

    const result = await peopleAdminService.listUsersWithRoles()

    expect(mockedSupabase.from).toHaveBeenCalledWith('user_roles')
    expect(rolesSelect).toHaveBeenCalledWith('user_id, role')
    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(profilesSelect).toHaveBeenCalledWith('id, name, email')
    // ids deduplicados: user-1 aparece duas vezes em user_roles
    expect(profilesIn).toHaveBeenCalledWith('id', ['user-2', 'user-1'])
    expect(result).toEqual([
      { userId: 'user-1', name: 'Ana', email: 'ana@example.com', roles: ['customer', 'ops'] },
      { userId: 'user-2', name: 'Beto', email: 'beto@example.com', roles: ['customer'] },
    ])
  })

  it('falls back to empty name/email for a user_id without a matching profile', async () => {
    const { profilesIn } = mockTables(
      { data: [{ user_id: 'user-9', role: 'customer' }], error: null },
      { data: [], error: null },
    )

    const result = await peopleAdminService.listUsersWithRoles()

    expect(profilesIn).toHaveBeenCalledWith('id', ['user-9'])
    expect(result).toEqual([{ userId: 'user-9', name: '', email: '', roles: ['customer'] }])
  })

  it('skips the profiles query entirely when there are no roles', async () => {
    mockTables({ data: [], error: null }, { data: [], error: null })

    const result = await peopleAdminService.listUsersWithRoles()

    expect(result).toEqual([])
    expect(mockedSupabase.from).toHaveBeenCalledTimes(1)
    expect(mockedSupabase.from).toHaveBeenCalledWith('user_roles')
  })

  it('throws when the user_roles query fails without querying profiles', async () => {
    mockTables({ data: null, error: { message: 'boom' } }, { data: [], error: null })

    await expect(peopleAdminService.listUsersWithRoles()).rejects.toThrow('boom')
    expect(mockedSupabase.from).not.toHaveBeenCalledWith('profiles')
  })

  it('throws when the profiles query fails', async () => {
    mockTables(
      { data: [{ user_id: 'user-1', role: 'customer' }], error: null },
      { data: null, error: { message: 'profiles down' } },
    )

    await expect(peopleAdminService.listUsersWithRoles()).rejects.toThrow('profiles down')
  })
})

describe('setUserRole', () => {
  it('calls the set_user_role RPC with the target and new role', async () => {
    mockSession('admin-1')
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: null } as never)

    await peopleAdminService.setUserRole('user-1', 'ops')

    expect(mockedSupabase.rpc).toHaveBeenCalledWith('set_user_role', { _target: 'user-1', _new_role: 'ops' })
  })

  it('passes through the intentional error messages from the RPC', async () => {
    mockSession('admin-1')
    mockedSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'You cannot change your own role' },
    } as never)

    await expect(peopleAdminService.setUserRole('admin-1', 'customer')).rejects.toThrow(
      'You cannot change your own role',
    )
  })

  it('throws when signed out without calling the RPC', async () => {
    mockSession(null)
    await expect(peopleAdminService.setUserRole('user-1', 'ops')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.rpc).not.toHaveBeenCalled()
  })
})

describe('getAuditLog', () => {
  it('returns mapped entries newest first, with a null actor shown as system', async () => {
    const rows = [
      {
        id: 'log-1',
        action: 'role.changed',
        entity: 'user',
        entity_id: 'user-1',
        detail: { new_role: 'ops' },
        created_at: '2026-07-30T10:00:00Z',
        profiles: { name: 'Admin Ana' },
      },
      {
        id: 'log-2',
        action: 'payment.recorded',
        entity: 'payment',
        entity_id: null,
        detail: null,
        created_at: '2026-07-29T10:00:00Z',
        profiles: null,
      },
    ]
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
    const order = vi.fn().mockReturnValue({ limit })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await peopleAdminService.getAuditLog()

    expect(mockedSupabase.from).toHaveBeenCalledWith('audit_log')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(result).toEqual([
      {
        id: 'log-1',
        actorName: 'Admin Ana',
        action: 'role.changed',
        entity: 'user',
        entityId: 'user-1',
        detail: { new_role: 'ops' },
        createdAt: '2026-07-30T10:00:00Z',
      },
      {
        id: 'log-2',
        actorName: 'system',
        action: 'payment.recorded',
        entity: 'payment',
        entityId: null,
        detail: {},
        createdAt: '2026-07-29T10:00:00Z',
      },
    ])
  })

  it('honours a custom limit', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn().mockReturnValue({ limit })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await peopleAdminService.getAuditLog(25)

    expect(limit).toHaveBeenCalledWith(25)
  })

  it('throws when the query fails', async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const order = vi.fn().mockReturnValue({ limit })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(peopleAdminService.getAuditLog()).rejects.toThrow('boom')
  })
})
