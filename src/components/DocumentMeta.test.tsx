import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { DocumentMeta } from './DocumentMeta'

it('sets the document title based on the route', async () => {
  render(<MemoryRouter initialEntries={['/pricing']}><DocumentMeta /></MemoryRouter>)
  await waitFor(() => expect(document.title).toMatch(/bufano/i))
})
