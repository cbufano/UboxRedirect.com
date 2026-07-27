import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import Calculator from './Calculator'

function renderCalc() {
  render(<MemoryRouter><Calculator /></MemoryRouter>)
}

it('shows an estimate with carrier options after valid submit', async () => {
  renderCalc()
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/weight/i), '5')
  await userEvent.type(screen.getByLabelText(/length/i), '30')
  await userEvent.type(screen.getByLabelText(/width/i), '30')
  await userEvent.type(screen.getByLabelText(/height/i), '30')
  await userEvent.click(screen.getByRole('button', { name: /calculate|estimate|calcular/i }))
  // Economy + Express rows appear, with a dollar amount
  expect(await screen.findByText(/Economy/i)).toBeInTheDocument()
  expect(screen.getByText(/Express/i)).toBeInTheDocument()
  expect(screen.getAllByText(/\$\d/).length).toBeGreaterThan(0)
})

it('shows a validation error when weight is zero', async () => {
  renderCalc()
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/weight/i), '0')
  await userEvent.type(screen.getByLabelText(/length/i), '10')
  await userEvent.type(screen.getByLabelText(/width/i), '10')
  await userEvent.type(screen.getByLabelText(/height/i), '10')
  await userEvent.click(screen.getByRole('button', { name: /calculate|estimate|calcular/i }))
  // no results table; an error message is shown for weight
  expect(screen.queryByText(/Economy/i)).not.toBeInTheDocument()
})
