import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

it('changes language when a new option is chosen', async () => {
  render(<LanguageSwitcher />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'pt')
  expect(i18n.language).toBe('pt')
})
