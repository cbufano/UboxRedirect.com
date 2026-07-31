import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import ConsolidationsQueue from './ConsolidationsQueue'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPaidConsolidations: vi.fn(),
    markConsolidationShipped: vi.fn(),
  },
}))
const mocked = vi.mocked(adminService)

const AMAZON_ID = '11111111-1111-4111-8111-111111111111'
const NIKE_ID = '22222222-2222-4222-8222-222222222222'
const APPLE_ID = '33333333-3333-4333-8333-333333333333'
const UNRELATED_ID = '99999999-9999-4999-8999-999999999999'

// Itens propositalmente FORA de ordem (Amazon em G-A-02 vem antes de Nike em
// G-A-01 no array; Apple sem posição) para provar a ordenação por código.
const row = {
  id: 'c1',
  customerName: 'Ana Silva',
  city: 'Springfield',
  country: 'US',
  declaredValueUsd: 120,
  carrier: null,
  trackingCode: null,
  items: [
    {
      packageId: AMAZON_ID,
      store: 'Amazon',
      description: 'Shoes',
      weightKg: 1.2,
      locationId: 'loc-2',
      locationCode: 'G-A-02-1-01',
    },
    {
      packageId: APPLE_ID,
      store: 'Apple',
      description: 'Charger',
      weightKg: 0.3,
      locationId: null,
      locationCode: null,
    },
    {
      packageId: NIKE_ID,
      store: 'Nike',
      description: 'Jacket',
      weightKg: 0.8,
      locationId: 'loc-1',
      locationCode: 'G-A-01-1-01',
    },
  ],
}

async function checkAllItems(card: HTMLElement) {
  const checkboxes = within(card).getAllByRole('checkbox', { name: /mark .* as checked/i })
  for (const checkbox of checkboxes) {
    await userEvent.click(checkbox)
  }
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while the queue is being fetched', () => {
  mocked.getPaidConsolidations.mockReturnValue(new Promise(() => {}))
  render(<ConsolidationsQueue />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an empty state when there are no paid consolidations', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([])
  render(<ConsolidationsQueue />)
  expect(await screen.findByText(/no paid consolidations/i)).toBeInTheDocument()
})

it('lists a paid consolidation with its pick list ordered by location code, nulls last', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
  expect(screen.getByText(/Springfield/)).toBeInTheDocument()
  expect(screen.getByText(/120/)).toBeInTheDocument()

  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(items[0]).toHaveTextContent('G-A-01-1-01')
  expect(items[0]).toHaveTextContent('Nike')
  expect(items[1]).toHaveTextContent('G-A-02-1-01')
  expect(items[1]).toHaveTextContent('Amazon')
  expect(items[2]).toHaveTextContent('No location')
  expect(items[2]).toHaveTextContent('Apple')
})

it('marks the right item as checked when a full label URL is scanned', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  await screen.findByText('Ana Silva')
  await userEvent.type(
    screen.getByLabelText(/scan the package qr/i),
    `https://ubox.example.com/admin/packages/${NIKE_ID}`,
  )
  await userEvent.click(screen.getByRole('button', { name: /check package/i }))

  expect(screen.getByRole('checkbox', { name: /nike/i })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /amazon/i })).not.toBeChecked()
  expect(screen.getByRole('status')).toHaveTextContent(/nike/i)
})

it('shows an error when the scanned uuid does not belong to the consolidation', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  await screen.findByText('Ana Silva')
  await userEvent.type(screen.getByLabelText(/scan the package qr/i), UNRELATED_ID)
  await userEvent.click(screen.getByRole('button', { name: /check package/i }))

  expect(screen.getByRole('alert')).toHaveTextContent(/does not belong to this consolidation/i)
  screen.getAllByRole('checkbox', { name: /mark .* as checked/i }).forEach((checkbox) => {
    expect(checkbox).not.toBeChecked()
  })
})

it('shows an error when the scanned text has no uuid at all', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  await screen.findByText('Ana Silva')
  await userEvent.type(screen.getByLabelText(/scan the package qr/i), 'not-a-uuid')
  await userEvent.click(screen.getByRole('button', { name: /check package/i }))

  expect(screen.getByRole('alert')).toHaveTextContent(/no package id found/i)
})

it('keeps mark shipped disabled until every item is checked, then ships and removes the row', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  mocked.markConsolidationShipped.mockResolvedValue()
  render(<ConsolidationsQueue />)

  const card = (await screen.findByText('Ana Silva')).closest('div.rounded-xl') as HTMLElement
  await userEvent.type(within(card).getByPlaceholderText(/carrier/i), 'DHL')
  await userEvent.type(within(card).getByPlaceholderText(/tracking/i), 'TRK123')
  expect(within(card).getByRole('button', { name: /mark shipped/i })).toBeDisabled()

  await checkAllItems(card)
  const shipButton = within(card).getByRole('button', { name: /mark shipped/i })
  expect(shipButton).toBeEnabled()

  await userEvent.click(shipButton)
  expect(mocked.markConsolidationShipped).toHaveBeenCalledWith('c1', {
    carrier: 'DHL',
    trackingCode: 'TRK123',
  })
  expect(await screen.findByText(/no paid consolidations/i)).toBeInTheDocument()
})

it('enables mark shipped through the explicit "ship without checking" override, with a warning', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  const card = (await screen.findByText('Ana Silva')).closest('div.rounded-xl') as HTMLElement
  await userEvent.type(within(card).getByPlaceholderText(/carrier/i), 'DHL')
  await userEvent.type(within(card).getByPlaceholderText(/tracking/i), 'TRK123')
  expect(within(card).getByRole('button', { name: /mark shipped/i })).toBeDisabled()

  await userEvent.click(within(card).getByRole('checkbox', { name: /ship without checking/i }))

  expect(within(card).getByRole('alert')).toHaveTextContent(/without checking every package/i)
  expect(within(card).getByRole('button', { name: /mark shipped/i })).toBeEnabled()
})

it('keeps mark shipped disabled with all items checked but no carrier or tracking', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  const card = (await screen.findByText('Ana Silva')).closest('div.rounded-xl') as HTMLElement
  await checkAllItems(card)
  expect(within(card).getByRole('button', { name: /mark shipped/i })).toBeDisabled()
})

it('shows the ship error and keeps the row when marking shipped fails', async () => {
  mocked.getPaidConsolidations.mockResolvedValue([row])
  mocked.markConsolidationShipped.mockRejectedValue(new Error('boom'))
  render(<ConsolidationsQueue />)

  const card = (await screen.findByText('Ana Silva')).closest('div.rounded-xl') as HTMLElement
  await userEvent.type(within(card).getByPlaceholderText(/carrier/i), 'DHL')
  await userEvent.type(within(card).getByPlaceholderText(/tracking/i), 'TRK123')
  await checkAllItems(card)
  await userEvent.click(within(card).getByRole('button', { name: /mark shipped/i }))

  expect(await within(card).findByText(/couldn't update that consolidation/i)).toBeInTheDocument()
  expect(screen.getByText('Ana Silva')).toBeInTheDocument()
})

it('shows an alert when loading the queue fails', async () => {
  mocked.getPaidConsolidations.mockRejectedValue(new Error('boom'))
  render(<ConsolidationsQueue />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
