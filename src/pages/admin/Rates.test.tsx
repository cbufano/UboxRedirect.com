import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Rates from './Rates'
import { ratesAdminService, type RateRow, type ServiceFee } from '../../services/ratesAdminService'
import { rateService } from '../../services/rateService'
import { useRole } from '../../contexts/RoleContext'

vi.mock('../../services/ratesAdminService', () => ({
  ratesAdminService: {
    getRateRows: vi.fn(),
    createRateRow: vi.fn(),
    updateRateRow: vi.fn(),
    deleteRateRow: vi.fn(),
    getServiceFees: vi.fn(),
    updateServiceFee: vi.fn(),
  },
}))
vi.mock('../../services/rateService', () => ({
  rateService: {
    estimateShippingCost: vi.fn(),
  },
}))
vi.mock('../../contexts/RoleContext', () => ({
  useRole: vi.fn(),
}))

const mocked = vi.mocked(ratesAdminService)
const mockedRateService = vi.mocked(rateService)
const mockedUseRole = vi.mocked(useRole)

const brEconomy: RateRow = {
  id: 'rate-1',
  destinationZone: 'BR',
  carrier: 'Economy',
  etaDays: '8-14',
  baseFeeUsd: 8,
  ratePerKgUsd: 14,
  multiplier: 1,
}

const brExpress: RateRow = {
  ...brEconomy,
  id: 'rate-2',
  carrier: 'Express',
  etaDays: '3-5',
  multiplier: 1.6,
}

const defaultEconomy: RateRow = {
  ...brEconomy,
  id: 'rate-3',
  destinationZone: 'DEFAULT',
  ratePerKgUsd: 18,
}

const extraPhotoFee: ServiceFee = {
  key: 'extra_photo',
  label: 'Extra photos (each)',
  amountUsd: 0.5,
  percent: null,
  active: true,
}

const valueProtectionFee: ServiceFee = {
  key: 'value_protection',
  label: 'Value protection',
  amountUsd: null,
  percent: 2,
  active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRole.mockReturnValue({ roles: ['admin'], loading: false })
  mocked.getRateRows.mockResolvedValue([brEconomy, brExpress, defaultEconomy])
  mocked.getServiceFees.mockResolvedValue([extraPhotoFee, valueProtectionFee])
})

it('shows a loading state while rates and fees are being fetched', () => {
  mocked.getRateRows.mockReturnValue(new Promise(() => {}))
  mocked.getServiceFees.mockReturnValue(new Promise(() => {}))
  render(<Rates />)
  expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
})

it('shows an alert when the rate table cannot be loaded', async () => {
  mocked.getRateRows.mockRejectedValue(new Error('boom'))
  render(<Rates />)
  expect(await screen.findByText(/couldn't load the shipping rates/i)).toBeInTheDocument()
})

it('shows an alert when the service fees cannot be loaded', async () => {
  mocked.getServiceFees.mockRejectedValue(new Error('boom'))
  render(<Rates />)
  expect(await screen.findByText(/couldn't load the service fees/i)).toBeInTheDocument()
})

it('renders the rate rows and the service fees', async () => {
  render(<Rates />)

  expect(await screen.findByText('Express')).toBeInTheDocument()
  expect(screen.getAllByText('Economy')).toHaveLength(2)
  // 'DEFAULT' aparece na célula da tabela E como opção do select do simulador
  expect(screen.getAllByText('DEFAULT').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('×1.6')).toBeInTheDocument()

  expect(screen.getByText('Extra photos (each)')).toBeInTheDocument()
  expect(screen.getByText('$0.50')).toBeInTheDocument()
  expect(screen.getByText('2%')).toBeInTheDocument()
})

it('creates a rate with normalized values and reloads the table', async () => {
  mocked.createRateRow.mockResolvedValue('rate-9')
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.click(screen.getByRole('button', { name: 'Add rate' }))

  const form = screen.getByText('New rate').closest('form')!
  await userEvent.type(within(form).getByLabelText('Destination zone'), 'mx')
  await userEvent.type(within(form).getByLabelText('Carrier'), 'Standard')
  await userEvent.type(within(form).getByLabelText('ETA (days)'), '10-15')
  await userEvent.type(within(form).getByLabelText('Base fee (USD)'), '5')
  await userEvent.type(within(form).getByLabelText('Rate per kg (USD)'), '9.5')

  await userEvent.click(screen.getByRole('button', { name: 'Create rate' }))

  // zona normalizada para maiúsculas antes de chegar ao service
  expect(mocked.createRateRow).toHaveBeenCalledWith({
    destinationZone: 'MX',
    carrier: 'Standard',
    etaDays: '10-15',
    baseFeeUsd: 5,
    ratePerKgUsd: 9.5,
    multiplier: 1,
  })
  expect(await screen.findByText('Rate created.')).toBeInTheDocument()
  // 1ª chamada no mount + 1 no reload pós-criação
  expect(mocked.getRateRows).toHaveBeenCalledTimes(2)
})

it('validates the rate form before calling the service', async () => {
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.click(screen.getByRole('button', { name: 'Add rate' }))
  await userEvent.click(screen.getByRole('button', { name: 'Create rate' }))

  expect(await screen.findByText('Enter the destination zone.')).toBeInTheDocument()
  expect(screen.getByText('Enter the carrier name.')).toBeInTheDocument()
  expect(mocked.createRateRow).not.toHaveBeenCalled()
})

it('edits a rate prefilled from the row and reloads the table', async () => {
  mocked.updateRateRow.mockResolvedValue()
  render(<Rates />)

  const expressRow = (await screen.findByText('Express')).closest('tr')!
  await userEvent.click(within(expressRow).getByRole('button', { name: 'Edit' }))

  const form = screen.getByText('Edit rate').closest('form')!
  const baseFee = within(form).getByLabelText('Base fee (USD)')
  expect(baseFee).toHaveValue(8)
  await userEvent.clear(baseFee)
  await userEvent.type(baseFee, '10')

  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(mocked.updateRateRow).toHaveBeenCalledWith('rate-2', {
    destinationZone: 'BR',
    carrier: 'Express',
    etaDays: '3-5',
    baseFeeUsd: 10,
    ratePerKgUsd: 14,
    multiplier: 1.6,
  })
  expect(await screen.findByText('Rate updated.')).toBeInTheDocument()
  expect(mocked.getRateRows).toHaveBeenCalledTimes(2)
})

it('shows a handled error when saving a rate fails', async () => {
  mocked.createRateRow.mockRejectedValue(new Error('rls denied'))
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.click(screen.getByRole('button', { name: 'Add rate' }))

  const form = screen.getByText('New rate').closest('form')!
  await userEvent.type(within(form).getByLabelText('Destination zone'), 'MX')
  await userEvent.type(within(form).getByLabelText('Carrier'), 'Standard')
  await userEvent.type(within(form).getByLabelText('ETA (days)'), '10-15')
  await userEvent.type(within(form).getByLabelText('Base fee (USD)'), '5')
  await userEvent.type(within(form).getByLabelText('Rate per kg (USD)'), '9.5')
  await userEvent.click(screen.getByRole('button', { name: 'Create rate' }))

  expect(await screen.findByText(/couldn't save this rate/i)).toBeInTheDocument()
  expect(mocked.getRateRows).toHaveBeenCalledTimes(1)
})

it('deletes a rate only after the inline confirmation and reloads the table', async () => {
  mocked.deleteRateRow.mockResolvedValue()
  render(<Rates />)

  const expressRow = (await screen.findByText('Express')).closest('tr')!
  await userEvent.click(within(expressRow).getByRole('button', { name: 'Delete' }))

  // confirmação inline — nada excluído ainda
  expect(mocked.deleteRateRow).not.toHaveBeenCalled()
  expect(screen.getByText('Delete the BR — Express rate?')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

  expect(mocked.deleteRateRow).toHaveBeenCalledWith('rate-2')
  expect(await screen.findByText('Rate deleted.')).toBeInTheDocument()
  expect(mocked.getRateRows).toHaveBeenCalledTimes(2)
})

it('cancels the inline delete confirmation without deleting', async () => {
  render(<Rates />)

  const expressRow = (await screen.findByText('Express')).closest('tr')!
  await userEvent.click(within(expressRow).getByRole('button', { name: 'Delete' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByText('Delete the BR — Express rate?')).not.toBeInTheDocument()
  expect(mocked.deleteRateRow).not.toHaveBeenCalled()
})

it('shows a handled error when the delete fails', async () => {
  mocked.deleteRateRow.mockRejectedValue(new Error('boom'))
  render(<Rates />)

  const expressRow = (await screen.findByText('Express')).closest('tr')!
  await userEvent.click(within(expressRow).getByRole('button', { name: 'Delete' }))
  await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

  expect(await screen.findByText(/couldn't delete this rate/i)).toBeInTheDocument()
})

it('hides all write controls for ops but keeps the simulator', async () => {
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  render(<Rates />)

  expect(await screen.findByText('Express')).toBeInTheDocument()
  expect(screen.getByText('Extra photos (each)')).toBeInTheDocument()

  expect(screen.queryByRole('button', { name: 'Add rate' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

  // simulador continua disponível para qualquer staff
  expect(screen.getByRole('button', { name: 'Simulate' })).toBeInTheDocument()
})

it('edits a service fee and reloads the list', async () => {
  mocked.updateServiceFee.mockResolvedValue()
  render(<Rates />)

  const feeRow = (await screen.findByText('Extra photos (each)')).closest('tr')!
  await userEvent.click(within(feeRow).getByRole('button', { name: 'Edit' }))

  const amount = screen.getByLabelText('Amount (USD)')
  expect(amount).toHaveValue(0.5)
  await userEvent.clear(amount)
  await userEvent.type(amount, '0.75')
  await userEvent.click(screen.getByLabelText('Active'))

  await userEvent.click(screen.getByRole('button', { name: 'Save fee' }))

  expect(mocked.updateServiceFee).toHaveBeenCalledWith('extra_photo', {
    label: 'Extra photos (each)',
    amountUsd: 0.75,
    percent: null,
    active: false,
  })
  expect(await screen.findByText('Fee updated.')).toBeInTheDocument()
  // 1ª chamada no mount + 1 no reload pós-edição
  expect(mocked.getServiceFees).toHaveBeenCalledTimes(2)
})

it('validates the fee before calling the service (label and at least one value)', async () => {
  render(<Rates />)

  const feeRow = (await screen.findByText('Value protection')).closest('tr')!
  await userEvent.click(within(feeRow).getByRole('button', { name: 'Edit' }))

  await userEvent.clear(screen.getByLabelText('Label'))
  await userEvent.clear(screen.getByLabelText('Percent (%)'))
  await userEvent.click(screen.getByRole('button', { name: 'Save fee' }))

  expect(await screen.findByText('Enter the fee label.')).toBeInTheDocument()
  expect(screen.getByText(/valid amount or percent/i)).toBeInTheDocument()
  expect(mocked.updateServiceFee).not.toHaveBeenCalled()
})

it('shows a handled error when saving a fee fails', async () => {
  mocked.updateServiceFee.mockRejectedValue(new Error('boom'))
  render(<Rates />)

  const feeRow = (await screen.findByText('Extra photos (each)')).closest('tr')!
  await userEvent.click(within(feeRow).getByRole('button', { name: 'Edit' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save fee' }))

  expect(await screen.findByText(/couldn't update this fee/i)).toBeInTheDocument()
})

it('simulates a shipment with the real customer estimator and shows the options', async () => {
  mockedRateService.estimateShippingCost.mockResolvedValue({
    chargeableWeightKg: 3.2,
    currency: 'USD',
    options: [
      { carrier: 'Economy', etaDays: '8-14', costUsd: 52.8 },
      { carrier: 'Express', etaDays: '3-5', costUsd: 79.7 },
    ],
  })
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.type(screen.getByLabelText('Weight (kg)'), '2')
  // zonas distintas das tarifas carregadas (BR, DEFAULT)
  await userEvent.selectOptions(screen.getByLabelText('Destination zone'), 'BR')
  await userEvent.click(screen.getByRole('button', { name: 'Simulate' }))

  // a MESMA função da calculadora do cliente, com os defaults de 40 cm
  expect(mockedRateService.estimateShippingCost).toHaveBeenCalledWith({
    destinationCountry: 'BR',
    weightKg: 2,
    lengthCm: 40,
    widthCm: 40,
    heightCm: 40,
  })
  expect(await screen.findByText('Chargeable weight: 3.2 kg')).toBeInTheDocument()
  expect(screen.getByText('$52.80')).toBeInTheDocument()
  expect(screen.getByText('$79.70')).toBeInTheDocument()
})

it('validates the simulator weight before calling the estimator', async () => {
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.click(screen.getByRole('button', { name: 'Simulate' }))

  expect(await screen.findByText('Enter a weight greater than zero.')).toBeInTheDocument()
  expect(mockedRateService.estimateShippingCost).not.toHaveBeenCalled()
})

it('shows a specific message when there are no rates for the destination', async () => {
  mockedRateService.estimateShippingCost.mockRejectedValue(
    new Error('No shipping rates available for this destination'),
  )
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.type(screen.getByLabelText('Weight (kg)'), '2')
  await userEvent.click(screen.getByRole('button', { name: 'Simulate' }))

  expect(await screen.findByText(/no shipping rates are configured for this destination/i)).toBeInTheDocument()
})

it('shows a generic handled error when the simulation fails', async () => {
  mockedRateService.estimateShippingCost.mockRejectedValue(new Error('network down'))
  render(<Rates />)

  await screen.findByText('Express')
  await userEvent.type(screen.getByLabelText('Weight (kg)'), '2')
  await userEvent.click(screen.getByRole('button', { name: 'Simulate' }))

  expect(await screen.findByText(/couldn't run the simulation/i)).toBeInTheDocument()
})
