import { paymentService } from './paymentService'
import { supabase } from '../lib/supabase'

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}))

const mockedInvoke = supabase.functions.invoke as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('createCheckoutSession', () => {
  it('invokes the create-checkout-session function and returns the checkout url', async () => {
    mockedInvoke.mockResolvedValue({
      data: { url: 'https://checkout.stripe.com/session123' },
      error: null,
    })

    const result = await paymentService.createCheckoutSession('c1')

    expect(mockedInvoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { consolidationId: 'c1' },
    })
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session123' })
  })

  it('throws when the function invocation fails (e.g. the Edge Function is not deployed yet)', async () => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Consolidation not found or not payable' },
    })

    await expect(paymentService.createCheckoutSession('c1')).rejects.toThrow(
      'Consolidation not found or not payable',
    )
  })
})
