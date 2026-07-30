/**
 * paymentService — kicks off Stripe Checkout for a pending consolidation via
 * the `create-checkout-session` Edge Function. The Edge Function (not this
 * browser code) recomputes the authoritative price and writes the `payments`
 * row — this service is just a thin invoke wrapper.
 */
import { supabase } from '../lib/supabase'

export const paymentService = {
  async createCheckoutSession(consolidationId: string): Promise<{ url: string }> {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { consolidationId },
    })
    if (error) throw new Error(error.message)
    return data as { url: string }
  },
}
