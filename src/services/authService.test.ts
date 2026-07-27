import { describe, it, expect, beforeEach } from 'vitest'
import { authService } from './authService'

beforeEach(() => localStorage.clear())

describe('authService', () => {
  it('registers and creates a session', () => {
    const u = authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    expect(u.email).toBe('a@x.com')
    expect(authService.getSession()?.email).toBe('a@x.com')
  })
  it('logs in with correct credentials', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    authService.logout()
    const u = authService.login('a@x.com', 'secret12')
    expect(u.email).toBe('a@x.com')
  })
  it('throws on wrong password', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    expect(() => authService.login('a@x.com', 'nope')).toThrow()
  })
  it('throws when logging in a non-existent user', () => {
    expect(() => authService.login('ghost@x.com', 'whatever')).toThrow()
  })
  it('throws when registering an email that already exists', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    expect(() => authService.register({ name: 'Bob', email: 'a@x.com', country: 'US', password: 'other123' })).toThrow()
  })
  it('logout clears the session', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    authService.logout()
    expect(authService.getSession()).toBeNull()
  })
  it('returns null session when nobody is logged in', () => {
    expect(authService.getSession()).toBeNull()
  })
})
