import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Warehouse from './Warehouse'
import { warehouseService, type OccupancySlot } from '../../services/warehouseService'
import { useRole } from '../../contexts/RoleContext'

vi.mock('../../services/warehouseService', () => ({
  warehouseService: {
    generateGrid: vi.fn(),
    getOccupancy: vi.fn(),
    setLocationActive: vi.fn(),
  },
}))
vi.mock('../../contexts/RoleContext', () => ({
  useRole: vi.fn(),
}))

const mocked = vi.mocked(warehouseService)
const mockedUseRole = vi.mocked(useRole)

const freeSlot: OccupancySlot = {
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

const occupiedSlot: OccupancySlot = {
  ...freeSlot,
  id: 'loc-2',
  code: 'G-A-01-1-02',
  bin: '02',
  packageId: 'pkg-1',
  packageStatus: 'received',
  suiteNumber: 'BUF-10001',
}

const inactiveSlot: OccupancySlot = {
  ...freeSlot,
  id: 'loc-3',
  code: 'G-A-01-2-01',
  level: '2',
  active: false,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Warehouse />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRole.mockReturnValue({ roles: ['admin'], loading: false })
  mocked.getOccupancy.mockResolvedValue([freeSlot, occupiedSlot, inactiveSlot])
})

it('shows a loading state while the map is being fetched', () => {
  mocked.getOccupancy.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an alert when the occupancy map cannot be loaded', async () => {
  mocked.getOccupancy.mockRejectedValue(new Error('boom'))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load the warehouse map/i)
})

it('renders free, occupied and inactive cells with the three legend colors', async () => {
  renderPage()

  const free = await screen.findByRole('button', { name: 'G-A-01-1-01 — free' })
  const occupied = screen.getByRole('link', { name: 'G-A-01-1-02 — suite BUF-10001' })
  const inactive = screen.getByRole('button', { name: 'G-A-01-2-01 — inactive' })

  expect(free.className).toContain('bg-success/70')
  expect(occupied.className).toContain('bg-amber-400')
  expect(inactive.className).toContain('bg-slate/25')

  // legenda das 3 cores
  expect(screen.getByText('Free')).toBeInTheDocument()
  expect(screen.getByText('Occupied')).toBeInTheDocument()
  expect(screen.getByText('Inactive')).toBeInTheDocument()
})

it('links an occupied cell to the package detail page', async () => {
  renderPage()

  const occupied = await screen.findByRole('link', { name: 'G-A-01-1-02 — suite BUF-10001' })
  expect(occupied).toHaveAttribute('href', '/admin/packages/pkg-1')
})

it('groups cells under aisle and rack headings', async () => {
  renderPage()

  expect(await screen.findByText('Aisle G-A')).toBeInTheDocument()
  expect(screen.getByText('Rack 01')).toBeInTheDocument()
})

it('shows the grid generator for admins', async () => {
  renderPage()

  expect(await screen.findByText('Generate grid')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate positions/i })).toBeInTheDocument()
})

it('hides the generator and the toggle controls for ops', async () => {
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  renderPage()

  // mapa carrega, mas sem controles de admin: célula livre não é botão
  expect(await screen.findByRole('link', { name: 'G-A-01-1-02 — suite BUF-10001' })).toBeInTheDocument()
  expect(screen.queryByText('Generate grid')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'G-A-01-1-01 — free' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'G-A-01-2-01 — inactive' })).not.toBeInTheDocument()
})

it('shows the admin empty state pointing to the generator when there are no positions', async () => {
  mocked.getOccupancy.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText(/generate the grid above/i)).toBeInTheDocument()
})

it('shows a neutral empty state for ops', async () => {
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  mocked.getOccupancy.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText('No positions registered yet.')).toBeInTheDocument()
})

it('generates the grid with normalized args and reloads the map', async () => {
  mocked.generateGrid.mockResolvedValue(24)
  renderPage()

  await screen.findByText('Generate grid')

  const aisles = screen.getByLabelText(/aisles/i)
  await userEvent.clear(aisles)
  await userEvent.type(aisles, ' a , b ')

  const racks = screen.getByLabelText(/racks/i)
  await userEvent.clear(racks)
  await userEvent.type(racks, '2')

  const levels = screen.getByLabelText(/levels/i)
  await userEvent.clear(levels)
  await userEvent.type(levels, '3')

  const bins = screen.getByLabelText(/bins/i)
  await userEvent.clear(bins)
  await userEvent.type(bins, '4')

  await userEvent.click(screen.getByRole('button', { name: /generate positions/i }))

  expect(mocked.generateGrid).toHaveBeenCalledWith('G', ['A', 'B'], 2, 3, 4)
  expect(await screen.findByText('24 positions created.')).toBeInTheDocument()
  // 1ª chamada no mount + 1 no reload pós-geração
  expect(mocked.getOccupancy).toHaveBeenCalledTimes(2)
})

it('validates the generator fields before calling the service', async () => {
  renderPage()

  await screen.findByText('Generate grid')

  const aisles = screen.getByLabelText(/aisles/i)
  await userEvent.clear(aisles)
  const racks = screen.getByLabelText(/racks/i)
  await userEvent.clear(racks)
  await userEvent.type(racks, '100')

  await userEvent.click(screen.getByRole('button', { name: /generate positions/i }))

  expect(await screen.findByText(/at least one aisle/i)).toBeInTheDocument()
  expect(screen.getByText(/between 1 and 99/i)).toBeInTheDocument()
  expect(mocked.generateGrid).not.toHaveBeenCalled()
})

it('shows a handled error when the grid generation fails (e.g. non-admin)', async () => {
  mocked.generateGrid.mockRejectedValue(new Error('Only admins can generate warehouse locations'))
  renderPage()

  await screen.findByText('Generate grid')
  await userEvent.click(screen.getByRole('button', { name: /generate positions/i }))

  expect(await screen.findByText(/couldn't generate the grid/i)).toBeInTheDocument()
})

it('deactivates a free position from the cell panel and reloads the map', async () => {
  mocked.setLocationActive.mockResolvedValue()
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'G-A-01-1-01 — free' }))

  const panel = screen.getByText('G-A-01-1-01').closest('div')!
  await userEvent.click(within(panel).getByRole('button', { name: /deactivate/i }))

  expect(mocked.setLocationActive).toHaveBeenCalledWith('loc-1', false)
  expect(mocked.getOccupancy).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/position updated/i)).toBeInTheDocument()
})

it('reactivates an inactive position', async () => {
  mocked.setLocationActive.mockResolvedValue()
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'G-A-01-2-01 — inactive' }))
  await userEvent.click(screen.getByRole('button', { name: /reactivate/i }))

  expect(mocked.setLocationActive).toHaveBeenCalledWith('loc-3', true)
  expect(await screen.findByText(/position updated/i)).toBeInTheDocument()
})

it('shows an error message when toggling a position fails', async () => {
  mocked.setLocationActive.mockRejectedValue(new Error('boom'))
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'G-A-01-1-01 — free' }))
  await userEvent.click(screen.getByRole('button', { name: /deactivate/i }))

  expect(await screen.findByText(/couldn't update this position/i)).toBeInTheDocument()
})
