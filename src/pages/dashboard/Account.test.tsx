import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Account from './Account'
import { profileService } from '../../services/profileService'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn(), updateMyProfile: vi.fn() },
}))
const mocked = vi.mocked(profileService)

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'ana@example.com',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })
})

function renderAccount() {
  render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>,
  )
}

it('loads the profile into the form with email locked', async () => {
  renderAccount()
  expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument()
  const email = screen.getByLabelText(/^email$/i)
  expect(email).toHaveValue('ana@example.com')
  expect(email).toBeDisabled()
})

it('saves name and country through profileService', async () => {
  mocked.updateMyProfile.mockResolvedValue()
  renderAccount()
  const name = await screen.findByDisplayValue('Ana')
  await userEvent.clear(name)
  await userEvent.type(name, 'Ana Maria')
  await userEvent.click(screen.getByRole('button', { name: /save|update/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.updateMyProfile).toHaveBeenCalledWith({ name: 'Ana Maria', country: 'BR' })
})

it('shows an error when saving fails', async () => {
  mocked.updateMyProfile.mockRejectedValue(new Error('boom'))
  renderAccount()
  await screen.findByDisplayValue('Ana')
  await userEvent.click(screen.getByRole('button', { name: /save|update/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('shows an error when the profile fails to load', async () => {
  mocked.getMyProfile.mockRejectedValue(new Error('network error'))
  renderAccount()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('does not overwrite in-progress edits if the profile resolves after typing starts', async () => {
  let resolveProfile: (value: Awaited<ReturnType<typeof profileService.getMyProfile>>) => void = () => {}
  mocked.getMyProfile.mockReturnValue(
    new Promise((resolve) => {
      resolveProfile = resolve
    }),
  )
  renderAccount()
  const name = screen.getByLabelText(/^name$/i)
  await userEvent.type(name, 'Someone Else')

  resolveProfile({
    id: '1',
    name: 'Ana',
    email: 'ana@example.com',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })

  await new Promise((r) => setTimeout(r, 0))
  expect(name).toHaveValue('Someone Else')
})
