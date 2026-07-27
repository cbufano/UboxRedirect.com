import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import '../i18n'
import { authService } from '../services/authService'
import { DashboardLayout } from './DashboardLayout'

it('renders the sidebar navigation for a logged-in user', () => {
  vi.spyOn(authService, 'getSession').mockReturnValue({ id: 'a@x.com', name: 'Ana', email: 'a@x.com', country: 'BR' })
  render(<MemoryRouter><DashboardLayout /></MemoryRouter>)
  // a sidebar nav link to the inbox exists
  expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/app/inbox')).toBe(true)
  // user name shown
  expect(screen.getByText('Ana')).toBeInTheDocument()
})
