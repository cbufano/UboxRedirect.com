import { render, screen } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Overview from './Overview'
import { adminService, type PendingActions } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: { getPendingActions: vi.fn() },
}))
const mocked = vi.mocked(adminService)

const emptyActions: PendingActions = {
  awaitingReview: 0,
  paidUnshipped: [],
  openDataRequests: 0,
  storageOverdue: [],
  unreconciled: [],
  trackingExceptions: [],
  failedEmails: 0,
}

const busyActions: PendingActions = {
  awaitingReview: 4,
  paidUnshipped: [{ id: 'c1', city: 'São Paulo', country: 'BR', paidAt: '2026-07-01T10:00:00Z' }],
  openDataRequests: 7,
  storageOverdue: [{ id: 'p1', store: 'Amazon', suiteNumber: 'BUF-10001', receivedAt: '2026-06-01T10:00:00Z' }],
  unreconciled: [{ id: 'c2', city: 'Lisbon', country: 'PT', shippedAt: '2026-07-10T10:00:00Z' }],
  trackingExceptions: [],
  failedEmails: 0,
}

function renderOverview() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while pending actions are being fetched', () => {
  mocked.getPendingActions.mockReturnValue(new Promise(() => {}))
  renderOverview()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('renders each card counter with its target link', async () => {
  mocked.getPendingActions.mockResolvedValue(busyActions)
  renderOverview()

  // Contadores: 4 (a conferir), 7 (LGPD) e três listas de 1 item cada.
  expect(await screen.findByText('4')).toBeInTheDocument()
  expect(screen.getByText('7')).toBeInTheDocument()
  expect(screen.getAllByText('1')).toHaveLength(3)

  expect(screen.getByRole('link', { name: /packages queue/i })).toHaveAttribute('href', '/admin/packages')
  expect(screen.getByRole('link', { name: /shipping queue/i })).toHaveAttribute('href', '/admin/consolidations')
  expect(screen.getByRole('link', { name: /data requests/i })).toHaveAttribute('href', '/admin/data-requests')
})

it('renders the inline lists with their data', async () => {
  mocked.getPendingActions.mockResolvedValue(busyActions)
  renderOverview()

  // Paga sem envio: destino + data de pagamento.
  expect(await screen.findByText(/São Paulo, BR/)).toBeInTheDocument()
  // Armazenagem vencida: cada item linka para a ficha do pacote.
  const storageLink = screen.getByRole('link', { name: /Amazon.*BUF-10001/ })
  expect(storageLink).toHaveAttribute('href', '/admin/packages/p1')
  // Conciliação: consolidação enviada sem pagamento registrado.
  expect(screen.getByText(/Lisbon, PT/)).toBeInTheDocument()
})

it('shows the all-clear state when nothing is pending', async () => {
  mocked.getPendingActions.mockResolvedValue(emptyActions)
  renderOverview()

  expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('shows an alert when loading pending actions fails', async () => {
  mocked.getPendingActions.mockRejectedValue(new Error('boom'))
  renderOverview()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
