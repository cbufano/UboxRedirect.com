import { render, screen } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Overview from './Overview'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: { getOpsStats: vi.fn() },
}))
const mocked = vi.mocked(adminService)

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while stats are being fetched', () => {
  mocked.getOpsStats.mockReturnValue(new Promise(() => {}))
  render(<Overview />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('renders the stat tiles once loaded', async () => {
  mocked.getOpsStats.mockResolvedValue({ awaitingReview: 4, pendingConsolidations: 2, openPreAlerts: 7 })
  render(<Overview />)

  expect(await screen.findByText('4')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('7')).toBeInTheDocument()
})

it('shows an alert when loading stats fails', async () => {
  mocked.getOpsStats.mockRejectedValue(new Error('boom'))
  render(<Overview />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
