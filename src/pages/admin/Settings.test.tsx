import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Settings from './Settings'
import { settingsService } from '../../services/settingsService'
import { currencyService, type DisplayRate } from '../../services/currencyService'
import { useRole } from '../../contexts/RoleContext'

vi.mock('../../services/settingsService', () => ({
  settingsService: {
    getSettings: vi.fn(),
    updateSetting: vi.fn(),
  },
}))
vi.mock('../../services/currencyService', () => ({
  currencyService: {
    getLatestRates: vi.fn(),
  },
}))
vi.mock('../../contexts/RoleContext', () => ({
  useRole: vi.fn(),
}))

const mockedSettings = vi.mocked(settingsService)
const mockedCurrency = vi.mocked(currencyService)
const mockedUseRole = vi.mocked(useRole)

const todayIso = new Date().toISOString().slice(0, 10)

const freshBrlRate: DisplayRate = {
  code: 'BRL',
  symbol: 'R$',
  ratePerUsd: 5.43,
  quotedAt: todayIso,
}

const staleEurRate: DisplayRate = {
  code: 'EUR',
  symbol: '€',
  ratePerUsd: 0.91,
  quotedAt: '2020-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRole.mockReturnValue({ roles: ['admin'], loading: false })
  mockedSettings.getSettings.mockResolvedValue({
    free_storage_days: '30',
    paid_unshipped_alert_days: '2',
  })
  mockedCurrency.getLatestRates.mockResolvedValue([freshBrlRate])
})

it('shows a loading state while settings and rates are being fetched', () => {
  mockedSettings.getSettings.mockReturnValue(new Promise(() => {}))
  mockedCurrency.getLatestRates.mockReturnValue(new Promise(() => {}))
  render(<Settings />)
  expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
})

it('shows an alert when the settings cannot be loaded', async () => {
  mockedSettings.getSettings.mockRejectedValue(new Error('boom'))
  render(<Settings />)
  expect(await screen.findByText(/couldn't load the settings/i)).toBeInTheDocument()
})

it('renders the current setting values with descriptive labels', async () => {
  render(<Settings />)

  expect(await screen.findByLabelText('Free storage (days)')).toHaveValue(30)
  expect(screen.getByLabelText('Paid-but-unshipped alert (days)')).toHaveValue(2)
  // rótulos descritivos explicando o efeito de cada chave
  expect(screen.getByText(/storage overdue/i)).toBeInTheDocument()
  expect(screen.getByText(/flagged in red/i)).toBeInTheDocument()
})

it('saves an edited setting with the right key and value', async () => {
  mockedSettings.updateSetting.mockResolvedValue()
  render(<Settings />)

  const input = await screen.findByLabelText('Free storage (days)')
  await userEvent.clear(input)
  await userEvent.type(input, '45')
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

  expect(mockedSettings.updateSetting).toHaveBeenCalledWith('free_storage_days', '45')
  expect(await screen.findByText('Setting saved.')).toBeInTheDocument()
})

it('validates the value before calling the service (integer >= 0 required)', async () => {
  render(<Settings />)

  const input = await screen.findByLabelText('Paid-but-unshipped alert (days)')
  await userEvent.clear(input)
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[1])

  expect(await screen.findByText('Enter a whole number of zero or more.')).toBeInTheDocument()
  expect(mockedSettings.updateSetting).not.toHaveBeenCalled()
})

it('shows a handled error when saving fails', async () => {
  mockedSettings.updateSetting.mockRejectedValue(new Error('rls denied'))
  render(<Settings />)

  await screen.findByLabelText('Free storage (days)')
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

  expect(await screen.findByText(/couldn't save this setting/i)).toBeInTheDocument()
})

it('shows read-only values without save controls for ops', async () => {
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  render(<Settings />)

  expect(await screen.findByText('30')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText(/read-only access/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Free storage (days)')).not.toBeInTheDocument()
})

it('lists a fresh exchange rate without a stale warning', async () => {
  render(<Settings />)

  expect(await screen.findByText('BRL')).toBeInTheDocument()
  expect(screen.getByText('5.43 per 1 USD')).toBeInTheDocument()
  expect(screen.getByText(`Quoted on ${todayIso}`)).toBeInTheDocument()
  expect(screen.queryByText(/more than 48 hours old/i)).not.toBeInTheDocument()
})

it('flags a rate older than 48 hours as stale', async () => {
  mockedCurrency.getLatestRates.mockResolvedValue([freshBrlRate, staleEurRate])
  render(<Settings />)

  expect(await screen.findByText('EUR')).toBeInTheDocument()
  // só a cotação velha ganha o aviso âmbar
  expect(screen.getAllByText(/more than 48 hours old/i)).toHaveLength(1)
})

it('shows the deploy-pending notice when there are no rates at all', async () => {
  mockedCurrency.getLatestRates.mockResolvedValue([])
  render(<Settings />)

  expect(await screen.findByText(/no exchange rates yet/i)).toBeInTheDocument()
  expect(screen.getByText(/daily refresh function still needs to be deployed/i)).toBeInTheDocument()
})

it('shows an alert when the exchange rates cannot be loaded', async () => {
  mockedCurrency.getLatestRates.mockRejectedValue(new Error('boom'))
  render(<Settings />)

  expect(await screen.findByText(/couldn't load the exchange rates/i)).toBeInTheDocument()
})
