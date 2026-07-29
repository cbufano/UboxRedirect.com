import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { DashboardLayout } from './DashboardLayout'
import { authService } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../services/authService', () => ({
  authService: { logout: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedAuth = vi.mocked(authService)
const mockedUseAuth = vi.mocked(useAuth)

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<div>Overview content</div>} />
        </Route>
        <Route path="/" element={<div>Public home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
})

it('shows the signed-in user name', () => {
  renderLayout()
  expect(screen.getByText('Ana')).toBeInTheDocument()
})

it('signs out and navigates home', async () => {
  mockedAuth.logout.mockResolvedValue()
  renderLayout()
  await userEvent.click(screen.getByRole('button', { name: /sign out|log out/i }))
  expect(mockedAuth.logout).toHaveBeenCalled()
  expect(await screen.findByText('Public home')).toBeInTheDocument()
})
