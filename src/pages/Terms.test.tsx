import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Terms from './Terms'

it('renders the Terms H1', () => {
  render(<MemoryRouter><Terms /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})
