import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import '../../i18n'
import Verify from './Verify'

it('tells the user to check their email and links back to login', () => {
  render(
    <MemoryRouter>
      <Verify />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
})
