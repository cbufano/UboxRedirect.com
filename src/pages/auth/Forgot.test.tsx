import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Forgot from './Forgot'

vi.mock('../../services/authService', () => ({
  authService: { requestPasswordReset: vi.fn() },
}))
const mocked = vi.mocked(authService)

beforeEach(() => vi.clearAllMocks())

it('requests a password reset and shows the success message', async () => {
  mocked.requestPasswordReset.mockResolvedValue()
  render(
    <MemoryRouter>
      <Forgot />
    </MemoryRouter>,
  )
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.click(screen.getByRole('button', { name: /reset|send/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.requestPasswordReset).toHaveBeenCalledWith('ana@example.com')
})
