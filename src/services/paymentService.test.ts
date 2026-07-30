import { describe, it, expect, vi, beforeEach } from 'vitest'
import { paymentService } from './paymentService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}))

const mockedInvoke = vi.mocked(supabase.functions.invoke)

beforeEach(() => vi.clearAllMocks())

describe('createCheckoutSession', () => {
  it('invokes the create-checkout-session function and returns the checkout url', async () => {
    mockedInvoke.mockResolvedValue({
      data: { url: 'https://checkout.stripe.com/session123' },
      error: null,
    } as never)

    const result = await paymentService.createCheckoutSession('c1')

    expect(mockedInvoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { consolidationId: 'c1' },
    })
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session123' })
  })

  it('throws when the function invocation fails', async () => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Consolidation not found or not payable' },
    } as never)

    await expect(paymentService.createCheckoutSession('c1')).rejects.toThrow(
      'Consolidation not found or not payable',
    )
  })
})
