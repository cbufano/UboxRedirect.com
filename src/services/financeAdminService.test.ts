import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { financeAdminService } from './financeAdminService'
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

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('getPayments', () => {
  it('returns mapped payments with customer and destination context, newest first', async () => {
    const rows = [
      {
        id: 'pay-1',
        consolidation_id: 'con-1',
        user_id: 'user-1',
        provider: 'stripe',
        amount_usd: 42.5,
        status: 'succeeded',
        notes: '',
        created_at: '2026-07-29T10:00:00Z',
        profiles: { name: 'Ana' },
        consolidations: { city: 'São Paulo', country: 'BR' },
      },
      {
        id: 'pay-2',
        consolidation_id: 'con-2',
        user_id: 'user-2',
        provider: 'manual_pix',
        amount_usd: 10,
        status: 'succeeded',
        notes: 'PIX direto',
        created_at: '2026-07-28T10:00:00Z',
        profiles: [{ name: 'Bia' }],
        consolidations: [],
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await financeAdminService.getPayments()

    expect(mockedSupabase.from).toHaveBeenCalledWith('payments')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'pay-1',
        consolidationId: 'con-1',
        userId: 'user-1',
        provider: 'stripe',
        amountUsd: 42.5,
        status: 'succeeded',
        notes: '',
        createdAt: '2026-07-29T10:00:00Z',
        customerName: 'Ana',
        city: 'São Paulo',
        country: 'BR',
      },
      {
        id: 'pay-2',
        consolidationId: 'con-2',
        userId: 'user-2',
        provider: 'manual_pix',
        amountUsd: 10,
        status: 'succeeded',
        notes: 'PIX direto',
        createdAt: '2026-07-28T10:00:00Z',
        customerName: 'Bia',
        city: '',
        country: '',
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(financeAdminService.getPayments()).rejects.toThrow('boom')
  })
})

describe('registerManualPayment', () => {
  const input = {
    consolidationId: 'con-1',
    userId: 'user-1',
    amountUsd: 55.9,
    provider: 'manual_pix' as const,
    notes: 'PIX recebido na conta X',
  }

  function mockChains({
    insertResult,
    updateResult,
  }: {
    insertResult: { data: unknown; error: { message: string } | null }
    updateResult?: { data: unknown; error: { message: string } | null }
  }) {
    const single = vi.fn().mockResolvedValue(insertResult)
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })

    const updateSelect = vi.fn().mockResolvedValue(updateResult ?? { data: [], error: null })
    const eqStatus = vi.fn().mockReturnValue({ select: updateSelect })
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus })
    const update = vi.fn().mockReturnValue({ eq: eqId })

    mockedSupabase.from.mockImplementation((table: unknown) => {
      if (table === 'payments') return { insert } as never
      if (table === 'consolidations') return { update } as never
      throw new Error(`unexpected table ${String(table)}`)
    })
    return { insert, insertSelect, update, eqId, eqStatus, updateSelect }
  }

  it('inserts a succeeded manual payment and marks the consolidation paid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'))
    mockSession('staff-1')
    const { insert, insertSelect, update, eqId, eqStatus, updateSelect } = mockChains({
      insertResult: { data: { id: 'pay-9' }, error: null },
      updateResult: { data: [{ id: 'con-1' }], error: null },
    })

    const paymentId = await financeAdminService.registerManualPayment(input)

    // provider_session_id fica DE FORA do payload (a policy exige null)
    expect(insert).toHaveBeenCalledWith({
      consolidation_id: 'con-1',
      user_id: 'user-1',
      provider: 'manual_pix',
      amount_usd: 55.9,
      notes: 'PIX recebido na conta X',
      status: 'succeeded',
      registered_by: 'staff-1',
    })
    expect(insertSelect).toHaveBeenCalledWith('id')
    expect(update).toHaveBeenCalledWith({ status: 'paid', paid_at: '2026-07-30T12:00:00.000Z' })
    expect(eqId).toHaveBeenCalledWith('id', 'con-1')
    expect(eqStatus).toHaveBeenCalledWith('status', 'pending')
    expect(updateSelect).toHaveBeenCalledWith('id')
    expect(paymentId).toBe('pay-9')
  })

  it('throws when signed out without touching the database', async () => {
    mockSession(null)
    await expect(financeAdminService.registerManualPayment(input)).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the payment insert fails and never touches the consolidation', async () => {
    mockSession('staff-1')
    const { update } = mockChains({ insertResult: { data: null, error: { message: 'duplicate' } } })

    await expect(financeAdminService.registerManualPayment(input)).rejects.toThrow('duplicate')
    expect(update).not.toHaveBeenCalled()
  })

  it('throws a clear inconsistency error when the consolidation is no longer pending', async () => {
    mockSession('staff-1')
    mockChains({
      insertResult: { data: { id: 'pay-9' }, error: null },
      updateResult: { data: [], error: null },
    })

    await expect(financeAdminService.registerManualPayment(input)).rejects.toThrow(
      'Payment was recorded but the consolidation was no longer pending — review it manually to resolve the inconsistency.',
    )
  })

  it('throws an inconsistency error when the consolidation update itself fails', async () => {
    mockSession('staff-1')
    mockChains({
      insertResult: { data: { id: 'pay-9' }, error: null },
      updateResult: { data: null, error: { message: 'rls denied' } },
    })

    await expect(financeAdminService.registerManualPayment(input)).rejects.toThrow(
      'Payment was recorded but marking the consolidation as paid failed: rls denied. Review the consolidation manually.',
    )
  })
})

describe('requestRefund', () => {
  it('inserts the refund request on behalf of the signed-in staff', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await financeAdminService.requestRefund({ paymentId: 'pay-1', amountUsd: 12.5, reason: 'Damaged item' })

    expect(mockedSupabase.from).toHaveBeenCalledWith('refunds')
    expect(insert).toHaveBeenCalledWith({
      payment_id: 'pay-1',
      amount_usd: 12.5,
      reason: 'Damaged item',
      requested_by: 'staff-1',
    })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(
      financeAdminService.requestRefund({ paymentId: 'pay-1', amountUsd: 1, reason: 'x' }),
    ).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    mockSession('staff-1')
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ insert } as never)

    await expect(
      financeAdminService.requestRefund({ paymentId: 'pay-1', amountUsd: 1, reason: 'x' }),
    ).rejects.toThrow('boom')
  })
})

describe('getRefunds', () => {
  it('returns mapped refunds with the original payment context, newest first', async () => {
    const rows = [
      {
        id: 'ref-1',
        payment_id: 'pay-1',
        amount_usd: 12.5,
        reason: 'Damaged item',
        status: 'requested',
        created_at: '2026-07-29T10:00:00Z',
        processed_at: null,
        payments: { amount_usd: 42.5, provider: 'stripe', profiles: { name: 'Ana' } },
      },
      {
        id: 'ref-2',
        payment_id: 'pay-2',
        amount_usd: 5,
        reason: 'Overcharge',
        status: 'processed',
        created_at: '2026-07-28T10:00:00Z',
        processed_at: '2026-07-29T09:00:00Z',
        payments: [],
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const result = await financeAdminService.getRefunds()

    expect(mockedSupabase.from).toHaveBeenCalledWith('refunds')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'ref-1',
        paymentId: 'pay-1',
        amountUsd: 12.5,
        reason: 'Damaged item',
        status: 'requested',
        createdAt: '2026-07-29T10:00:00Z',
        processedAt: null,
        paymentAmountUsd: 42.5,
        paymentProvider: 'stripe',
        customerName: 'Ana',
      },
      {
        id: 'ref-2',
        paymentId: 'pay-2',
        amountUsd: 5,
        reason: 'Overcharge',
        status: 'processed',
        createdAt: '2026-07-28T10:00:00Z',
        processedAt: '2026-07-29T09:00:00Z',
        paymentAmountUsd: null,
        paymentProvider: null,
        customerName: '',
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ order })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(financeAdminService.getRefunds()).rejects.toThrow('boom')
  })
})

describe.each([
  { method: 'markRefundProcessed' as const, status: 'processed' },
  { method: 'markRefundFailed' as const, status: 'failed' },
])('$method', ({ method, status }) => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eqStatus = vi.fn().mockReturnValue({ select })
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus })
    const update = vi.fn().mockReturnValue({ eq: eqId })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eqId, eqStatus, select }
  }

  it(`transitions a requested refund to ${status} with a processed_at timestamp`, async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'))
    mockSession('staff-1')
    const { update, eqId, eqStatus, select } = mockUpdateChain({ data: [{ id: 'ref-1' }], error: null })

    await financeAdminService[method]('ref-1')

    expect(mockedSupabase.from).toHaveBeenCalledWith('refunds')
    expect(update).toHaveBeenCalledWith({ status, processed_at: '2026-07-30T12:00:00.000Z' })
    expect(eqId).toHaveBeenCalledWith('id', 'ref-1')
    expect(eqStatus).toHaveBeenCalledWith('status', 'requested')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('throws when no row is affected (already resolved or missing)', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: [], error: null })

    await expect(financeAdminService[method]('ref-1')).rejects.toThrow(
      'Refund is not in requested status or was not found',
    )
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(financeAdminService[method]('ref-1')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('staff-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(financeAdminService[method]('ref-1')).rejects.toThrow('boom')
  })
})
