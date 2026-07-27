import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Shipments from './Shipments'

it('renders the H1 and a tracking code copy button', () => {
  render(<MemoryRouter><Shipments /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /copy/i }).length).toBeGreaterThan(0)
})
