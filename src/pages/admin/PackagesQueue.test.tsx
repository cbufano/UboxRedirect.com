import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import PackagesQueue from './PackagesQueue'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPackagesNeedingReview: vi.fn(),
    markPackageReady: vi.fn(),
    findUserBySuite: vi.fn(),
    receivePackage: vi.fn(),
    setKycStatus: vi.fn(),
    setOfacStatus: vi.fn(),
  },
}))
const mocked = vi.mocked(adminService)

const queueRow = {
  id: 'pkg1',
  store: 'Amazon',
  description: 'Headphones',
  weightKg: 0.6,
  status: 'received' as const,
  customerName: 'Ana Silva',
  customerSuite: 'BUF-10001',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getPackagesNeedingReview.mockResolvedValue([])
})

it('shows a loading state while the queue is being fetched', () => {
  mocked.getPackagesNeedingReview.mockReturnValue(new Promise(() => {}))
  render(<PackagesQueue />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an empty state when there is nothing in the queue', async () => {
  render(<PackagesQueue />)
  expect(await screen.findByText(/nothing in the queue/i)).toBeInTheDocument()
})

it('lists queued packages with customer name and suite', async () => {
  mocked.getPackagesNeedingReview.mockResolvedValue([queueRow])
  render(<PackagesQueue />)

  expect(await screen.findByText('Amazon')).toBeInTheDocument()
  expect(screen.getByText('Ana Silva')).toBeInTheDocument()
  expect(screen.getByText(/BUF-10001/)).toBeInTheDocument()
})

it('marks a package ready and removes it from the queue', async () => {
  mocked.getPackagesNeedingReview.mockResolvedValue([queueRow])
  mocked.markPackageReady.mockResolvedValue()
  render(<PackagesQueue />)

  const row = (await screen.findByText('Amazon')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: /mark ready/i }))

  expect(mocked.markPackageReady).toHaveBeenCalledWith('pkg1')
  expect(screen.queryByText('Amazon')).not.toBeInTheDocument()
})

it('shows an alert when loading the queue fails', async () => {
  mocked.getPackagesNeedingReview.mockRejectedValue(new Error('boom'))
  render(<PackagesQueue />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('looks up a customer by suite, then receives a package for them', async () => {
  mocked.findUserBySuite.mockResolvedValue({
    userId: 'cust-1',
    name: 'Ana Silva',
    kycStatus: 'not_started',
    ofacStatus: 'not_started',
  })
  mocked.receivePackage.mockResolvedValue()
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)

  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(await screen.findByText(/Ana Silva/)).toBeInTheDocument()
  expect(mocked.findUserBySuite).toHaveBeenCalledWith('BUF-10001')

  await userEvent.type(screen.getByLabelText(/^store$/i), 'Amazon')
  await userEvent.type(screen.getByLabelText(/description/i), 'Sneakers')
  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')

  mocked.getPackagesNeedingReview.mockResolvedValue([])
  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  expect(mocked.receivePackage).toHaveBeenCalledWith({
    userId: 'cust-1',
    store: 'Amazon',
    description: 'Sneakers',
    weightKg: 1.2,
  })
  expect(await screen.findByText(/package received/i)).toBeInTheDocument()
})

it('shows a not-found message when the suite has no matching customer', async () => {
  mocked.findUserBySuite.mockResolvedValue(null)
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-99999')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(await screen.findByText(/no customer found/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /receive package/i })).toBeDisabled()
})

it('shows compliance status controls for the matched customer and updates KYC status', async () => {
  mocked.findUserBySuite.mockResolvedValue({
    userId: 'cust-1',
    name: 'Ana Silva',
    kycStatus: 'pending',
    ofacStatus: 'clear',
  })
  mocked.setKycStatus.mockResolvedValue()
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  await screen.findByText(/Ana Silva/)
  const kycSelect = screen.getByLabelText(/kyc status/i)
  expect(kycSelect).toHaveValue('pending')

  await userEvent.selectOptions(kycSelect, 'verified')

  expect(mocked.setKycStatus).toHaveBeenCalledWith('cust-1', 'verified')
  expect(await screen.findByText(/compliance status updated/i)).toBeInTheDocument()
})

it('updates OFAC screening status for the matched customer', async () => {
  mocked.findUserBySuite.mockResolvedValue({
    userId: 'cust-1',
    name: 'Ana Silva',
    kycStatus: 'not_started',
    ofacStatus: 'not_started',
  })
  mocked.setOfacStatus.mockResolvedValue()
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  await screen.findByText(/Ana Silva/)
  await userEvent.selectOptions(screen.getByLabelText(/ofac screening/i), 'flagged')

  expect(mocked.setOfacStatus).toHaveBeenCalledWith('cust-1', 'flagged')
})

it('shows an alert when updating compliance status fails', async () => {
  mocked.findUserBySuite.mockResolvedValue({
    userId: 'cust-1',
    name: 'Ana Silva',
    kycStatus: 'pending',
    ofacStatus: 'clear',
  })
  mocked.setKycStatus.mockRejectedValue(new Error('boom'))
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  await screen.findByText(/Ana Silva/)
  await userEvent.selectOptions(screen.getByLabelText(/kyc status/i), 'rejected')

  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
