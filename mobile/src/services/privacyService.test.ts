import { privacyService } from './privacyService'
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

describe('submitDataRequest', () => {
  it('inserts a data request for the current user', async () => {
    mockSession('uuid-1')
    const insert = jest.fn().mockResolvedValue({ data: null, error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await privacyService.submitDataRequest({ kind: 'export', requestNote: 'Please send my data' })

    expect(mockedSupabase.from).toHaveBeenCalledWith('data_requests')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'uuid-1',
      kind: 'export',
      request_note: 'Please send my data',
    })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(
      privacyService.submitDataRequest({ kind: 'delete', requestNote: '' }),
    ).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('uuid-1')
    const insert = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(
      privacyService.submitDataRequest({ kind: 'export', requestNote: '' }),
    ).rejects.toThrow('boom')
  })
})

describe('getMyDataRequests', () => {
  const row = {
    id: 'r1',
    kind: 'export' as const,
    status: 'pending' as const,
    request_note: 'note',
    resolution_notes: '',
    requested_at: '2026-07-01T00:00:00Z',
    completed_at: null,
  }

  it('returns the mapped, newest-first data requests for the current user', async () => {
    mockSession('uuid-1')
    const order = jest.fn().mockResolvedValue({ data: [row], error: null })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await privacyService.getMyDataRequests()

    expect(mockedSupabase.from).toHaveBeenCalledWith('data_requests')
    expect(eq).toHaveBeenCalledWith('user_id', 'uuid-1')
    expect(order).toHaveBeenCalledWith('requested_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'r1',
        kind: 'export',
        status: 'pending',
        requestNote: 'note',
        resolutionNotes: '',
        requestedAt: '2026-07-01T00:00:00Z',
        completedAt: null,
      },
    ])
  })

  it('returns an empty array when signed out', async () => {
    mockSession(null)
    expect(await privacyService.getMyDataRequests()).toEqual([])
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = jest.fn().mockReturnValue({ order })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(privacyService.getMyDataRequests()).rejects.toThrow('boom')
  })
})
