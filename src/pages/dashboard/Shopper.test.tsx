import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Shopper from './Shopper'

it('shows a confirmation after submitting a valid request', async () => {
  render(<MemoryRouter><Shopper /></MemoryRouter>)
  await userEvent.type(screen.getByLabelText(/product url/i), 'https://example.com/item')
  await userEvent.type(screen.getByLabelText(/quantity/i), '2')
  await userEvent.type(screen.getByLabelText(/budget/i), '300')
  await userEvent.click(screen.getByRole('button', { name: /submit|send request|request/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})
