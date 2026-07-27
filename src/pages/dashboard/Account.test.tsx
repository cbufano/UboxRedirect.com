import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Account from './Account'

it('prefills the profile and confirms on save', async () => {
  vi.spyOn(authService, 'getSession').mockReturnValue({ id: 'ana@x.com', name: 'Ana', email: 'ana@x.com', country: 'BR' })
  render(<MemoryRouter><Account /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // name prefilled
  expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Ana')
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})
