/**
 * paymentService — kicks off Stripe Checkout for a pending consolidation via
 * the `create-checkout-session` Edge Function. The Edge Function (not this
 * app code) recomputes the authoritative price and writes the `payments`
 * row — this service is just a thin invoke wrapper.
 *
 * Porta 1:1 de `src/services/paymentService.ts` (site). A tela Shipments
 * abre a URL retornada num browser in-app (`expo-web-browser`) em vez de
 * navegar `window.location` — ver nota sobre o retorno do Stripe no
 * cabeçalho do plano de Fase 6 (não há deep link de volta ao app nesta
 * fase; o app refaz `getMyConsolidations()` quando volta ao foreground).
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
