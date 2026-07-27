import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import Inbox from './Inbox'

it('lists packages and enables consolidate only after selecting', async () => {
  render(<MemoryRouter><Inbox /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  // at least one store name appears
  expect(screen.getByText(/Amazon/i)).toBeInTheDocument()
  const consolidateBtn = screen.getByRole('button', { name: /consolidate/i })
  expect(consolidateBtn).toBeDisabled()
  // select the first package checkbox
  const checkboxes = screen.getAllByRole('checkbox')
  await userEvent.click(checkboxes[0])
  expect(screen.getByRole('button', { name: /consolidate/i })).toBeEnabled()
})
