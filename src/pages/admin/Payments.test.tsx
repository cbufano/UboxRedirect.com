import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Payments from './Payments'
import { financeAdminService, type AdminPayment, type AdminRefund } from '../../services/financeAdminService'
import { adminService } from '../../services/adminService'

vi.mock('../../services/financeAdminService', () => ({
  financeAdminService: {
    getPayments: vi.fn(),
    registerManualPayment: vi.fn(),
    requestRefund: vi.fn(),
    getRefunds: vi.fn(),
    markRefundProcessed: vi.fn(),
    markRefundFailed: vi.fn(),
  },
}))
vi.mock('../../services/adminService', () => ({
  adminService: {
    findUserBySuite: vi.fn(),
    getPendingConsolidationsForUser: vi.fn(),
  },
}))
const mocked = vi.mocked(financeAdminService)
const mockedAdmin = vi.mocked(adminService)

const stripePayment: AdminPayment = {
  id: 'pay-1',
  consolidationId: 'con-1',
  userId: 'u1',
  provider: 'stripe',
  amountUsd: 42.5,
  status: 'succeeded',
  notes: '',
  createdAt: '2026-07-29T10:00:00Z',
  customerName: 'Ana Silva',
  city: 'São Paulo',
  country: 'BR',
}

const manualPayment: AdminPayment = {
  id: 'pay-2',
  consolidationId: 'con-2',
  userId: 'u2',
  provider: 'manual_pix',
  amountUsd: 10,
  status: 'pending',
  notes: '',
  createdAt: '2026-07-28T10:00:00Z',
  customerName: 'Bruno Costa',
  city: 'Lisboa',
  country: 'PT',
}

const customer = {
  userId: 'cust-1',
  name: 'Ana Silva',
  kycStatus: 'verified' as const,
  ofacStatus: 'clear' as const,
}

const pendingConsolidation = {
  id: 'con-9',
  city: 'Lisboa',
  country: 'PT',
  costUsd: 120.5,
  createdAt: '2026-07-27T10:00:00Z',
}

const requestedRefund: AdminRefund = {
  id: 'ref-1',
  paymentId: 'pay-1',
  amountUsd: 12.5,
  reason: 'Damaged item',
  status: 'requested',
  createdAt: '2026-07-29T11:00:00Z',
  processedAt: null,
  paymentAmountUsd: 42.5,
  paymentProvider: 'stripe',
  customerName: 'Ana Silva',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getPayments.mockResolvedValue([])
  mocked.getRefunds.mockResolvedValue([])
  mockedAdmin.getPendingConsolidationsForUser.mockResolvedValue([])
})

it('shows a loading state while payments are being fetched', () => {
  mocked.getPayments.mockReturnValue(new Promise(() => {}))
  mocked.getRefunds.mockReturnValue(new Promise(() => {}))
  render(<Payments />)
  expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
})

it('shows an alert when loading the payments fails', async () => {
  mocked.getPayments.mockRejectedValue(new Error('boom'))
  render(<Payments />)
  expect(await screen.findByText(/we couldn't load the payments/i)).toBeInTheDocument()
})

it('lists payments with friendly provider labels and status badges', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment, manualPayment])
  render(<Payments />)

  const anaRow = (await screen.findByText('Ana Silva')).closest('tr')!
  expect(within(anaRow).getByText('Stripe')).toBeInTheDocument()
  expect(within(anaRow).getByText('Succeeded')).toBeInTheDocument()
  expect(within(anaRow).getByText('São Paulo, BR')).toBeInTheDocument()
  expect(within(anaRow).getByText('$42.50')).toBeInTheDocument()

  const brunoRow = screen.getByText('Bruno Costa').closest('tr')!
  expect(within(brunoRow).getByText('Manual PIX')).toBeInTheDocument()
  expect(within(brunoRow).getByText('Pending')).toBeInTheDocument()
})

it('filters payments by status and provider on the client', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment, manualPayment])
  render(<Payments />)

  await screen.findByText('Ana Silva')

  await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'pending')
  expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument()
  expect(screen.getByText('Bruno Costa')).toBeInTheDocument()

  await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'all')
  await userEvent.selectOptions(screen.getByLabelText(/filter by provider/i), 'stripe')
  expect(screen.getByText('Ana Silva')).toBeInTheDocument()
  expect(screen.queryByText('Bruno Costa')).not.toBeInTheDocument()
})

it('registers a manual payment: suite lookup, pending consolidation pick, submit', async () => {
  mockedAdmin.findUserBySuite.mockResolvedValue(customer)
  mockedAdmin.getPendingConsolidationsForUser.mockResolvedValue([pendingConsolidation])
  mocked.registerManualPayment.mockResolvedValue('pay-new')
  render(<Payments />)

  await screen.findByText(/no payments match/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(await screen.findByText(/registering for ana silva/i)).toBeInTheDocument()
  expect(mockedAdmin.findUserBySuite).toHaveBeenCalledWith('BUF-10001')
  expect(mockedAdmin.getPendingConsolidationsForUser).toHaveBeenCalledWith('cust-1')

  await userEvent.selectOptions(await screen.findByLabelText(/pending consolidation/i), 'con-9')
  // valor default = cotação da consolidação escolhida
  expect(screen.getByLabelText(/amount received/i)).toHaveValue(120.5)

  await userEvent.selectOptions(screen.getByLabelText(/payment method/i), 'manual_transfer')
  await userEvent.type(screen.getByLabelText(/notes/i), 'Wire ref 123')

  await userEvent.click(screen.getByRole('button', { name: /register payment/i }))

  expect(mocked.registerManualPayment).toHaveBeenCalledWith({
    consolidationId: 'con-9',
    userId: 'cust-1',
    amountUsd: 120.5,
    provider: 'manual_transfer',
    notes: 'Wire ref 123',
  })
  expect(await screen.findByText(/payment registered and consolidation marked as paid/i)).toBeInTheDocument()
  // sucesso recarrega a lista (fetch inicial + reload)
  expect(mocked.getPayments).toHaveBeenCalledTimes(2)
})

it('shows a not-found message when the suite has no matching customer', async () => {
  mockedAdmin.findUserBySuite.mockResolvedValue(null)
  render(<Payments />)

  await screen.findByText(/no payments match/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-99999')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(await screen.findByText(/no customer found/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /register payment/i })).toBeDisabled()
})

it('shows the dedicated inconsistency warning (not the generic error) and still reloads', async () => {
  mockedAdmin.findUserBySuite.mockResolvedValue(customer)
  mockedAdmin.getPendingConsolidationsForUser.mockResolvedValue([pendingConsolidation])
  mocked.registerManualPayment.mockRejectedValue(
    new Error(
      'Payment was recorded but the consolidation was no longer pending — review it manually to resolve the inconsistency.',
    ),
  )
  render(<Payments />)

  await screen.findByText(/no payments match/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))
  await userEvent.selectOptions(await screen.findByLabelText(/pending consolidation/i), 'con-9')
  await userEvent.click(screen.getByRole('button', { name: /register payment/i }))

  expect(
    await screen.findByText(/payment was recorded, but the consolidation was no longer pending/i),
  ).toBeInTheDocument()
  expect(screen.queryByText(/we couldn't register this payment/i)).not.toBeInTheDocument()
  // o pagamento existe: a lista recarrega mesmo assim
  expect(mocked.getPayments).toHaveBeenCalledTimes(2)
})

it('shows the generic error when the manual payment fails for another reason', async () => {
  mockedAdmin.findUserBySuite.mockResolvedValue(customer)
  mockedAdmin.getPendingConsolidationsForUser.mockResolvedValue([pendingConsolidation])
  mocked.registerManualPayment.mockRejectedValue(new Error('rls denied'))
  render(<Payments />)

  await screen.findByText(/no payments match/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))
  await userEvent.selectOptions(await screen.findByLabelText(/pending consolidation/i), 'con-9')
  await userEvent.click(screen.getByRole('button', { name: /register payment/i }))

  expect(await screen.findByText(/we couldn't register this payment/i)).toBeInTheDocument()
  expect(screen.queryByText('rls denied')).not.toBeInTheDocument()
  expect(mocked.getPayments).toHaveBeenCalledTimes(1)
})

it('requests a refund from a succeeded payment with the payment amount as default', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment])
  mocked.requestRefund.mockResolvedValue()
  render(<Payments />)

  await screen.findByText('Ana Silva')
  await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))

  expect(screen.getByLabelText(/refund amount/i)).toHaveValue(42.5)
  await userEvent.type(screen.getByLabelText(/^reason$/i), 'Damaged item')
  await userEvent.click(screen.getByRole('button', { name: /request refund/i }))

  expect(mocked.requestRefund).toHaveBeenCalledWith({
    paymentId: 'pay-1',
    amountUsd: 42.5,
    reason: 'Damaged item',
  })
  expect(await screen.findByText(/refund request recorded/i)).toBeInTheDocument()
  expect(mocked.getRefunds).toHaveBeenCalledTimes(2)
})

it('requires a reason before submitting the refund request', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment])
  render(<Payments />)

  await screen.findByText('Ana Silva')
  await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
  await userEvent.click(screen.getByRole('button', { name: /request refund/i }))

  expect(await screen.findByText(/enter the reason for the refund/i)).toBeInTheDocument()
  expect(mocked.requestRefund).not.toHaveBeenCalled()
})

it('rejects a refund amount above the payment amount', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment])
  render(<Payments />)

  await screen.findByText('Ana Silva')
  await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
  const amountInput = screen.getByLabelText(/refund amount/i)
  await userEvent.clear(amountInput)
  await userEvent.type(amountInput, '250')
  await userEvent.type(screen.getByLabelText(/^reason$/i), 'typo test')
  await userEvent.click(screen.getByRole('button', { name: /request refund/i }))

  expect(await screen.findByText(/no higher than the payment amount/i)).toBeInTheDocument()
  expect(mocked.requestRefund).not.toHaveBeenCalled()
})

it('blocks a second refund request while one is still open for the same payment', async () => {
  mocked.getPayments.mockResolvedValue([stripePayment])
  mocked.getRefunds.mockResolvedValue([
    {
      id: 'ref-1',
      paymentId: 'pay-1',
      amountUsd: 10,
      reason: 'first',
      status: 'requested',
      createdAt: '2026-07-30T00:00:00Z',
      processedAt: null,
      paymentAmountUsd: 42.5,
      paymentProvider: 'stripe',
      customerName: 'Ana Silva',
    },
  ])
  render(<Payments />)

  await screen.findAllByText('Ana Silva')
  await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
  await userEvent.type(screen.getByLabelText(/^reason$/i), 'second try')
  await userEvent.click(screen.getByRole('button', { name: /request refund/i }))

  expect(await screen.findByText(/already an open refund request/i)).toBeInTheDocument()
  expect(mocked.requestRefund).not.toHaveBeenCalled()
})

it('does not offer the refund button for non-succeeded payments', async () => {
  mocked.getPayments.mockResolvedValue([manualPayment])
  render(<Payments />)

  await screen.findByText('Bruno Costa')
  expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument()
})

it('lists refunds with the Stripe dashboard notice and marks one processed', async () => {
  mocked.getRefunds.mockResolvedValue([requestedRefund])
  mocked.markRefundProcessed.mockResolvedValue()
  render(<Payments />)

  expect(await screen.findByText(/real stripe refunds are issued in the stripe dashboard/i)).toBeInTheDocument()
  const row = screen.getByText('Damaged item').closest('tr')!
  expect(within(row).getByText('Requested')).toBeInTheDocument()
  expect(within(row).getByText('$12.50')).toBeInTheDocument()

  await userEvent.click(within(row).getByRole('button', { name: /mark processed/i }))

  expect(mocked.markRefundProcessed).toHaveBeenCalledWith('ref-1')
  expect(mocked.getRefunds).toHaveBeenCalledTimes(2)
})

it('marks a requested refund as failed', async () => {
  mocked.getRefunds.mockResolvedValue([requestedRefund])
  mocked.markRefundFailed.mockResolvedValue()
  render(<Payments />)

  const row = (await screen.findByText('Damaged item')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: /mark failed/i }))

  expect(mocked.markRefundFailed).toHaveBeenCalledWith('ref-1')
})

it('hides processed refunds action buttons and shows the green badge', async () => {
  mocked.getRefunds.mockResolvedValue([
    { ...requestedRefund, status: 'processed', processedAt: '2026-07-30T09:00:00Z' },
  ])
  render(<Payments />)

  const row = (await screen.findByText('Damaged item')).closest('tr')!
  expect(within(row).getByText('Processed')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: /mark processed/i })).not.toBeInTheDocument()
})
