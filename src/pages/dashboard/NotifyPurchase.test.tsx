import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import NotifyPurchase from './NotifyPurchase'
import { packageService } from '../../services/packageService'

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
