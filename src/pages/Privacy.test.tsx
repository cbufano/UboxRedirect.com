import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Privacy from './Privacy'

it('renders the Privacy H1', () => {
  render(<MemoryRouter><Privacy /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})
