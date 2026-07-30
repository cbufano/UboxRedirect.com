import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Ship from './Ship'
import { packageService } from '../../services/packageService'
import { rateService } from '../../services/rateService'

vi.mock('../../services/packageService', () => ({
  packageService: {
    getMyReceivedPackages: vi.fn(),
    createConsolidation: vi.fn(),
    addConsolidationItems: vi.fn(),
  },
}))
vi.mock('../../services/rateService', () => ({
  rateService: {
    estimateShippingCost: vi.fn(),
  },
}))

const mockedPackages = vi.mocked(packageService)
const mockedRate = vi.mocked(rateService)

const RECEIVED_PACKAGES = [
  {
    id: 'r1',
    store: 'Amazon',
    description: 'Headphones',
    weightKg: 0.6,
    status: 'ready' as const,
    receivedAt: '2026-07-14T00:00:00Z',
  },
  {
    id: 'r2',
    store: 'Nike',
    description: 'Running shoes',
    weightKg: 0.9,
    status: 'ready' as const,
    receivedAt: '2026-07-18T00:00:00Z',
  },
]

const ESTIMATE = {
  chargeableWeightKg: 1.5,
  currency: 'USD' as const,
  options: [
    { carrier: 'Economy', etaDays: '8-14', costUsd: 20 },
    { carrier: 'Express', etaDays: '3-5', costUsd: 30 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPackages.getMyReceivedPackages.mockResolvedValue(RECEIVED_PACKAGES)
  mockedRate.estimateShippingCost.mockResolvedValue(ESTIMATE)
})

function renderShip(selectedIds: string[] | undefined = ['r1', 'r2']) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/app/ship', state: selectedIds ? { selectedIds } : undefined }]}>
      <Ship />
    </MemoryRouter>,
  )
}

async function fillAddressAndCustoms() {
  await userEvent.type(screen.getByLabelText(/recipient name/i), 'John Doe')
  await userEvent.type(screen.getByLabelText(/street/i), '123 Main St')
  await userEvent.type(screen.getByLabelText(/city/i), 'Springfield')
  await userEvent.type(screen.getByLabelText(/postal code/i), '62704')
  await userEvent.type(screen.getByLabelText(/description|contents/i), 'Clothing and electronics')
  await userEvent.type(screen.getByLabelText(/value/i), '250')
}

it('shows the empty state when there are no selected packages', async () => {
  renderShip([])
  expect(await screen.findByText(/no packages to ship/i)).toBeInTheDocument()
})

it('shows a cost estimate for the consolidated shipment', async () => {
  renderShip()
  expect((await screen.findAllByText(/\$20\.00/)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/\$30\.00/).length).toBeGreaterThan(0)
})

it('shows an alert when loading packages fails', async () => {
  mockedPackages.getMyReceivedPackages.mockRejectedValue(new Error('boom'))
  renderShip()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('shows an inline error when the shipping estimate fails, without crashing the page', async () => {
  mockedRate.estimateShippingCost.mockRejectedValue(new Error('boom'))
  renderShip()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})

it('creates a consolidation and shows an order confirmation on success', async () => {
  mockedPackages.createConsolidation.mockResolvedValue('11111111-2222-3333-4444-555555555555')
  mockedPackages.addConsolidationItems.mockResolvedValue()
  renderShip()

  await screen.findAllByText(/\$20\.00/)
  await fillAddressAndCustoms()
  await userEvent.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mockedPackages.createConsolidation).toHaveBeenCalledWith(
    expect.objectContaining({
      recipientName: 'John Doe',
      street: '123 Main St',
      city: 'Springfield',
      postalCode: '62704',
      country: 'BR',
      carrier: 'Economy',
      chargeableWeightKg: 1.5,
      costUsd: 20,
      contentsDescription: 'Clothing and electronics',
      declaredValueUsd: 250,
    }),
  )
  expect(mockedPackages.addConsolidationItems).toHaveBeenCalledWith(
    '11111111-2222-3333-4444-555555555555',
    ['r1', 'r2'],
  )
})

it('shows an alert when creating the consolidation fails', async () => {
  mockedPackages.createConsolidation.mockRejectedValue(new Error('boom'))
  renderShip()

  await screen.findAllByText(/\$20\.00/)
  await fillAddressAndCustoms()
  await userEvent.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(mockedPackages.addConsolidationItems).not.toHaveBeenCalled()
})
