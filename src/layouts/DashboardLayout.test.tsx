import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { DashboardLayout } from './DashboardLayout'
import { authService } from '../services/authService'
import { profileService, type Profile } from '../services/profileService'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../services/authService', () => ({
  authService: { logout: vi.fn() },
}))
vi.mock('../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedAuth = vi.mocked(authService)
const mockedProfile = vi.mocked(profileService)
const mockedUseAuth = vi.mocked(useAuth)

const activeProfile: Profile = {
  id: '1',
  name: 'Ana',
  email: 'a@b.c',
  country: 'BR',
  preferredLanguage: 'pt',
  suiteNumber: 'BUF-10001',
  suspendedAt: null,
}

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<div>Overview content</div>} />
        </Route>
        <Route path="/" element={<div>Public home</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedProfile.getMyProfile.mockResolvedValue(activeProfile)
})

it('shows the signed-in user name', () => {
  renderLayout()
  expect(screen.getByText('Ana')).toBeInTheDocument()
})

it('signs out and navigates home', async () => {
  mockedAuth.logout.mockResolvedValue()
  renderLayout()
  await userEvent.click(screen.getByRole('button', { name: /sign out|log out/i }))
  expect(mockedAuth.logout).toHaveBeenCalled()
  expect(await screen.findByText('Public home')).toBeInTheDocument()
})

it('keeps rendering the dashboard for a non-suspended profile', async () => {
  renderLayout()
  expect(await screen.findByText('Overview content')).toBeInTheDocument()
  expect(mockedProfile.getMyProfile).toHaveBeenCalled()
  expect(screen.queryByText(/account suspended/i)).not.toBeInTheDocument()
})

it('blocks the dashboard with a suspension screen when the profile is suspended', async () => {
  mockedProfile.getMyProfile.mockResolvedValue({ ...activeProfile, suspendedAt: '2026-07-20T00:00:00Z' })
  renderLayout()

  expect(await screen.findByText(/account suspended/i)).toBeInTheDocument()
  // Nada do painel visível: nem o conteúdo da rota, nem a navegação.
  expect(screen.queryByText('Overview content')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /overview/i })).not.toBeInTheDocument()
})

it('signs out from the suspension screen and goes to /login', async () => {
  mockedProfile.getMyProfile.mockResolvedValue({ ...activeProfile, suspendedAt: '2026-07-20T00:00:00Z' })
  mockedAuth.logout.mockResolvedValue()
  renderLayout()

  await screen.findByText(/account suspended/i)
  await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

  expect(mockedAuth.logout).toHaveBeenCalled()
  expect(await screen.findByText('Login page')).toBeInTheDocument()
})

it('does not block the dashboard when the profile lookup fails (fail open)', async () => {
  mockedProfile.getMyProfile.mockRejectedValue(new Error('network down'))
  renderLayout()

  expect(await screen.findByText('Overview content')).toBeInTheDocument()
  expect(screen.queryByText(/account suspended/i)).not.toBeInTheDocument()
})
