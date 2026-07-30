import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Shipments from './Shipments'
import { packageService, type Consolidation } from '../../services/packageService'
import { paymentService } from '../../services/paymentService'
import { currencyService, type DisplayRate } from '../../services/currencyService'
import { useAuth } from '../../contexts/AuthContext'

vi.mock('../../services/packageService', () => ({
  packageService: { getMyConsolidations: vi.fn() },
}))

vi.mock('../../services/paymentService', () => ({
  paymentService: { createCheckoutSession: vi.fn() },
}))

vi.mock('../../services/currencyService', () => ({
  currencyService: {
    getLatestRates: vi.fn(),
    // helper puro — mesma aritmética do service real
    approximate: vi.fn((amountUsd: number, ratePerUsd: number) => Math.round(amountUsd * ratePerUsd * 100) / 100),
  },
  COUNTRY_CURRENCY: { BR: 'BRL', US: 'USD', PT: 'EUR', ES: 'EUR', MX: 'MXN', AR: 'ARS', GB: 'GBP' },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedPackageService = vi.mocked(packageService)
const mockedPaymentService = vi.mocked(paymentService)
const mockedCurrencyService = vi.mocked(currencyService)
const mockedUseAuth = vi.mocked(useAuth)

const usUser = { id: 'u1', name: 'John Doe', email: 'john@example.com', country: 'US' }

const brlRate: DisplayRate = { code: 'BRL', symbol: 'R$', ratePerUsd: 5, quotedAt: '2026-07-29' }
const usdRate: DisplayRate = { code: 'USD', symbol: '$', ratePerUsd: 1, quotedAt: '2026-07-29' }

const pendingConsolidation: Consolidation = {
  id: 'c1',
  status: 'pending',
  recipientName: 'John Doe',
  city: 'Springfield',
  country: 'US',
  carrier: 'Economy',
  trackingCode: null,
  costUsd: 43,
  createdAt: '2026-07-20T00:00:00Z',
  paidAt: null,
  shippedAt: null,
}

const shippedConsolidation: Consolidation = {
  id: 'c2',
  status: 'shipped',
  recipientName: 'Jane Doe',
  city: 'Miami',
  country: 'BR',
  carrier: 'Express',
  trackingCode: 'TRACK123',
  costUsd: 88.5,
  createdAt: '2026-07-10T00:00:00Z',
  paidAt: '2026-07-11T00:00:00Z',
  shippedAt: '2026-07-15T00:00:00Z',
}

function renderPage(initialEntries: string[] = ['/app/shipments']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Shipments />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({ user: usUser, loading: false })
  mockedCurrencyService.getLatestRates.mockResolvedValue([])
})

it('shows a loading state before consolidations arrive', () => {
  mockedPackageService.getMyConsolidations.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an error alert when loading fails', async () => {
  mockedPackageService.getMyConsolidations.mockRejectedValue(new Error('boom'))
  renderPage()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('shows the empty state when there are no consolidations', async () => {
  mockedPackageService.getMyConsolidations.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText(/consolidate packages/i)).toBeInTheDocument()
})

it('renders consolidations with status badges and a tracking code copy button for shipped ones', async () => {
  mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation, shippedConsolidation])
  renderPage()

  expect(await screen.findByText('Springfield, US')).toBeInTheDocument()
  expect(screen.getByText('Miami, BR')).toBeInTheDocument()
  expect(screen.getByText('TRACK123')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /copy/i }).length).toBeGreaterThan(0)
})

describe('local currency estimate next to the USD cost', () => {
  it('shows the approximate BRL value for a BR user with a BRL rate', async () => {
    mockedUseAuth.mockReturnValue({ user: { ...usUser, country: 'BR' }, loading: false })
    mockedCurrencyService.getLatestRates.mockResolvedValue([brlRate])
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation])
    renderPage()

    // 43 USD × 5 = 215 BRL, marcado como estimativa do dia
    const estimate = await screen.findByText(/≈ R\$ 215\.00/)
    expect(estimate).toHaveAttribute('title', expect.stringMatching(/exchange rate/i))
    expect(mockedCurrencyService.getLatestRates).toHaveBeenCalledTimes(1)
  })

  it('does not show an estimate for a US user — USD is the real currency', async () => {
    mockedCurrencyService.getLatestRates.mockResolvedValue([brlRate, usdRate])
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation])
    renderPage()

    expect(await screen.findByText('Springfield, US')).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('does not show an estimate when there is no rate for the mapped currency', async () => {
    mockedUseAuth.mockReturnValue({ user: { ...usUser, country: 'BR' }, loading: false })
    mockedCurrencyService.getLatestRates.mockResolvedValue([])
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation])
    renderPage()

    expect(await screen.findByText('Springfield, US')).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('keeps the page fully working when loading rates fails', async () => {
    mockedUseAuth.mockReturnValue({ user: { ...usUser, country: 'BR' }, loading: false })
    mockedCurrencyService.getLatestRates.mockRejectedValue(new Error('boom'))
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation, shippedConsolidation])
    renderPage()

    expect(await screen.findByText('Springfield, US')).toBeInTheDocument()
    expect(screen.getByText('Miami, BR')).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('paying for a pending consolidation', () => {
  it('redirects to the Stripe checkout url on success', async () => {
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation])
    mockedPaymentService.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/abc' })

    const originalLocation = window.location
    // jsdom doesn't allow setting window.location.href in-place without a
    // full navigation; replace it with a writable stub for this test.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    renderPage()
    const payButton = await screen.findByRole('button', { name: /pay now/i })
    await userEvent.click(payButton)

    await waitFor(() => {
      expect(mockedPaymentService.createCheckoutSession).toHaveBeenCalledWith('c1')
    })
    await waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/abc')
    })

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('shows an alert when checkout session creation fails', async () => {
    mockedPackageService.getMyConsolidations.mockResolvedValue([pendingConsolidation])
    mockedPaymentService.createCheckoutSession.mockRejectedValue(new Error('nope'))

    renderPage()
    const payButton = await screen.findByRole('button', { name: /pay now/i })
    await userEvent.click(payButton)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('payment return banners', () => {
  it('shows a success banner when returning with ?payment=success', async () => {
    mockedPackageService.getMyConsolidations.mockResolvedValue([])
    renderPage(['/app/shipments?payment=success'])

    const status = await screen.findByRole('status')
    expect(within(status).getByText(/payment received/i)).toBeInTheDocument()
  })

  it('shows a cancelled banner when returning with ?payment=cancelled', async () => {
    mockedPackageService.getMyConsolidations.mockResolvedValue([])
    renderPage(['/app/shipments?payment=cancelled'])

    expect(await screen.findByText(/checkout was cancelled/i)).toBeInTheDocument()
  })

  it('dismisses the banner when the dismiss button is clicked', async () => {
    mockedPackageService.getMyConsolidations.mockResolvedValue([])
    renderPage(['/app/shipments?payment=success'])

    const status = await screen.findByRole('status')
    await userEvent.click(within(status).getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
