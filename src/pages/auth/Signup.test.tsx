import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Signup from './Signup'

vi.mock('../../services/authService', () => ({
  authService: { register: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderSignup() {
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/app" element={<div>Dashboard Home</div>} />
        <Route path="/verify" element={<div>Verify page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana Silva')
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/^password/i), 'secret12')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'secret12')
  await userEvent.click(screen.getByRole('checkbox'))
}

beforeEach(() => vi.clearAllMocks())

it('sends the user to /verify when email confirmation is required', async () => {
  mocked.register.mockResolvedValue({ user: null, needsEmailConfirmation: true })
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByText('Verify page')).toBeInTheDocument()
  expect(mocked.register).toHaveBeenCalledWith({
    name: 'Ana Silva',
    email: 'ana@example.com',
    country: 'BR',
    password: 'secret12',
  })
})

it('goes straight to the dashboard when no confirmation is needed', async () => {
  mocked.register.mockResolvedValue({
    user: { id: '1', name: 'Ana Silva', email: 'ana@example.com', country: 'BR' },
    needsEmailConfirmation: false,
  })
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
})

it('shows an error when registration fails', async () => {
  mocked.register.mockRejectedValue(new Error('User already registered'))
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
