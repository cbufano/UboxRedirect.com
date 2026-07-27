import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Contact from './Contact'

function renderContact() {
  render(<MemoryRouter><Contact /></MemoryRouter>)
}

it('shows a validation error for an invalid email', async () => {
  renderContact()
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana')
  await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
  await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I have a question about shipping.')
  await userEvent.click(screen.getByRole('button', { name: /send|submit/i }))
  expect(await screen.findByText(/valid email|email.*valid/i)).toBeInTheDocument()
})

it('shows a success confirmation after a valid submit', async () => {
  renderContact()
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana')
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.type(screen.getByLabelText(/message/i), 'Hello, I have a question about shipping.')
  await userEvent.click(screen.getByRole('button', { name: /send|submit/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})
