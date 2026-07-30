import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { AdminLayout } from './AdminLayout'
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
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
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

it('shows the signed-in staff name and a staff badge', () => {
  renderLayout()
  expect(screen.getByText('Ana')).toBeInTheDocument()
  // getAll: além do badge, o item de navegação "Staff" também usa a palavra.
  expect(screen.getAllByText(/staff/i).length).toBeGreaterThan(0)
})

it('signs out and navigates home', async () => {
  mockedAuth.logout.mockResolvedValue()
  renderLayout()
  await userEvent.click(screen.getByRole('button', { name: /sign out|log out/i }))
  expect(mockedAuth.logout).toHaveBeenCalled()
  expect(await screen.findByText('Public home')).toBeInTheDocument()
})
