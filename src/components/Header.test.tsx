import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

function renderHeader() {
  render(<MemoryRouter><Header /></MemoryRouter>)
}

it('renders the brand and a navigation link', () => {
  renderHeader()
  expect(screen.getByText('Bufano Redirect')).toBeInTheDocument()
  // at least one nav label (English default) is present
  expect(screen.getAllByText(/How it works/i).length).toBeGreaterThan(0)
})

it('has an accessible mobile menu toggle', () => {
  renderHeader()
  expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
})
