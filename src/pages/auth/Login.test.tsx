import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Login from './Login'

beforeEach(() => localStorage.clear())

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

it('shows an error when credentials are invalid', async () => {
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'nobody@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('navigates to the dashboard on successful login', async () => {
  authService.register({ name: 'Ana', email: 'ana@example.com', country: 'BR', password: 'secret12' })
  authService.logout()
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'secret12')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
})
