// Shared CORS headers for Supabase Edge Functions invoked from the browser
// (create-checkout-session) or from Stripe's servers (stripe-webhook — Stripe
// itself doesn't need CORS, but returning these headers on every response is
// harmless and keeps both functions consistent).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
