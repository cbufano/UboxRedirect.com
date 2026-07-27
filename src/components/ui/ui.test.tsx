import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { Accordion } from './Accordion'

it('Button fires onClick and applies primary variant by default', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Go</Button>)
  const btn = screen.getByRole('button', { name: 'Go' })
  expect(btn.className).toContain('bg-brand')
  await userEvent.click(btn)
  expect(onClick).toHaveBeenCalledOnce()
})

it('Button applies secondary variant', () => {
  render(<Button variant="secondary">X</Button>)
  expect(screen.getByRole('button', { name: 'X' }).className).toContain('bg-navy')
})

it('Accordion toggles a panel open on click', async () => {
  render(<Accordion items={[{ id: '1', question: 'Q1', answer: 'Answer one' }]} />)
  expect(screen.queryByText('Answer one')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Q1/ }))
  expect(screen.getByText('Answer one')).toBeInTheDocument()
})
