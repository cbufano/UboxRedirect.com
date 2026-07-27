import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { authService } from '../services/authService'
import { ProtectedRoute } from './ProtectedRoute'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/app" element={<ProtectedRoute><div>Secret</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  )
}

it('redirects to /login when there is no session', () => {
  vi.spyOn(authService, 'getSession').mockReturnValue(null)
  renderAt('/app')
  expect(screen.getByText('Login Page')).toBeInTheDocument()
  expect(screen.queryByText('Secret')).not.toBeInTheDocument()
})

it('renders children when a session exists', () => {
  vi.spyOn(authService, 'getSession').mockReturnValue({ id: 'a@x.com', name: 'Ana', email: 'a@x.com', country: 'BR' })
  renderAt('/app')
  expect(screen.getByText('Secret')).toBeInTheDocument()
})
