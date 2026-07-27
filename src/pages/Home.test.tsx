import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Home from './Home'

it('renders the hero heading and a primary CTA', () => {
  render(<MemoryRouter><Home /></MemoryRouter>)
  // hero H1 present
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // a signup CTA link exists
  expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/signup')).toBe(true)
})
