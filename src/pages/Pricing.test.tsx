import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Pricing from './Pricing'

it('renders H1 and both plan names', () => {
  render(<MemoryRouter><Pricing /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // free + premium plan names present (English defaults)
  expect(screen.getByText(/Free/i)).toBeInTheDocument()
  expect(screen.getByText(/Premium/i)).toBeInTheDocument()
})
