import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach } from 'vitest'
import '../../i18n'
import Signup from './Signup'

beforeEach(() => localStorage.clear())

function renderSignup() {
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/app" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

it('shows an error when passwords do not match', async () => {
  renderSignup()
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana')
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/^password/i), 'secret12')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'different9')
  await userEvent.click(screen.getByLabelText(/accept|terms/i))
  await userEvent.click(screen.getByRole('button', { name: /create|sign up|register/i }))
  expect(await screen.findByText(/match/i)).toBeInTheDocument()
})

it('registers and navigates to the dashboard on valid submit', async () => {
  renderSignup()
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana')
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/^password/i), 'secret12')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'secret12')
  await userEvent.click(screen.getByLabelText(/accept|terms/i))
  await userEvent.click(screen.getByRole('button', { name: /create|sign up|register/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
})
