import { describe, it, expect, vi, beforeEach } from 'vitest'
import { outboxAdminService } from './outboxAdminService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })

/**
 * Cadeia real: select → (eq quando há filtro) → order → limit. O objeto de
 * select expõe `eq` e `order` para cobrir os dois caminhos; `eq` devolve o
 * mesmo `{ order }` que o caminho sem filtro usa.
 */
function mockOutboxChain(result: { data: unknown; error: { message: string } | null }) {
  const limit = vi.fn().mockResolvedValue(result)
  const order = vi.fn().mockReturnValue({ limit })
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq, order })
  mockedSupabase.from.mockReturnValue({ select } as never)
  return { select, eq, order, limit }
}

beforeEach(() => vi.clearAllMocks())

describe('getOutbox', () => {
  it('returns the latest outbox emails with customer names, newest first, capped at 100', async () => {
    const rows = [
      {
        id: 'em-1',
        template: 'package_received',
        status: 'sent',
        error: '',
        created_at: '2026-07-29T10:00:00Z',
        sent_at: '2026-07-29T10:05:00Z',
        profiles: { name: 'Ana' },
      },
      {
        id: 'em-2',
        template: 'shipped',
        status: 'failed',
        error: 'Resend: invalid recipient',
        created_at: '2026-07-28T09:00:00Z',
        sent_at: null,
        profiles: [{ name: 'Bia' }],
      },
    ]
    const { select, eq, order, limit } = mockOutboxChain({ data: rows, error: null })

    const result = await outboxAdminService.getOutbox()

    expect(mockedSupabase.from).toHaveBeenCalledWith('email_outbox')
    expect(select).toHaveBeenCalledWith('id, template, status, error, created_at, sent_at, profiles (name)')
    expect(eq).not.toHaveBeenCalled()
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(result).toEqual([
      {
        id: 'em-1',
        template: 'package_received',
        status: 'sent',
        error: '',
        createdAt: '2026-07-29T10:00:00Z',
        sentAt: '2026-07-29T10:05:00Z',
        customerName: 'Ana',
      },
      {
        id: 'em-2',
        template: 'shipped',
        status: 'failed',
        error: 'Resend: invalid recipient',
        createdAt: '2026-07-28T09:00:00Z',
        sentAt: null,
        customerName: 'Bia',
      },
    ])
  })

  it('applies the status filter before order/limit when provided', async () => {
    const { eq, order, limit } = mockOutboxChain({ data: [], error: null })

    const result = await outboxAdminService.getOutbox('skipped')

    expect(eq).toHaveBeenCalledWith('status', 'skipped')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(result).toEqual([])
  })

  it('maps a missing profiles embed to an empty customer name', async () => {
    mockOutboxChain({
      data: [
        {
          id: 'em-3',
          template: 'storage_warning',
          status: 'pending',
          error: '',
          created_at: '2026-07-27T08:00:00Z',
          sent_at: null,
          profiles: null,
        },
      ],
      error: null,
    })

    const result = await outboxAdminService.getOutbox('pending')

    expect(result[0].customerName).toBe('')
  })

  it('throws when the query fails', async () => {
    mockOutboxChain({ data: null, error: { message: 'boom' } })

    await expect(outboxAdminService.getOutbox()).rejects.toThrow('boom')
  })
})
