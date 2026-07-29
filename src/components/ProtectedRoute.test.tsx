import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
const mockedUseAuth = vi.mocked(useAuth)

function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <div>Private area</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while the session resolves', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: true })
  renderGuard()
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('redirects to /login when there is no user', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: false })
  renderGuard()
  expect(screen.getByText('Login page')).toBeInTheDocument()
})

it('renders children when authenticated', () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  renderGuard()
  expect(screen.getByText('Private area')).toBeInTheDocument()
})
