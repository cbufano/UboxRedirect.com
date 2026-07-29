import { render, screen } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { authService } from '../services/authService'

vi.mock('../services/authService', () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

const mocked = vi.mocked(authService)

function Probe() {
  const { user, loading } = useAuth()
  if (loading) return <p>probe:loading</p>
  return <p>{user ? `probe:${user.name}` : 'probe:anonymous'}</p>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.onAuthStateChange.mockReturnValue(() => {})
})

it('starts loading, then exposes the session user', async () => {
  mocked.getSession.mockResolvedValue({ id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  expect(screen.getByText('probe:loading')).toBeInTheDocument()
  expect(await screen.findByText('probe:Ana')).toBeInTheDocument()
})

it('exposes null user when signed out', async () => {
  mocked.getSession.mockResolvedValue(null)
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  expect(await screen.findByText('probe:anonymous')).toBeInTheDocument()
})

it('updates when auth state changes', async () => {
  mocked.getSession.mockResolvedValue(null)
  let fire: (user: { id: string; name: string; email: string; country: string } | null) => void = () => {}
  mocked.onAuthStateChange.mockImplementation((cb) => {
    fire = cb
    return () => {}
  })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await screen.findByText('probe:anonymous')
  fire({ id: '1', name: 'Bia', email: 'b@b.c', country: 'PT' })
  expect(await screen.findByText('probe:Bia')).toBeInTheDocument()
})
