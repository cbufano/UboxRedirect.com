import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import About from './About'

it('renders the About H1', () => {
  render(<MemoryRouter><About /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})
