import { describe, it, expect, vi, beforeEach } from 'vitest'
import { trackingService } from './trackingService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

function mockEventsChain(result: { data: unknown; error: { message: string } | null }) {
  const order = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  mockedSupabase.from.mockReturnValue({ select } as never)
  return { select, eq, order }
}

beforeEach(() => vi.clearAllMocks())

describe('getTrackingEvents', () => {
  it('returns mapped events for the consolidation, newest first', async () => {
    mockSession('cust-1')
    const rows = [
      {
        id: 'ev-2',
        raw_status: 'Delivered to recipient',
        normalized_status: 'delivered',
        occurred_at: '2026-07-29T15:00:00Z',
      },
      {
        id: 'ev-1',
        raw_status: 'Departed origin facility',
        normalized_status: 'in_transit',
        occurred_at: '2026-07-25T08:00:00Z',
      },
    ]
    const { select, eq, order } = mockEventsChain({ data: rows, error: null })

    const result = await trackingService.getTrackingEvents('con-1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('tracking_events')
    expect(select).toHaveBeenCalledWith('id, raw_status, normalized_status, occurred_at')
    expect(eq).toHaveBeenCalledWith('consolidation_id', 'con-1')
    expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'ev-2',
        rawStatus: 'Delivered to recipient',
        normalizedStatus: 'delivered',
        occurredAt: '2026-07-29T15:00:00Z',
      },
      {
        id: 'ev-1',
        rawStatus: 'Departed origin facility',
        normalizedStatus: 'in_transit',
        occurredAt: '2026-07-25T08:00:00Z',
      },
    ])
  })

  it('returns an empty list when the consolidation has no events yet', async () => {
    mockSession('cust-1')
    mockEventsChain({ data: [], error: null })

    expect(await trackingService.getTrackingEvents('con-1')).toEqual([])
  })

  it('throws when signed out', async () => {
    mockSession(null)

    await expect(trackingService.getTrackingEvents('con-1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('cust-1')
    mockEventsChain({ data: null, error: { message: 'boom' } })

    await expect(trackingService.getTrackingEvents('con-1')).rejects.toThrow('boom')
  })
})
