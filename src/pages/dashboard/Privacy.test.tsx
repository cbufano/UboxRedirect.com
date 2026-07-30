import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Privacy from './Privacy'
import { privacyService, type DataRequest } from '../../services/privacyService'

vi.mock('../../services/privacyService', () => ({
  privacyService: {
    getMyDataRequests: vi.fn(),
    submitDataRequest: vi.fn(),
  },
}))
const mocked = vi.mocked(privacyService)

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getMyDataRequests.mockResolvedValue([])
})

function renderPage() {
  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  )
}

function makeRequest(overrides: Partial<DataRequest> = {}): DataRequest {
  return {
    id: 'r1',
    kind: 'export',
    status: 'pending',
    requestNote: 'Please send my data',
    resolutionNotes: '',
    requestedAt: '2026-07-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

it('renders the request buttons immediately and only shows a loading indicator for the list section', async () => {
  mocked.getMyDataRequests.mockReturnValue(new Promise(() => {}))
  renderPage()

  expect(screen.getByRole('button', { name: /request my data/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /request account deletion/i })).toBeEnabled()

  expect(await screen.findByText('Loading…')).toBeInTheDocument()
})

it('shows an alert in the list section when loading requests fails, without blocking the buttons', async () => {
  mocked.getMyDataRequests.mockRejectedValue(new Error('network down'))
  renderPage()

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /request my data/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /request account deletion/i })).toBeEnabled()
})

it('submits an export request with a note and shows a success message', async () => {
  mocked.submitDataRequest.mockResolvedValue()
  renderPage()
  await screen.findByRole('button', { name: /request my data/i })

  await userEvent.click(screen.getByRole('button', { name: /request my data/i }))
  await userEvent.type(screen.getByLabelText(/note for our support team/i), 'Please export everything')
  await userEvent.click(screen.getByRole('button', { name: /confirm export request/i }))

  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.submitDataRequest).toHaveBeenCalledWith({
    kind: 'export',
    requestNote: 'Please export everything',
  })
})

it('submits a deletion request without a note', async () => {
  mocked.submitDataRequest.mockResolvedValue()
  renderPage()
  await screen.findByRole('button', { name: /request account deletion/i })

  await userEvent.click(screen.getByRole('button', { name: /request account deletion/i }))
  await userEvent.click(screen.getByRole('button', { name: /confirm deletion request/i }))

  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.submitDataRequest).toHaveBeenCalledWith({ kind: 'delete', requestNote: '' })
})

it('closes the panel on cancel without submitting', async () => {
  renderPage()
  await screen.findByRole('button', { name: /request my data/i })

  await userEvent.click(screen.getByRole('button', { name: /request my data/i }))
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

  expect(screen.queryByRole('button', { name: /confirm export request/i })).not.toBeInTheDocument()
  expect(mocked.submitDataRequest).not.toHaveBeenCalled()
})

it('shows an alert when submitting the request fails', async () => {
  mocked.submitDataRequest.mockRejectedValue(new Error('boom'))
  renderPage()
  await screen.findByRole('button', { name: /request my data/i })

  await userEvent.click(screen.getByRole('button', { name: /request my data/i }))
  await userEvent.click(screen.getByRole('button', { name: /confirm export request/i }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('loads and displays past requests with status badges', async () => {
  mocked.getMyDataRequests.mockResolvedValue([
    makeRequest({ id: 'r1', kind: 'export', status: 'completed' }),
    makeRequest({ id: 'r2', kind: 'delete', status: 'rejected' }),
  ])
  renderPage()

  const exportRow = (await screen.findByText('Data export')).closest('tr')!
  expect(within(exportRow).getByText('Completed')).toBeInTheDocument()

  const deleteRow = screen.getByText('Account deletion').closest('tr')!
  expect(within(deleteRow).getByText('Rejected')).toBeInTheDocument()
})

it('shows an empty state when there are no past requests', async () => {
  renderPage()
  expect(await screen.findByText(/no requests yet/i)).toBeInTheDocument()
})
