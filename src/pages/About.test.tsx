import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import About from './About'

it('renders the About H1', () => {
  render(<MemoryRouter><About /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})

it('shows the build-time product version, commit and build date', () => {
  render(<MemoryRouter><About /></MemoryRouter>)
  // Globals injetados pelo `define` do vite.config.ts (compartilhado com o Vitest)
  expect(__APP_VERSION__).toMatch(/^(1\.0\.\d+|dev)$/)
  expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument()
  expect(screen.getByText(__APP_COMMIT__)).toBeInTheDocument()
  expect(screen.getByText(__APP_BUILD_DATE__)).toBeInTheDocument()
})

it('credits the developer and shows the copyright', () => {
  render(<MemoryRouter><About /></MemoryRouter>)
  expect(screen.getByText('Celso Bufano')).toBeInTheDocument()
  expect(
    screen.getByText(new RegExp(`© ${new Date().getFullYear()} Bufano Redirect`)),
  ).toBeInTheDocument()
})
