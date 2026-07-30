import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Inbox from './Inbox'
import { packageService } from '../../services/packageService'

vi.mock('../../services/packageService', () => ({
  packageService: {
    getMyReceivedPackages: vi.fn(),
  },
}))
const mocked = vi.mocked(packageService)

beforeEach(() => vi.clearAllMocks())

function renderPage() {
  render(
    <MemoryRouter>
      <Inbox />
    </MemoryRouter>,
  )
}

it('shows a loading state while packages are being fetched', () => {
  mocked.getMyReceivedPackages.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('lists packages and only allows selecting ones that are ready', async () => {
  mocked.getMyReceivedPackages.mockResolvedValue([
    {
      id: 'r1',
      store: 'Amazon',
      description: 'Headphones',
      weightKg: 0.6,
      status: 'ready',
      receivedAt: '2026-07-14T00:00:00Z',
    },
    {
      id: 'r2',
      store: 'Nike',
      description: 'Running shoes',
      weightKg: 0.9,
      status: 'in_review',
      receivedAt: '2026-07-18T00:00:00Z',
    },
  ])
  renderPage()

  expect(await screen.findByText(/Amazon/i)).toBeInTheDocument()
  const consolidateBtn = screen.getByRole('button', { name: /consolidate/i })
  expect(consolidateBtn).toBeDisabled()

  const checkboxes = screen.getAllByRole('checkbox')
  expect(checkboxes).toHaveLength(2)
  expect(checkboxes[1]).toBeDisabled() // in_review, not selectable

  await userEvent.click(checkboxes[0]) // ready
  expect(screen.getByRole('button', { name: /consolidate/i })).toBeEnabled()
})

it('shows an alert when loading packages fails', async () => {
  mocked.getMyReceivedPackages.mockRejectedValue(new Error('boom'))
  renderPage()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
