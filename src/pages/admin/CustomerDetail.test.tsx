import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '../../i18n'
import CustomerDetail from './CustomerDetail'
import { adminService } from '../../services/adminService'
import { peopleAdminService, type CustomerProfileDetail } from '../../services/peopleAdminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    setKycStatus: vi.fn(),
    setOfacStatus: vi.fn(),
  },
}))
vi.mock('../../services/peopleAdminService', () => ({
  peopleAdminService: {
    getCustomerProfile: vi.fn(),
    addCustomerNote: vi.fn(),
    setSuspended: vi.fn(),
  },
}))

const mockedAdmin = vi.mocked(adminService)
const mockedPeople = vi.mocked(peopleAdminService)

const baseDetail: CustomerProfileDetail = {
  userId: 'cust-1',
  name: 'Ana Silva',
  email: 'ana@email.com',
  country: 'Brazil',
  suiteNumber: 'BUF-10001',
  suspendedAt: null,
  kycStatus: 'pending',
  ofacStatus: 'clear',
  packages: [{ id: 'pkg-1', store: 'Amazon', status: 'ready' }],
  consolidations: [{ id: 'con-1', status: 'paid', city: 'São Paulo', country: 'Brazil' }],
  payments: [{ id: 'pay-1', amountUsd: 120.5, provider: 'stripe', status: 'succeeded' }],
  dataRequests: [{ id: 'dr-1', kind: 'export', status: 'pending' }],
  notes: [{ id: 'note-1', note: 'Prefers pickup in Miami.', authorName: 'Op Staff', createdAt: '2026-07-01T00:00:00Z' }],
}

function renderPage(id = 'cust-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/customers/${id}`]}>
      <Routes>
        <Route path="/admin/customers/:id" element={<CustomerDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPeople.getCustomerProfile.mockResolvedValue(baseDetail)
})

it('shows a loading state while the profile is being fetched', () => {
  mockedPeople.getCustomerProfile.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

it('shows an alert when the customer cannot be loaded (not found included)', async () => {
  mockedPeople.getCustomerProfile.mockRejectedValue(new Error('not found'))
  renderPage('missing-id')
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load this customer/i)
})

it('renders header, compliance controls, notes and activity summaries', async () => {
  renderPage()

  expect(await screen.findByRole('heading', { name: 'Ana Silva' })).toBeInTheDocument()
  expect(mockedPeople.getCustomerProfile).toHaveBeenCalledWith('cust-1')
  expect(screen.getByText(/ana@email\.com · BUF-10001 · Brazil/)).toBeInTheDocument()
  // conta ativa: sem badge de suspensão, botão oferece suspender
  expect(screen.queryByText('Suspended')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /suspend account/i })).toBeInTheDocument()

  expect(screen.getByLabelText(/kyc status/i)).toHaveValue('pending')
  expect(screen.getByLabelText(/ofac screening/i)).toHaveValue('clear')

  // notas internas com autor e aviso de visibilidade
  expect(screen.getByText('Prefers pickup in Miami.')).toBeInTheDocument()
  expect(screen.getByText(/Op Staff/)).toBeInTheDocument()
  expect(screen.getByText(/the customer never sees these notes/i)).toBeInTheDocument()

  // resumos: pacote vivo linka para a ficha; consolidação/pagamento/LGPD
  const packageLink = screen.getByRole('link', { name: 'Amazon' })
  expect(packageLink).toHaveAttribute('href', '/admin/packages/pkg-1')
  expect(screen.getByText('Ready to ship')).toBeInTheDocument()
  expect(screen.getByText('São Paulo, Brazil')).toBeInTheDocument()
  expect(screen.getByText('Paid')).toBeInTheDocument()
  expect(screen.getByText('$120.50')).toBeInTheDocument()
  expect(screen.getByText('Stripe')).toBeInTheDocument()
  expect(screen.getByText('Succeeded')).toBeInTheDocument()
  expect(screen.getByText('Export')).toBeInTheDocument()
})

it('shows the suspended badge and the reactivate action for a suspended account', async () => {
  mockedPeople.getCustomerProfile.mockResolvedValue({ ...baseDetail, suspendedAt: '2026-07-10T00:00:00Z' })
  renderPage()

  expect(await screen.findByText('Suspended')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reactivate account/i })).toBeInTheDocument()
})

it('shows empty states for notes and every activity summary', async () => {
  mockedPeople.getCustomerProfile.mockResolvedValue({
    ...baseDetail,
    packages: [],
    consolidations: [],
    payments: [],
    dataRequests: [],
    notes: [],
  })
  renderPage()

  expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument()
  expect(screen.getByText(/no live packages/i)).toBeInTheDocument()
  expect(screen.getByText(/no consolidations yet/i)).toBeInTheDocument()
  expect(screen.getByText(/no payments yet/i)).toBeInTheDocument()
  expect(screen.getByText(/no privacy requests/i)).toBeInTheDocument()
})

it('saves a new KYC status and reloads the profile', async () => {
  mockedAdmin.setKycStatus.mockResolvedValue()
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.selectOptions(screen.getByLabelText(/kyc status/i), 'verified')

  expect(mockedAdmin.setKycStatus).toHaveBeenCalledWith('cust-1', 'verified')
  // recarrega depois de salvar (1ª chamada no mount + 1 no refresh)
  expect(mockedPeople.getCustomerProfile).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/compliance status updated/i)).toBeInTheDocument()
})

it('saves a new OFAC status and reloads the profile', async () => {
  mockedAdmin.setOfacStatus.mockResolvedValue()
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.selectOptions(screen.getByLabelText(/ofac screening/i), 'flagged')

  expect(mockedAdmin.setOfacStatus).toHaveBeenCalledWith('cust-1', 'flagged')
  expect(mockedPeople.getCustomerProfile).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/compliance status updated/i)).toBeInTheDocument()
})

it('shows an alert when updating compliance status fails', async () => {
  mockedAdmin.setKycStatus.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.selectOptions(screen.getByLabelText(/kyc status/i), 'rejected')

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update the compliance status/i)
})

it('suspends the account only after the inline confirmation', async () => {
  mockedPeople.setSuspended.mockResolvedValue()
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.click(screen.getByRole('button', { name: /suspend account/i }))

  // confirmação inline aparece e nada foi salvo ainda
  expect(screen.getByText(/suspend this account\?/i)).toBeInTheDocument()
  expect(mockedPeople.setSuspended).not.toHaveBeenCalled()

  mockedPeople.getCustomerProfile.mockResolvedValue({ ...baseDetail, suspendedAt: '2026-07-30T00:00:00Z' })
  await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

  expect(mockedPeople.setSuspended).toHaveBeenCalledWith('cust-1', true)
  expect(mockedPeople.getCustomerProfile).toHaveBeenCalledTimes(2)
  expect(await screen.findByText('Suspended')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reactivate account/i })).toBeInTheDocument()
})

it('cancelling the confirmation does not suspend the account', async () => {
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.click(screen.getByRole('button', { name: /suspend account/i }))
  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

  expect(mockedPeople.setSuspended).not.toHaveBeenCalled()
  expect(screen.queryByText(/suspend this account\?/i)).not.toBeInTheDocument()
})

it('reactivates a suspended account after confirmation', async () => {
  mockedPeople.getCustomerProfile.mockResolvedValue({ ...baseDetail, suspendedAt: '2026-07-10T00:00:00Z' })
  mockedPeople.setSuspended.mockResolvedValue()
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.click(screen.getByRole('button', { name: /reactivate account/i }))
  await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

  expect(mockedPeople.setSuspended).toHaveBeenCalledWith('cust-1', false)
})

it('shows an alert when the suspension update fails', async () => {
  mockedPeople.setSuspended.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.click(screen.getByRole('button', { name: /suspend account/i }))
  await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update this account/i)
})

it('adds an internal note, reloads and clears the textarea', async () => {
  mockedPeople.addCustomerNote.mockResolvedValue()
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  const textarea = screen.getByLabelText(/add a note/i)
  await userEvent.type(textarea, 'Called about a lost tracking code.')
  await userEvent.click(screen.getByRole('button', { name: /^add note$/i }))

  expect(mockedPeople.addCustomerNote).toHaveBeenCalledWith('cust-1', 'Called about a lost tracking code.')
  expect(mockedPeople.getCustomerProfile).toHaveBeenCalledTimes(2)
  expect(textarea).toHaveValue('')
})

it('shows an alert when saving the note fails', async () => {
  mockedPeople.addCustomerNote.mockRejectedValue(new Error('boom'))
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  await userEvent.type(screen.getByLabelText(/add a note/i), 'Some note')
  await userEvent.click(screen.getByRole('button', { name: /^add note$/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save this note/i)
})

it('renders every live package as a link to its detail page', async () => {
  mockedPeople.getCustomerProfile.mockResolvedValue({
    ...baseDetail,
    packages: [
      { id: 'pkg-1', store: 'Amazon', status: 'ready' },
      { id: 'pkg-2', store: 'Nike', status: 'in_review' },
    ],
  })
  renderPage()

  await screen.findByRole('heading', { name: 'Ana Silva' })
  expect(screen.getByRole('link', { name: 'Amazon' })).toHaveAttribute('href', '/admin/packages/pkg-1')
  const nikeLink = screen.getByRole('link', { name: 'Nike' })
  expect(nikeLink).toHaveAttribute('href', '/admin/packages/pkg-2')
  expect(within(nikeLink.closest('li')!).getByText('In review')).toBeInTheDocument()
})
