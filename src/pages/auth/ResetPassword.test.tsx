import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import ResetPassword from './ResetPassword'

vi.mock('../../services/authService', () => ({
  authService: { updatePassword: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderPage() {
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('updates the password and shows success', async () => {
  mocked.updatePassword.mockResolvedValue()
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'newpass99')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.updatePassword).toHaveBeenCalledWith('newpass99')
})

it('validates that passwords match before submitting', async () => {
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'different1')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(mocked.updatePassword).not.toHaveBeenCalled()
})

it('shows an error when the update fails', async () => {
  mocked.updatePassword.mockRejectedValue(new Error('expired'))
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'newpass99')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
