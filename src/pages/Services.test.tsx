import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Services from './Services'

it('renders the H1 and all six service cards', () => {
  render(<MemoryRouter><Services /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // six services rendered as level-3 headings
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6)
})
