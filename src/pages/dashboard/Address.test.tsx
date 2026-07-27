import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import '../../i18n'
import Address from './Address'

it('copies the address to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<MemoryRouter><Address /></MemoryRouter>)
  await userEvent.click(screen.getAllByRole('button', { name: /copy/i })[0])
  expect(writeText).toHaveBeenCalled()
})
