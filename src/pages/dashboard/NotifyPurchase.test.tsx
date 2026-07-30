import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import NotifyPurchase from './NotifyPurchase'
import { packageService, type ExpectedPackage } from '../../services/packageService'

vi.mock('../../services/packageService', () => ({
  packageService: {
    getMyExpectedPackages: vi.fn(),
    createExpectedPackage: vi.fn(),
    cancelExpectedPackage: vi.fn(),
  },
}))
const mocked = vi.mocked(packageService)

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getMyExpectedPackages.mockResolvedValue([])
})

function renderPage() {
  render(
    <MemoryRouter>
      <NotifyPurchase />
    </MemoryRouter>,
  )
}

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/store/i), 'Amazon')
  await userEvent.type(screen.getByLabelText(/description/i), 'A pair of sneakers')
  await userEvent.type(screen.getByLabelText(/declared value/i), '99.5')
}

function makeExpectedPackage(overrides: Partial<ExpectedPackage> = {}): ExpectedPackage {
  return {
    id: 'p1',
    store: 'Amazon',
    trackingNumber: '1Z999',
    description: 'Sneakers',
    declaredValueUsd: 120,
    status: 'pending',
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

it('loads and displays existing pre-alerts', async () => {
  mocked.getMyExpectedPackages.mockResolvedValue([
    {
      id: 'p1',
      store: 'Amazon',
      trackingNumber: '1Z999',
      description: 'Sneakers',
      declaredValueUsd: 120,
      status: 'pending',
      createdAt: '2026-07-01T00:00:00Z',
    },
  ])
  renderPage()

  expect(await screen.findByText('Sneakers')).toBeInTheDocument()
  expect(screen.getAllByText('Amazon').length).toBeGreaterThan(0)
})

it('submits a new pre-alert successfully and resets the form', async () => {
  mocked.createExpectedPackage.mockResolvedValue()
  renderPage()
  await screen.findByRole('button', { name: /add/i })

  await fillValidForm()
  await userEvent.click(screen.getByRole('button', { name: /add/i }))

  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.createExpectedPackage).toHaveBeenCalledWith({
    store: 'Amazon',
    trackingNumber: '',
    description: 'A pair of sneakers',
    declaredValueUsd: 99.5,
  })
})

it('shows validation errors for missing required fields', async () => {
  renderPage()
  const submit = await screen.findByRole('button', { name: /add/i })
  await userEvent.click(submit)

  expect(await screen.findByText('Please enter the store name.')).toBeInTheDocument()
  expect(mocked.createExpectedPackage).not.toHaveBeenCalled()
})

it('shows an alert when saving the pre-alert fails', async () => {
  mocked.createExpectedPackage.mockRejectedValue(new Error('boom'))
  renderPage()
  await screen.findByRole('button', { name: /add/i })

  await fillValidForm()
  await userEvent.click(screen.getByRole('button', { name: /add/i }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('renders the form immediately and only shows a loading indicator for the list section', async () => {
  mocked.getMyExpectedPackages.mockReturnValue(new Promise(() => {}))
  renderPage()

  // Form is usable right away — it does not wait on the list fetch.
  expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
  expect(screen.getByLabelText(/store/i)).toBeInTheDocument()

  // The list section shows its own loading indicator.
  expect(await screen.findByText('Loading…')).toBeInTheDocument()
})

it('shows an alert in the list section when loading pre-alerts fails, without blocking the form', async () => {
  mocked.getMyExpectedPackages.mockRejectedValue(new Error('network down'))
  renderPage()

  expect(
    await screen.findByText("We couldn't load your pre-alerts. Refresh the page to try again."),
  ).toBeInTheDocument()

  // The submission form is still present and usable despite the list error.
  expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
  expect(screen.getByLabelText(/store/i)).toBeInTheDocument()
})

it('cancels a pending pre-alert and refreshes the list', async () => {
  const pending = makeExpectedPackage({ id: 'p1', status: 'pending' })
  mocked.getMyExpectedPackages
    .mockResolvedValueOnce([pending])
    .mockResolvedValueOnce([{ ...pending, status: 'cancelled' }])
  mocked.cancelExpectedPackage.mockResolvedValue()
  renderPage()

  await screen.findByText('Sneakers')
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

  await waitFor(() => expect(mocked.cancelExpectedPackage).toHaveBeenCalledWith('p1'))
  expect(mocked.getMyExpectedPackages).toHaveBeenCalledTimes(2)
  expect(await screen.findByText('Cancelled')).toBeInTheDocument()
})

it('shows a cancel-specific alert, distinguishable from the submission form alert, when cancelling fails', async () => {
  const pending = makeExpectedPackage({ id: 'p1', status: 'pending' })
  mocked.getMyExpectedPackages.mockResolvedValue([pending])
  mocked.cancelExpectedPackage.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByText('Sneakers')
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

  expect(
    await screen.findByText("We couldn't cancel that pre-alert. Please try again."),
  ).toBeInTheDocument()
  expect(
    screen.queryByText("We couldn't save your pre-alert. Please try again."),
  ).not.toBeInTheDocument()
})

it('does not render a cancel button for matched or cancelled pre-alerts', async () => {
  mocked.getMyExpectedPackages.mockResolvedValue([
    makeExpectedPackage({ id: 'p1', description: 'Matched item', status: 'matched' }),
    makeExpectedPackage({ id: 'p2', description: 'Cancelled item', status: 'cancelled' }),
  ])
  renderPage()

  await screen.findByText('Matched item')
  await screen.findByText('Cancelled item')
  expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
})
