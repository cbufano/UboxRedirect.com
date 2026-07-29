import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Login from './Login'

vi.mock('../../services/authService', () => ({
  authService: { login: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows an error when credentials are invalid', async () => {
  mocked.login.mockRejectedValue(new Error('Invalid login credentials'))
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'nobody@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('navigates to the dashboard on successful login', async () => {
  mocked.login.mockResolvedValue({ id: '1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'secret12')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
  expect(mocked.login).toHaveBeenCalledWith('ana@example.com', 'secret12')
})
