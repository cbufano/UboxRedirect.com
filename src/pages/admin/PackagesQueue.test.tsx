import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import PackagesQueue from './PackagesQueue'
import { adminService } from '../../services/adminService'
import { warehouseService } from '../../services/warehouseService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPackagesNeedingReview: vi.fn(),
    markPackageReady: vi.fn(),
    findUserBySuite: vi.fn(),
    getPendingPreAlerts: vi.fn(),
    receivePackage: vi.fn(),
    uploadPackagePhoto: vi.fn(),
    setKycStatus: vi.fn(),
    setOfacStatus: vi.fn(),
  },
}))
vi.mock('../../services/warehouseService', () => ({
  warehouseService: {
    nextFreeLocation: vi.fn(),
    getOccupancy: vi.fn(),
  },
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock-qr') },
}))
const mocked = vi.mocked(adminService)
const mockedWarehouse = vi.mocked(warehouseService)

const queueRow = {
  id: 'pkg1',
  store: 'Amazon',
  description: 'Headphones',
  weightKg: 0.6,
  status: 'received' as const,
  customerName: 'Ana Silva',
  customerSuite: 'BUF-10001',
}

const customer = {
  userId: 'cust-1',
  name: 'Ana Silva',
  kycStatus: 'not_started' as const,
  ofacStatus: 'not_started' as const,
}

const preAlert = {
  id: 'ep-1',
  store: 'Nike',
  trackingNumber: 'TRK123',
  description: 'Running shoes',
  declaredValueUsd: 89.9,
  status: 'pending' as const,
  createdAt: '2026-07-01T00:00:00Z',
}

const freeSlot = {
  id: 'loc-1',
  code: 'G-A-01-1-01',
  zone: 'G',
  aisle: 'A',
  rack: '01',
  level: '1',
  bin: '01',
  active: true,
  packageId: null,
  packageStatus: null,
  suiteNumber: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getPackagesNeedingReview.mockResolvedValue([])
  mocked.getPendingPreAlerts.mockResolvedValue([])
  mockedWarehouse.nextFreeLocation.mockResolvedValue(null)
  mockedWarehouse.getOccupancy.mockResolvedValue([])
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
  mocked.receivePackage.mockResolvedValue('pkg-new')
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

it('fills the form from a clicked pre-alert and sends its id on submit', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mocked.getPendingPreAlerts.mockResolvedValue([preAlert])
  mocked.receivePackage.mockResolvedValue('pkg-new')
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(mocked.getPendingPreAlerts).toHaveBeenCalledWith('cust-1')
  await userEvent.click(await screen.findByRole('button', { name: /Nike/ }))

  expect(screen.getByLabelText(/^store$/i)).toHaveValue('Nike')
  expect(screen.getByLabelText(/^description$/i)).toHaveValue('Running shoes')
  expect(screen.getByLabelText(/declared value/i)).toHaveValue(89.9)
  expect(screen.getByText(/matched to pre-alert/i)).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')
  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  expect(mocked.receivePackage).toHaveBeenCalledWith({
    userId: 'cust-1',
    store: 'Nike',
    description: 'Running shoes',
    weightKg: 1.2,
    expectedPackageId: 'ep-1',
    declaredValueUsd: 89.9,
  })
})

it('deselecting the pre-alert submits without expectedPackageId', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mocked.getPendingPreAlerts.mockResolvedValue([preAlert])
  mocked.receivePackage.mockResolvedValue('pkg-new')
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  await userEvent.click(await screen.findByRole('button', { name: /Nike/ }))
  await userEvent.click(screen.getByRole('button', { name: /receive without pre-alert/i }))

  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')
  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  expect(mocked.receivePackage).toHaveBeenCalledWith({
    userId: 'cust-1',
    store: 'Nike',
    description: 'Running shoes',
    weightKg: 1.2,
    declaredValueUsd: 89.9,
  })
})

it('shows the suggested warehouse position and sends its id on submit', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mockedWarehouse.nextFreeLocation.mockResolvedValue({ id: 'loc-1', code: 'G-A-01-1-01' })
  mockedWarehouse.getOccupancy.mockResolvedValue([freeSlot])
  mocked.receivePackage.mockResolvedValue('pkg-new')
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  // chip + opção do dropdown compartilham o texto do código
  expect((await screen.findAllByText('G-A-01-1-01')).length).toBeGreaterThan(0)

  await userEvent.type(screen.getByLabelText(/^store$/i), 'Amazon')
  await userEvent.type(screen.getByLabelText(/^description$/i), 'Sneakers')
  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')
  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  expect(mocked.receivePackage).toHaveBeenCalledWith(
    expect.objectContaining({ locationId: 'loc-1' }),
  )
})

it('warns when there is no free position and receives without one', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mockedWarehouse.nextFreeLocation.mockResolvedValue(null)
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))

  expect(await screen.findByText(/no free position available/i)).toBeInTheDocument()
})

it('opens the stock label modal after a successful receive', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mocked.receivePackage.mockResolvedValue('pkg-new')
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))
  await screen.findByText(/Ana Silva/)

  await userEvent.type(screen.getByLabelText(/^store$/i), 'Amazon')
  await userEvent.type(screen.getByLabelText(/^description$/i), 'Sneakers')
  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')
  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  const dialog = await screen.findByRole('dialog', { name: /stock label/i })
  expect(within(dialog).getByText('BUF-10001')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /print label/i })).toBeInTheDocument()
})

it('keeps the package received and warns when the photo upload fails', async () => {
  mocked.findUserBySuite.mockResolvedValue(customer)
  mocked.receivePackage.mockResolvedValue('pkg-new')
  mocked.uploadPackagePhoto.mockRejectedValue(new Error('boom'))
  render(<PackagesQueue />)

  await screen.findByText(/nothing in the queue/i)
  await userEvent.type(screen.getByLabelText(/suite number/i), 'BUF-10001')
  await userEvent.click(screen.getByRole('button', { name: /find customer/i }))
  await screen.findByText(/Ana Silva/)

  await userEvent.type(screen.getByLabelText(/^store$/i), 'Amazon')
  await userEvent.type(screen.getByLabelText(/^description$/i), 'Sneakers')
  await userEvent.type(screen.getByLabelText(/weight/i), '1.2')
  const file = new File(['x'], 'photo.png', { type: 'image/png' })
  await userEvent.upload(screen.getByLabelText(/photo/i), file)

  await userEvent.click(screen.getByRole('button', { name: /receive package/i }))

  expect(mocked.uploadPackagePhoto).toHaveBeenCalledWith('pkg-new', file)
  expect(await screen.findByText(/photo upload failed/i)).toBeInTheDocument()
  // o recebimento em si continua valendo: etiqueta aberta e sucesso na tela
  expect(screen.getByRole('dialog', { name: /stock label/i })).toBeInTheDocument()
  expect(screen.getByText('Package received.')).toBeInTheDocument()
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
