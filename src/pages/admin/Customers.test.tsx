import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Customers from './Customers'
import { peopleAdminService, type CustomerSearchResult } from '../../services/peopleAdminService'

vi.mock('../../services/peopleAdminService', () => ({
  peopleAdminService: {
    searchCustomers: vi.fn(),
  },
}))

const mocked = vi.mocked(peopleAdminService)

const ana: CustomerSearchResult = {
  userId: 'cust-1',
  name: 'Ana Silva',
  email: 'ana@email.com',
  country: 'Brazil',
  suiteNumber: 'BUF-10001',
  suspendedAt: null,
  kycStatus: 'not_started',
  ofacStatus: 'not_started',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Customers />
    </MemoryRouter>,
  )
}

async function search(query: string) {
  await userEvent.type(screen.getByLabelText(/name, email or suite/i), query)
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('shows a search hint before any search is made', () => {
  renderPage()
  expect(screen.getByText(/search by name, email or suite number/i)).toBeInTheDocument()
  expect(mocked.searchCustomers).not.toHaveBeenCalled()
})

it('does not search when the query is empty', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
  expect(mocked.searchCustomers).not.toHaveBeenCalled()
})

it('searches on submit and lists results linking to the customer profile', async () => {
  mocked.searchCustomers.mockResolvedValue([ana])
  renderPage()

  await search('ana')

  expect(mocked.searchCustomers).toHaveBeenCalledWith('ana')
  const link = await screen.findByRole('link', { name: 'Ana Silva' })
  expect(link).toHaveAttribute('href', '/admin/customers/cust-1')
  expect(screen.getByText('ana@email.com')).toBeInTheDocument()
  expect(screen.getByText('BUF-10001')).toBeInTheDocument()
  expect(screen.getByText('Brazil')).toBeInTheDocument()
  // status default (not_started) não gera badge
  expect(screen.queryByText(/KYC:/)).not.toBeInTheDocument()
  expect(screen.queryByText(/OFAC:/)).not.toBeInTheDocument()
  expect(screen.queryByText(/suspended/i)).not.toBeInTheDocument()
})

it('searches when pressing Enter in the query field', async () => {
  mocked.searchCustomers.mockResolvedValue([ana])
  renderPage()

  await userEvent.type(screen.getByLabelText(/name, email or suite/i), 'BUF-10001{Enter}')

  expect(mocked.searchCustomers).toHaveBeenCalledWith('BUF-10001')
  expect(await screen.findByRole('link', { name: 'Ana Silva' })).toBeInTheDocument()
})

it('shows suspended and compliance badges when out of the default state', async () => {
  mocked.searchCustomers.mockResolvedValue([
    { ...ana, suspendedAt: '2026-07-01T00:00:00Z', kycStatus: 'rejected', ofacStatus: 'flagged' },
  ])
  renderPage()

  await search('ana')

  expect(await screen.findByText('Suspended')).toBeInTheDocument()
  expect(screen.getByText('KYC: Rejected')).toBeInTheDocument()
  expect(screen.getByText('OFAC: Flagged')).toBeInTheDocument()
})

it('shows an empty state when no customers match', async () => {
  mocked.searchCustomers.mockResolvedValue([])
  renderPage()

  await search('nobody')

  expect(await screen.findByText(/no customers found/i)).toBeInTheDocument()
})

it('shows an error message when the search fails', async () => {
  mocked.searchCustomers.mockRejectedValue(new Error('boom'))
  renderPage()

  await search('ana')

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't run the search/i)
})
