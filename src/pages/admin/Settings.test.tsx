import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Settings from './Settings'
import { settingsService } from '../../services/settingsService'
import { currencyService, type DisplayRate } from '../../services/currencyService'
import { outboxAdminService, type OutboxEmail } from '../../services/outboxAdminService'
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
vi.mock('../../services/outboxAdminService', () => ({
  outboxAdminService: {
    getOutbox: vi.fn(),
  },
}))
vi.mock('../../contexts/RoleContext', () => ({
  useRole: vi.fn(),
}))

const mockedSettings = vi.mocked(settingsService)
const mockedCurrency = vi.mocked(currencyService)
const mockedOutbox = vi.mocked(outboxAdminService)
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

const sentEmail: OutboxEmail = {
  id: 'e1',
  template: 'package_received',
  status: 'sent',
  error: '',
  createdAt: '2026-07-28T10:00:00Z',
  sentAt: '2026-07-28T10:05:00Z',
  customerName: 'Maria Silva',
}

const failedEmail: OutboxEmail = {
  id: 'e2',
  template: 'payment_confirmed',
  status: 'failed',
  error: 'Resend API returned 422',
  createdAt: '2026-07-27T09:00:00Z',
  sentAt: null,
  customerName: 'John Doe',
}

const skippedEmail: OutboxEmail = {
  id: 'e3',
  template: 'shipped',
  status: 'skipped',
  error: 'RESEND_API_KEY not configured',
  createdAt: '2026-07-26T08:00:00Z',
  sentAt: null,
  customerName: 'Ana Souza',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRole.mockReturnValue({ roles: ['admin'], loading: false })
  mockedSettings.getSettings.mockResolvedValue({
    free_storage_days: '30',
    paid_unshipped_alert_days: '2',
  })
  mockedCurrency.getLatestRates.mockResolvedValue([freshBrlRate])
  mockedOutbox.getOutbox.mockResolvedValue([])
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

it('lists outbox emails with date, customer, friendly template, status badge and error', async () => {
  mockedOutbox.getOutbox.mockResolvedValue([sentEmail, failedEmail])
  render(<Settings />)

  expect(await screen.findByText('Maria Silva')).toBeInTheDocument()
  expect(screen.getByText('2026-07-28')).toBeInTheDocument()
  // rótulos amigáveis de template, não o valor cru do banco
  expect(screen.getByText('Package received')).toBeInTheDocument()
  expect(screen.getByText('Payment confirmed')).toBeInTheDocument()
  expect(screen.queryByText('package_received')).not.toBeInTheDocument()
  // badges de status + o erro gravado no outbox (dado da tabela, não exceção).
  // `within(table)` porque as opções do filtro usam os mesmos rótulos.
  const table = screen.getByRole('table')
  expect(within(table).getByText('Sent')).toBeInTheDocument()
  expect(within(table).getByText('Failed')).toBeInTheDocument()
  expect(within(table).getByText('Resend API returned 422')).toBeInTheDocument()
})

it('refetches the outbox with the chosen status filter', async () => {
  mockedOutbox.getOutbox.mockResolvedValue([sentEmail])
  render(<Settings />)

  expect(await screen.findByText('Maria Silva')).toBeInTheDocument()
  expect(mockedOutbox.getOutbox).toHaveBeenCalledWith(undefined)

  mockedOutbox.getOutbox.mockResolvedValue([failedEmail])
  await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'failed')

  expect(await screen.findByText('John Doe')).toBeInTheDocument()
  expect(mockedOutbox.getOutbox).toHaveBeenLastCalledWith('failed')
})

it('shows the amber warning when at least one email was skipped', async () => {
  mockedOutbox.getOutbox.mockResolvedValue([sentEmail, skippedEmail])
  render(<Settings />)

  expect(await screen.findByText(/being skipped/i)).toBeInTheDocument()
  // aparece no aviso e na linha do e-mail pulado
  expect(screen.getAllByText(/RESEND_API_KEY/).length).toBeGreaterThan(0)
})

it('does not show the skipped warning when no email was skipped', async () => {
  mockedOutbox.getOutbox.mockResolvedValue([sentEmail, failedEmail])
  render(<Settings />)

  expect(await screen.findByText('Maria Silva')).toBeInTheDocument()
  expect(screen.queryByText(/being skipped/i)).not.toBeInTheDocument()
})

it('shows the outbox empty state', async () => {
  render(<Settings />)

  expect(await screen.findByText(/no emails in the outbox yet/i)).toBeInTheDocument()
})

it('shows an alert when the outbox cannot be loaded', async () => {
  mockedOutbox.getOutbox.mockRejectedValue(new Error('boom'))
  render(<Settings />)

  expect(await screen.findByText(/couldn't load the email outbox/i)).toBeInTheDocument()
})
