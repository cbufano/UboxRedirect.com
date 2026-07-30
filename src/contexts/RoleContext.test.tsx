import { render, screen } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import { RoleProvider, useRole } from './RoleContext'
import { roleService } from '../services/roleService'
import { useAuth } from './AuthContext'

vi.mock('../services/roleService', () => ({
  roleService: { getMyRoles: vi.fn() },
}))
vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

const mockedRoleService = vi.mocked(roleService)
const mockedUseAuth = vi.mocked(useAuth)

function Probe() {
  const { roles, loading } = useRole()
  if (loading) return <p>probe:loading</p>
  return <p>probe:{roles.length > 0 ? roles.join(',') : 'none'}</p>
}

beforeEach(() => vi.clearAllMocks())

it('starts loading, then exposes the roles', async () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedRoleService.getMyRoles.mockResolvedValue(['ops'])

  render(
    <RoleProvider>
      <Probe />
    </RoleProvider>,
  )
  expect(screen.getByText('probe:loading')).toBeInTheDocument()
  expect(await screen.findByText('probe:ops')).toBeInTheDocument()
})

it('exposes an empty roles list when signed out', async () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: false })
  mockedRoleService.getMyRoles.mockResolvedValue([])

  render(
    <RoleProvider>
      <Probe />
    </RoleProvider>,
  )
  expect(await screen.findByText('probe:none')).toBeInTheDocument()
})

it('re-fetches roles when the signed-in user changes', async () => {
  mockedRoleService.getMyRoles.mockResolvedValueOnce(['ops']).mockResolvedValueOnce(['admin'])
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })

  const { rerender } = render(
    <RoleProvider>
      <Probe />
    </RoleProvider>,
  )
  expect(await screen.findByText('probe:ops')).toBeInTheDocument()

  mockedUseAuth.mockReturnValue({
    user: { id: '2', name: 'Bia', email: 'b@b.c', country: 'PT' },
    loading: false,
  })
  rerender(
    <RoleProvider>
      <Probe />
    </RoleProvider>,
  )

  expect(await screen.findByText('probe:admin')).toBeInTheDocument()
  expect(mockedRoleService.getMyRoles).toHaveBeenCalledTimes(2)
})
