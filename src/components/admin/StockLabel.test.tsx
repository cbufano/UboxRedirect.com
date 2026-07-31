import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../../i18n'
import { StockLabel } from './StockLabel'
import QRCode from 'qrcode'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}))
const mockedToDataURL = QRCode.toDataURL as unknown as ReturnType<typeof vi.fn>

const baseProps = {
  packageId: 'pkg-1',
  suite: 'BUF-10001',
  locationCode: 'G-A-01-1-01',
  receivedAt: '2026-07-30T12:00:00Z',
  weightKg: 1.2,
  onClose: () => {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedToDataURL.mockResolvedValue('data:image/png;base64,mock-qr')
  vi.spyOn(window, 'print').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders the suite, location code and weight on the label', async () => {
  render(<StockLabel {...baseProps} />)

  expect(screen.getByRole('dialog', { name: /stock label/i })).toBeInTheDocument()
  expect(screen.getByText('BUF-10001')).toBeInTheDocument()
  expect(screen.getByText('G-A-01-1-01')).toBeInTheDocument()
  expect(screen.getByText(/1\.2 kg/)).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: /qr code/i })).toHaveAttribute(
    'src',
    'data:image/png;base64,mock-qr',
  )
})

it('generates the QR pointing to the package detail page', async () => {
  render(<StockLabel {...baseProps} />)

  await screen.findByRole('img', { name: /qr code/i })
  expect(mockedToDataURL).toHaveBeenCalledWith(
    `${window.location.origin}/admin/packages/pkg-1`,
    expect.anything(),
  )
})

it('shows a fallback when the package has no location', () => {
  render(<StockLabel {...baseProps} locationCode={null} />)
  expect(screen.getByText('NO LOC')).toBeInTheDocument()
})

it('calls window.print when the print button is clicked', async () => {
  render(<StockLabel {...baseProps} />)

  await userEvent.click(screen.getByRole('button', { name: /print label/i }))
  expect(window.print).toHaveBeenCalled()
})

it('calls onClose when the close button is clicked', async () => {
  const onClose = vi.fn()
  render(<StockLabel {...baseProps} onClose={onClose} />)

  await userEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})
