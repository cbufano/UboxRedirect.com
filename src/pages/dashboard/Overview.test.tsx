import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Overview from './Overview'
import { profileService } from '../../services/profileService'
import { useAuth } from '../../contexts/AuthContext'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedProfile = vi.mocked(profileService)
const mockedUseAuth = vi.mocked(useAuth)

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
  })
})

it('greets the user and shows the real suite', async () => {
  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  )
  expect(screen.getByText(/Ana/)).toBeInTheDocument()
  expect(await screen.findByText(/BUF-10482/)).toBeInTheDocument()
})
