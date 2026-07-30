import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Overview from './Overview'
import { profileService } from '../../services/profileService'
import { packageService, type ReceivedPackage, type Consolidation } from '../../services/packageService'
import { useAuth } from '../../contexts/AuthContext'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
vi.mock('../../services/packageService', () => ({
  packageService: { getMyReceivedPackages: vi.fn(), getMyConsolidations: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedProfile = vi.mocked(profileService)
const mockedPackageService = vi.mocked(packageService)
const mockedUseAuth = vi.mocked(useAuth)

const receivedPackage: ReceivedPackage = {
  id: 'p1',
  store: 'Amazon',
  description: 'Headphones',
  weightKg: 1.2,
  status: 'ready',
  receivedAt: '2026-07-20T00:00:00Z',
}

const consolidation: Consolidation = {
  id: 'c1',
  status: 'shipped',
  recipientName: 'Ana',
  city: 'Springfield',
  country: 'US',
  carrier: 'Economy',
  trackingCode: 'TRACK1',
  costUsd: 40,
  createdAt: '2026-07-10T00:00:00Z',
  paidAt: '2026-07-11T00:00:00Z',
  shippedAt: '2026-07-15T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedProfile.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'a@b.c',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
    suspendedAt: null,
  })
  mockedPackageService.getMyReceivedPackages.mockResolvedValue([])
  mockedPackageService.getMyConsolidations.mockResolvedValue([])
})

it('shows a loading state before dashboard data arrives', () => {
  mockedProfile.getMyProfile.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an error alert when loading fails', async () => {
  mockedPackageService.getMyConsolidations.mockRejectedValue(new Error('boom'))
  renderPage()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('greets the user and shows the real suite', async () => {
  renderPage()
  expect(await screen.findByText(/Ana/)).toBeInTheDocument()
  expect(await screen.findByText(/BUF-10482/)).toBeInTheDocument()
})

it('computes stat tiles from real packages and consolidations', async () => {
  mockedPackageService.getMyReceivedPackages.mockResolvedValue([
    receivedPackage,
    { ...receivedPackage, id: 'p2', status: 'in_review' },
  ])
  mockedPackageService.getMyConsolidations.mockResolvedValue([
    consolidation,
    { ...consolidation, id: 'c2', status: 'delivered' },
  ])
  renderPage()

  // inBox: only the in_review package counts (the other is already 'ready').
  // inTransit: the shipped consolidation. delivered: the delivered one.
  const tiles = await screen.findAllByText(/^[0-9]+$/)
  const values = tiles.map((el) => el.textContent)
  expect(values).toEqual(['1', '1', '1'])
})

it('shows recent packages with their real status label', async () => {
  mockedPackageService.getMyReceivedPackages.mockResolvedValue([receivedPackage])
  renderPage()

  expect(await screen.findByText('Amazon')).toBeInTheDocument()
  expect(screen.getByText('Ready to ship')).toBeInTheDocument()
})

it('shows the empty activity state when there are no packages', async () => {
  renderPage()
  expect(await screen.findByText(/no packages yet/i)).toBeInTheDocument()
})
