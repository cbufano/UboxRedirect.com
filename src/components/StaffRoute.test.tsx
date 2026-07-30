import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { StaffRoute } from './StaffRoute'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/RoleContext', () => ({ useRole: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseRole = vi.mocked(useRole)

function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <StaffRoute>
              <div>Staff area</div>
            </StaffRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/app" element={<div>Customer dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while auth is resolving', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: true })
  mockedUseRole.mockReturnValue({ roles: [], loading: true })
  renderGuard()
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('shows a loading state while roles are resolving', () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedUseRole.mockReturnValue({ roles: [], loading: true })
  renderGuard()
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('redirects to /login when there is no user', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: false })
  mockedUseRole.mockReturnValue({ roles: [], loading: false })
  renderGuard()
  expect(screen.getByText('Login page')).toBeInTheDocument()
})

it('redirects a signed-in non-staff user to /app', () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedUseRole.mockReturnValue({ roles: ['customer'], loading: false })
  renderGuard()
  expect(screen.getByText('Customer dashboard')).toBeInTheDocument()
})

it('renders children for ops/admin/super_admin', () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  renderGuard()
  expect(screen.getByText('Staff area')).toBeInTheDocument()
})
