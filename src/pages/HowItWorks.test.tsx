import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import HowItWorks from './HowItWorks'

it('renders the page H1 and a signup CTA', () => {
  render(<MemoryRouter><HowItWorks /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/signup')).toBe(true)
})
