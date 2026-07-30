import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import Calculator from './Calculator'
import { rateService } from '../services/rateService'

vi.mock('../services/rateService', () => ({
  rateService: {
    estimateShippingCost: vi.fn(),
  },
}))
const mocked = vi.mocked(rateService)

beforeEach(() => vi.clearAllMocks())

function renderCalc() {
  render(
    <MemoryRouter>
      <Calculator />
    </MemoryRouter>,
  )
}

async function fillValidForm() {
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/weight/i), '5')
  await userEvent.type(screen.getByLabelText(/length/i), '30')
  await userEvent.type(screen.getByLabelText(/width/i), '30')
  await userEvent.type(screen.getByLabelText(/height/i), '30')
}

it('shows an estimate with carrier options after valid submit', async () => {
  mocked.estimateShippingCost.mockResolvedValue({
    chargeableWeightKg: 5.4,
    currency: 'USD',
    options: [
      { carrier: 'Economy', etaDays: '8-14', costUsd: 83.6 },
      { carrier: 'Express', etaDays: '3-5', costUsd: 128.96 },
    ],
  })
  renderCalc()
  await fillValidForm()
  await userEvent.click(screen.getByRole('button', { name: /calculate|estimate|calcular/i }))

  expect(await screen.findByText(/Economy/i)).toBeInTheDocument()
  expect(screen.getByText(/Express/i)).toBeInTheDocument()
  expect(screen.getAllByText(/\$\d/).length).toBeGreaterThan(0)
})

it('shows a graceful inline error when the estimate call fails, without crashing the page', async () => {
  mocked.estimateShippingCost.mockRejectedValue(new Error('network error'))
  renderCalc()
  await fillValidForm()
  await userEvent.click(screen.getByRole('button', { name: /calculate|estimate|calcular/i }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText(/Economy/i)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
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
  expect(mocked.estimateShippingCost).not.toHaveBeenCalled()
})
