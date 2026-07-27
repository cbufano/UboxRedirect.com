import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Overview from './Overview'

it('renders the greeting and the US suite', () => {
  vi.spyOn(authService, 'getSession').mockReturnValue({ id: 'a@x.com', name: 'Ana', email: 'a@x.com', country: 'BR' })
  render(<MemoryRouter><Overview /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(screen.getByText(/Ana/)).toBeInTheDocument()
  expect(screen.getByText(/BUF-10482/)).toBeInTheDocument() // suite from mock
})
