import { profileService } from './profileService'
import { supabase } from '../lib/supabase'

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(), updateUser: jest.fn() },
    from: jest.fn(),
  },
}))

const mockedSupabase = supabase as jest.Mocked<typeof supabase>
const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>

const profileRow = {
  id: 'uuid-1',
  name: 'Ana',
  email: 'ana@example.com',
  country: 'BR',
  preferred_language: 'pt',
  suites: [{ suite_number: 'BUF-10482' }],
}

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

beforeEach(() => jest.clearAllMocks())

describe('getMyProfile', () => {
  it('returns the mapped profile with suite number', async () => {
    mockSession('uuid-1')
    const single = jest.fn().mockResolvedValue({ data: profileRow, error: null })
    const eq = jest.fn().mockReturnValue({ single })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const profile = await profileService.getMyProfile()

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'uuid-1')
    expect(profile).toEqual({
      id: 'uuid-1',
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      preferredLanguage: 'pt',
      suiteNumber: 'BUF-10482',
    })
  })

  it('returns null when signed out', async () => {
    mockSession(null)
    expect(await profileService.getMyProfile()).toBeNull()
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = jest.fn().mockReturnValue({ single })
    const select = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(profileService.getMyProfile()).rejects.toThrow('boom')
  })
})

describe('updateMyProfile', () => {
  it('updates the profiles row and keeps auth metadata in sync', async () => {
    mockSession('uuid-1')
    const eq = jest.fn().mockResolvedValue({ data: null, error: null })
    const update = jest.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    mockedAuth.updateUser.mockResolvedValue({ data: { user: null }, error: null } as never)

    await profileService.updateMyProfile({ name: 'Ana Maria', country: 'PT' })

    expect(update).toHaveBeenCalledWith({ name: 'Ana Maria', country: 'PT' })
    expect(eq).toHaveBeenCalledWith('id', 'uuid-1')
    expect(mockedAuth.updateUser).toHaveBeenCalledWith({ data: { name: 'Ana Maria', country: 'PT' } })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(profileService.updateMyProfile({ name: 'X', country: 'BR' })).rejects.toThrow()
  })
})
