import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Staff from './Staff'
import { peopleAdminService, type UserWithRoles, type AuditLogEntry } from '../../services/peopleAdminService'
import { useRole } from '../../contexts/RoleContext'

vi.mock('../../services/peopleAdminService', () => ({
  peopleAdminService: {
    listUsersWithRoles: vi.fn(),
    setUserRole: vi.fn(),
    getAuditLog: vi.fn(),
  },
}))
vi.mock('../../contexts/RoleContext', () => ({ useRole: vi.fn() }))

const mocked = vi.mocked(peopleAdminService)
const mockedUseRole = vi.mocked(useRole)

const ana: UserWithRoles = {
  userId: 'user-1',
  name: 'Ana Silva',
  email: 'ana@email.com',
  roles: ['customer'],
}

const bruno: UserWithRoles = {
  userId: 'user-2',
  name: 'Bruno Costa',
  email: 'bruno@email.com',
  roles: ['customer', 'ops'],
}

const carla: UserWithRoles = {
  userId: 'user-3',
  name: 'Carla Dias',
  email: 'carla@email.com',
  roles: ['customer', 'admin'],
}

const auditEntry: AuditLogEntry = {
  id: 'audit-1',
  actorName: 'Root Admin',
  action: 'role.changed',
  entity: 'user',
  entityId: 'user-2',
  detail: { new_role: 'ops' },
  createdAt: '2026-07-28T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRole.mockReturnValue({ roles: ['admin'], loading: false })
  mocked.listUsersWithRoles.mockResolvedValue([ana, bruno, carla])
  mocked.getAuditLog.mockResolvedValue([auditEntry])
})

it('shows an admins-only notice (and loads nothing) for non-admin staff', () => {
  mockedUseRole.mockReturnValue({ roles: ['ops'], loading: false })
  render(<Staff />)

  expect(screen.getByText(/only administrators/i)).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(mocked.listUsersWithRoles).not.toHaveBeenCalled()
  expect(mocked.getAuditLog).not.toHaveBeenCalled()
})

/**
 * Badge é o <span> colorido — o texto do papel também aparece como <option>
 * do select da linha, por isso as asserções filtram por tag dentro da linha.
 */
function badgeIn(row: HTMLElement, label: string): HTMLElement | undefined {
  return within(row).getAllByText(label).find((element) => element.tagName === 'SPAN')
}

it('renders users with their role badges', async () => {
  render(<Staff />)

  expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
  expect(screen.getByText('bruno@email.com')).toBeInTheDocument()

  const anaRow = screen.getByText('Ana Silva').closest('tr') as HTMLElement
  const brunoRow = screen.getByText('Bruno Costa').closest('tr') as HTMLElement
  const carlaRow = screen.getByText('Carla Dias').closest('tr') as HTMLElement
  expect(badgeIn(anaRow, 'Customer')).toBeTruthy()
  // Bruno: badge base "Customer" + badge staff "Ops"
  expect(badgeIn(brunoRow, 'Customer')).toBeTruthy()
  expect(badgeIn(brunoRow, 'Ops')).toBeTruthy()
  expect(badgeIn(carlaRow, 'Admin')).toBeTruthy()
})

it('filters users client-side by name or email', async () => {
  render(<Staff />)
  await screen.findByText('Ana Silva')

  await userEvent.type(screen.getByLabelText(/filter by name or email/i), 'bruno@')

  expect(screen.getByText('Bruno Costa')).toBeInTheDocument()
  expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument()
})

it('applies a non-admin role change without confirmation and reloads the list', async () => {
  mocked.setUserRole.mockResolvedValue()
  render(<Staff />)
  await screen.findByText('Ana Silva')

  await userEvent.selectOptions(screen.getByLabelText('New role for Ana Silva'), 'ops')
  const applyButtons = screen.getAllByRole('button', { name: /^apply$/i })
  await userEvent.click(applyButtons[0])

  expect(mocked.setUserRole).toHaveBeenCalledWith('user-1', 'ops')
  // recarrega a lista depois de aplicar (1 chamada do boot + 1 do reload)
  expect(mocked.listUsersWithRoles).toHaveBeenCalledTimes(2)
  expect(await screen.findByText(/role updated/i)).toBeInTheDocument()
})

it('requires an inline confirmation when the change involves an admin role', async () => {
  mocked.setUserRole.mockResolvedValue()
  render(<Staff />)
  await screen.findByText('Ana Silva')

  await userEvent.selectOptions(screen.getByLabelText('New role for Ana Silva'), 'admin')
  await userEvent.click(screen.getAllByRole('button', { name: /^apply$/i })[0])

  // Nada aplicado ainda — só a confirmação inline.
  expect(mocked.setUserRole).not.toHaveBeenCalled()
  expect(screen.getByText(/involves an admin role/i)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
  expect(mocked.setUserRole).toHaveBeenCalledWith('user-1', 'admin')
})

it('also confirms when the CURRENT role is admin, and cancel aborts', async () => {
  render(<Staff />)
  await screen.findByText('Carla Dias')

  // Carla é admin — rebaixar para customer também exige confirmação.
  await userEvent.selectOptions(screen.getByLabelText('New role for Carla Dias'), 'customer')
  await userEvent.click(screen.getAllByRole('button', { name: /^apply$/i })[2])
  expect(screen.getByText(/involves an admin role/i)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
  expect(screen.queryByText(/involves an admin role/i)).not.toBeInTheDocument()
  expect(mocked.setUserRole).not.toHaveBeenCalled()
})

it('shows the RPC error message verbatim when the role change fails', async () => {
  mocked.setUserRole.mockRejectedValue(new Error('You cannot change your own role'))
  render(<Staff />)
  await screen.findByText('Ana Silva')

  await userEvent.selectOptions(screen.getByLabelText('New role for Ana Silva'), 'ops')
  await userEvent.click(screen.getAllByRole('button', { name: /^apply$/i })[0])

  expect(await screen.findByRole('alert')).toHaveTextContent('You cannot change your own role')
})

it('renders the audit log with actor, action, entity and detail summary', async () => {
  render(<Staff />)

  expect(await screen.findByText('Root Admin')).toBeInTheDocument()
  expect(screen.getByText('role.changed')).toBeInTheDocument()
  expect(screen.getByText('user')).toBeInTheDocument()
  expect(screen.getByText('{"new_role":"ops"}')).toBeInTheDocument()
})

it('shows an empty state when there are no audit events', async () => {
  mocked.getAuditLog.mockResolvedValue([])
  render(<Staff />)

  expect(await screen.findByText(/no audit events yet/i)).toBeInTheDocument()
})

it('shows the standard error state when loading the users fails', async () => {
  mocked.listUsersWithRoles.mockRejectedValue(new Error('boom'))
  render(<Staff />)

  expect(await screen.findByText(/couldn't load the users/i)).toBeInTheDocument()
})
