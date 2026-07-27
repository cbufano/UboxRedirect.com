import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Ship from './Ship'

function renderShip() {
  render(<MemoryRouter initialEntries={['/app/ship']}><Ship /></MemoryRouter>)
}

it('shows a cost estimate for the consolidated shipment', () => {
  renderShip()
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // at least one dollar amount is shown (carrier option cost)
  expect(screen.getAllByText(/\$\d/).length).toBeGreaterThan(0)
})

it('shows an order confirmation after filling customs and placing the order', async () => {
  renderShip()
  await userEvent.type(screen.getByLabelText(/description|contents/i), 'Clothing and electronics')
  await userEvent.type(screen.getByLabelText(/value/i), '250')
  await userEvent.click(screen.getByRole('button', { name: /place order/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})
