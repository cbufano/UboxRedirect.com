import { authService, TERMS_VERSION } from './authService'
import { supabase } from '../lib/supabase'

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}))

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>

const supabaseUser = {
  id: 'uuid-1',
  email: 'ana@example.com',
  user_metadata: { name: 'Ana', country: 'BR' },
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('register', () => {
  it('signs up with profile metadata and no emailRedirectTo', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: supabaseUser, session: null },
      error: null,
    } as never)

    const result = await authService.register({
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      password: 'secret12',
    })

    expect(mockedAuth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secret12',
      options: {
        data: { name: 'Ana', country: 'BR', terms_accepted: true, terms_version: TERMS_VERSION },
      },
    })
    expect(result.user).toEqual({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
    expect(result.needsEmailConfirmation).toBe(true)
  })

  it('reports no confirmation needed when a session is returned', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: supabaseUser, session: { access_token: 'x' } },
      error: null,
    } as never)

    const result = await authService.register({
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      password: 'secret12',
    })
    expect(result.needsEmailConfirmation).toBe(false)
  })

  it('throws on signUp error', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    } as never)

    await expect(
      authService.register({ name: 'Ana', email: 'ana@example.com', country: 'BR', password: 'secret12' }),
    ).rejects.toThrow('User already registered')
  })

  it('preserves the original Supabase error as the thrown error cause', async () => {
    const supabaseError = { message: 'User already registered', status: 400 }
    mockedAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: supabaseError,
    } as never)

    await expect(
      authService.register({ name: 'Ana', email: 'ana@example.com', country: 'BR', password: 'secret12' }),
    ).rejects.toMatchObject({ cause: supabaseError })
  })
})

describe('login', () => {
  it('returns the mapped user on success', async () => {
    mockedAuth.signInWithPassword.mockResolvedValue({
      data: { user: supabaseUser, session: { access_token: 'x' } },
      error: null,
    } as never)

    const user = await authService.login('ana@example.com', 'secret12')
    expect(user).toEqual({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
  })

  it('throws on invalid credentials', async () => {
    mockedAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never)

    await expect(authService.login('ana@example.com', 'wrong')).rejects.toThrow('Invalid login credentials')
  })
})

describe('session', () => {
  it('getSession maps the current user', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: { user: supabaseUser } },
      error: null,
    } as never)

    expect(await authService.getSession()).toEqual({
      id: 'uuid-1',
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
    })
  })

  it('getSession returns null when signed out', async () => {
    mockedAuth.getSession.mockResolvedValue({ data: { session: null }, error: null } as never)
    expect(await authService.getSession()).toBeNull()
  })

  it('getSession returns null (not throw) when the call errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network error' },
    } as never)

    expect(await authService.getSession()).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('authService.getSession failed:', 'network error')
    consoleSpy.mockRestore()
  })

  it('onAuthStateChange forwards mapped users and returns an unsubscriber', () => {
    const unsubscribe = jest.fn()
    mockedAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    } as never)

    const callback = jest.fn()
    const dispose = authService.onAuthStateChange(callback)

    const registered = mockedAuth.onAuthStateChange.mock.calls[0][0]
    registered('SIGNED_IN', { user: supabaseUser } as never)
    expect(callback).toHaveBeenCalledWith({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })

    dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('logout signs out', async () => {
    mockedAuth.signOut.mockResolvedValue({ error: null } as never)
    await authService.logout()
    expect(mockedAuth.signOut).toHaveBeenCalled()
  })
})
