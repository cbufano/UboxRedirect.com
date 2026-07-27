import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Verify from './Verify'

it('renders the H1 and a continue-to-dashboard link', () => {
  render(<MemoryRouter><Verify /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/app')).toBe(true)
})
