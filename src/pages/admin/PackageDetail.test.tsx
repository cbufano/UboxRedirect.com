import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '../../i18n'
import PackageDetail from './PackageDetail'
import { adminService, type PackageDetail as PackageDetailData } from '../../services/adminService'
import { warehouseService } from '../../services/warehouseService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPackageDetail: vi.fn(),
    markPackageReady: vi.fn(),
    discardPackage: vi.fn(),
  },
}))
vi.mock('../../services/warehouseService', () => ({
  warehouseService: {
    getOccupancy: vi.fn(),
    movePackage: vi.fn(),
  },
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock-qr') },
}))

const mocked = vi.mocked(adminService)
const mockedWarehouse = vi.mocked(warehouseService)

const baseDetail: PackageDetailData = {
  id: 'pkg-1',
  store: 'Amazon',
  description: 'Shoes',
  weightKg: 1.2,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
  declaredValueUsd: 99.9,
  status: 'in_review',
  receivedAt: '2026-07-29T00:00:00Z',
  userId: 'cust-1',
  customerName: 'Ana Silva',
  customerSuite: 'BUF-10001',
  locationId: 'loc-1',
  locationCode: 'G-A-01-1-01',
  photos: [],
  history: [],
}

const freeSlot = {
  id: 'loc-2',
  code: 'G-A-01-1-02',
  zone: 'G',
  aisle: 'A',
  rack: '01',
  level: '1',
  bin: '02',
  active: true,
  packageId: null,
  packageStatus: null,
  suiteNumber: null,
}

function renderPage(id = 'pkg-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/packages/${id}`]}>
      <Routes>
        <Route path="/admin/packages/:id" element={<PackageDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getPackageDetail.mockResolvedValue(baseDetail)
  mockedWarehouse.getOccupancy.mockResolvedValue([freeSlot])
})

it('shows a loading state while the package is being fetched', () => {
  mocked.getPackageDetail.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an alert when the package cannot be loaded (not found included)', async () => {
  mocked.getPackageDetail.mockRejectedValue(new Error('not found'))
  renderPage('missing-id')
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load this package/i)
})

it('renders the package data, customer, status badge and current position', async () => {
  renderPage()

  expect(await screen.findByText('Amazon')).toBeInTheDocument()
  expect(mocked.getPackageDetail).toHaveBeenCalledWith('pkg-1')
  expect(screen.getByText('Shoes')).toBeInTheDocument()
  expect(screen.getByText('1.2 kg')).toBeInTheDocument()
  expect(screen.getByText('30 × 20 × 10 cm')).toBeInTheDocument()
  expect(screen.getByText('$99.90')).toBeInTheDocument()
  expect(screen.getByText(/Ana Silva — BUF-10001/)).toBeInTheDocument()
  expect(screen.getByText('In review')).toBeInTheDocument()
  expect(screen.getByText('G-A-01-1-01')).toBeInTheDocument()
})

it('shows a message when the package has no photos', async () => {
  renderPage()
  expect(await screen.findByText(/no photos for this package/i)).toBeInTheDocument()
})

it('renders the photos grid from signed URLs', async () => {
  mocked.getPackageDetail.mockResolvedValue({
    ...baseDetail,
    photos: [
      { id: 'ph-1', url: 'https://signed/photo-1.jpg' },
      { id: 'ph-2', url: 'https://signed/photo-2.jpg' },
    ],
  })
  renderPage()

  const photos = await screen.findAllByRole('img', { name: /package photo/i })
  expect(photos).toHaveLength(2)
  expect(photos[0]).toHaveAttribute('src', 'https://signed/photo-1.jpg')
  expect(screen.queryByText(/no photos/i)).not.toBeInTheDocument()
})

it('renders the movement history with from/to codes, who and when', async () => {
  mocked.getPackageDetail.mockResolvedValue({
    ...baseDetail,
    history: [
      {
        id: 'h-1',
        fromCode: null,
        toCode: 'G-A-01-1-01',
        movedByName: 'Op Staff',
        movedAt: '2026-07-29T01:00:00Z',
      },
    ],
  })
  renderPage()

  const row = (await screen.findByText('Op Staff')).closest('tr')!
  expect(within(row).getByText('—')).toBeInTheDocument()
  expect(within(row).getByText('G-A-01-1-01')).toBeInTheDocument()
})

it('shows an empty message when there is no movement history', async () => {
  renderPage()
  expect(await screen.findByText(/no movements recorded yet/i)).toBeInTheDocument()
})

it('moves the package to a free position and reloads the detail', async () => {
  mockedWarehouse.movePackage.mockResolvedValue()
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /^move$/i }))

  expect(mockedWarehouse.getOccupancy).toHaveBeenCalled()
  await userEvent.selectOptions(await screen.findByLabelText(/new position/i), 'loc-2')
  await userEvent.click(screen.getByRole('button', { name: /confirm move/i }))

  expect(mockedWarehouse.movePackage).toHaveBeenCalledWith('pkg-1', 'loc-2')
  // recarrega a ficha depois de mover (1ª chamada no mount + 1 no refresh)
  expect(mocked.getPackageDetail).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/package moved/i)).toBeInTheDocument()
})

it('shows an error message when moving the package fails', async () => {
  mockedWarehouse.movePackage.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /^move$/i }))
  await userEvent.selectOptions(await screen.findByLabelText(/new position/i), 'loc-2')
  await userEvent.click(screen.getByRole('button', { name: /confirm move/i }))

  expect(await screen.findByText(/couldn't move this package/i)).toBeInTheDocument()
})

it('warns when there are no free positions to move to', async () => {
  mockedWarehouse.getOccupancy.mockResolvedValue([
    { ...freeSlot, packageId: 'pkg-other' },
    { ...freeSlot, id: 'loc-3', code: 'G-A-01-1-03', active: false },
  ])
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /^move$/i }))

  expect(await screen.findByText(/no free positions available/i)).toBeInTheDocument()
})

it('marks an in-review package ready and reloads the detail', async () => {
  mocked.markPackageReady.mockResolvedValue()
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /mark ready/i }))

  expect(mocked.markPackageReady).toHaveBeenCalledWith('pkg-1')
  expect(mocked.getPackageDetail).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/package updated/i)).toBeInTheDocument()
})

it('discards an in-review package', async () => {
  mocked.discardPackage.mockResolvedValue()
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /discard/i }))

  expect(mocked.discardPackage).toHaveBeenCalledWith('pkg-1')
  expect(await screen.findByText(/package updated/i)).toBeInTheDocument()
})

it('shows an error message when a status action fails', async () => {
  mocked.markPackageReady.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /mark ready/i }))

  expect(await screen.findByText(/couldn't update this package/i)).toBeInTheDocument()
})

it('hides the status actions when the package is not in review', async () => {
  mocked.getPackageDetail.mockResolvedValue({ ...baseDetail, status: 'ready' })
  renderPage()

  await screen.findByText('Amazon')
  expect(screen.queryByRole('button', { name: /mark ready/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reprint label/i })).toBeInTheDocument()
})

it('opens the stock label modal when reprint is clicked', async () => {
  renderPage()

  await screen.findByText('Amazon')
  await userEvent.click(screen.getByRole('button', { name: /reprint label/i }))

  const dialog = await screen.findByRole('dialog', { name: /stock label/i })
  expect(within(dialog).getByText('BUF-10001')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /print label/i })).toBeInTheDocument()
})
