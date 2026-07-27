import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import FAQ from './FAQ'

it('renders the H1 and expands an answer when a question is clicked', async () => {
  render(<MemoryRouter><FAQ /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // the first accordion question button
  const qButtons = screen.getAllByRole('button')
  await userEvent.click(qButtons[0])
  // after opening, at least one answer paragraph is now in the DOM (aria-expanded true somewhere)
  expect(screen.getAllByRole('button').some(b => b.getAttribute('aria-expanded') === 'true')).toBe(true)
})
