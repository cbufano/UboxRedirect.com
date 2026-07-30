import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import ConsolidationsQueue from './ConsolidationsQueue'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPendingConsolidations: vi.fn(),
    markConsolidationShipped: vi.fn(),
  },
}))
const mocked = vi.mocked(adminService)

const row = {
  id: 'c1',
  customerName: 'Ana Silva',
  city: 'Springfield',
  country: 'US',
  declaredValueUsd: 120,
  carrier: null,
  trackingCode: null,
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while the queue is being fetched', () => {
  mocked.getPendingConsolidations.mockReturnValue(new Promise(() => {}))
  render(<ConsolidationsQueue />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an empty state when there are no pending consolidations', async () => {
  mocked.getPendingConsolidations.mockResolvedValue([])
  render(<ConsolidationsQueue />)
  expect(await screen.findByText(/no pending consolidations/i)).toBeInTheDocument()
})

it('lists pending consolidations with customer and destination', async () => {
  mocked.getPendingConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
  expect(screen.getByText(/Springfield/)).toBeInTheDocument()
  expect(screen.getByText(/US/)).toBeInTheDocument()
  expect(screen.getByText(/120/)).toBeInTheDocument()
})

it('marks a consolidation as shipped with carrier and tracking code, then removes it', async () => {
  mocked.getPendingConsolidations.mockResolvedValue([row])
  mocked.markConsolidationShipped.mockResolvedValue()
  render(<ConsolidationsQueue />)

  const tableRow = (await screen.findByText('Ana Silva')).closest('tr')!
  await userEvent.type(within(tableRow).getByPlaceholderText(/carrier/i), 'DHL')
  await userEvent.type(within(tableRow).getByPlaceholderText(/tracking/i), 'TRK123')
  await userEvent.click(within(tableRow).getByRole('button', { name: /mark shipped/i }))

  expect(mocked.markConsolidationShipped).toHaveBeenCalledWith('c1', {
    carrier: 'DHL',
    trackingCode: 'TRK123',
  })
  expect(await screen.findByText(/no pending consolidations/i)).toBeInTheDocument()
})

it('disables the mark shipped button until carrier and tracking code are filled', async () => {
  mocked.getPendingConsolidations.mockResolvedValue([row])
  render(<ConsolidationsQueue />)

  const tableRow = (await screen.findByText('Ana Silva')).closest('tr')!
  expect(within(tableRow).getByRole('button', { name: /mark shipped/i })).toBeDisabled()
})

it('shows an alert when loading the queue fails', async () => {
  mocked.getPendingConsolidations.mockRejectedValue(new Error('boom'))
  render(<ConsolidationsQueue />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
