import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Forgot from './Forgot'

it('shows a confirmation after submitting a valid email', async () => {
  render(<MemoryRouter><Forgot /></MemoryRouter>)
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.click(screen.getByRole('button', { name: /send|reset|recover/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})
