import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import DataRequestsQueue from './DataRequestsQueue'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getOpenDataRequests: vi.fn(),
    resolveDataRequest: vi.fn(),
  },
}))
const mocked = vi.mocked(adminService)

const requestRow = {
  id: 'r1',
  kind: 'export' as const,
  status: 'pending' as const,
  requestNote: 'Please send everything',
  resolutionNotes: '',
  requestedAt: '2026-07-01T00:00:00Z',
  customerName: 'Ana Silva',
  customerEmail: 'ana@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getOpenDataRequests.mockResolvedValue([])
})

it('shows a loading state while the queue is being fetched', () => {
  mocked.getOpenDataRequests.mockReturnValue(new Promise(() => {}))
  render(<DataRequestsQueue />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an empty state when there is nothing in the queue', async () => {
  render(<DataRequestsQueue />)
  expect(await screen.findByText(/no open data requests/i)).toBeInTheDocument()
})

it('lists open requests with customer name, email, kind and note', async () => {
  mocked.getOpenDataRequests.mockResolvedValue([requestRow])
  render(<DataRequestsQueue />)

  expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
  expect(screen.getByText('ana@example.com')).toBeInTheDocument()
  expect(screen.getByText('Please send everything')).toBeInTheDocument()
  expect(screen.getByText('Export')).toBeInTheDocument()
})

it('shows an alert when loading the queue fails', async () => {
  mocked.getOpenDataRequests.mockRejectedValue(new Error('boom'))
  render(<DataRequestsQueue />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('resolves a request as completed and removes it from the queue', async () => {
  mocked.getOpenDataRequests.mockResolvedValue([requestRow])
  mocked.resolveDataRequest.mockResolvedValue()
  render(<DataRequestsQueue />)

  const row = (await screen.findByText('Ana Silva')).closest('tr')!
  await userEvent.type(within(row).getByLabelText(/resolution notes/i), 'Exported and emailed')
  await userEvent.click(within(row).getByRole('button', { name: /mark completed/i }))

  expect(mocked.resolveDataRequest).toHaveBeenCalledWith('r1', {
    status: 'completed',
    resolutionNotes: 'Exported and emailed',
  })
  expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument()
})

it('rejects a request and removes it from the queue', async () => {
  mocked.getOpenDataRequests.mockResolvedValue([requestRow])
  mocked.resolveDataRequest.mockResolvedValue()
  render(<DataRequestsQueue />)

  const row = (await screen.findByText('Ana Silva')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: /reject/i }))

  expect(mocked.resolveDataRequest).toHaveBeenCalledWith('r1', {
    status: 'rejected',
    resolutionNotes: '',
  })
  expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument()
})

it('shows a row-level alert when resolving fails, and keeps the row', async () => {
  mocked.getOpenDataRequests.mockResolvedValue([requestRow])
  mocked.resolveDataRequest.mockRejectedValue(new Error('boom'))
  render(<DataRequestsQueue />)

  const row = (await screen.findByText('Ana Silva')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: /mark completed/i }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByText('Ana Silva')).toBeInTheDocument()
})
