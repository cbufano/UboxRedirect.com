import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Address from './Address'
import { profileService } from '../../services/profileService'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
const mocked = vi.mocked(profileService)

beforeEach(() => vi.clearAllMocks())

it('shows the warehouse address with the real suite from the profile', async () => {
  mocked.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'a@b.c',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })
  render(
    <MemoryRouter>
      <Address />
    </MemoryRouter>,
  )
  expect(await screen.findByText('BUF-10482')).toBeInTheDocument()
  expect(screen.getAllByText(/8390 NW 25th St/).length).toBeGreaterThan(0)
})

it('shows a loading state while the profile resolves', () => {
  mocked.getMyProfile.mockReturnValue(new Promise(() => {}))
  render(
    <MemoryRouter>
      <Address />
    </MemoryRouter>,
  )
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('shows an error state when the profile fails to load', async () => {
  mocked.getMyProfile.mockRejectedValue(new Error('network error'))
  render(
    <MemoryRouter>
      <Address />
    </MemoryRouter>,
  )
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
