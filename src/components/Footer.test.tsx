import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { Footer } from './Footer'

it('renders legal links (Terms and Privacy)', () => {
  render(<MemoryRouter><Footer /></MemoryRouter>)
  expect(screen.getByText(/Terms of Use/i)).toBeInTheDocument()
  expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument()
})
