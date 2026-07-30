// Fase 4 — Stripe webhook handler.
//
// Deployed with: supabase functions deploy stripe-webhook
// After deploying, register this function's URL as a webhook endpoint in the
// Stripe Dashboard (or via `stripe listen`/`stripe trigger` for local
// testing), subscribed at least to `checkout.session.completed`, and set:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   (the signing
//     secret Stripe shows for THIS endpoint — different per endpoint/env)
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//
// UNCERTAINTY (verify before real deployment): `stripe.webhooks.constructEventAsync`
// is, to the best of my knowledge, the correct Deno-compatible API — Stripe's
// Node SDK's normal `constructEvent` relies on Node's synchronous crypto
// APIs, which aren't available in Deno's runtime, so the SDK exposes an
// async variant for edge/worker runtimes. This was not runtime-verified
// here (no Deno runtime available in this environment). Confirm the exact
// method name and required Stripe SDK version against
// https://github.com/stripe/stripe-node#configuring-a-proxy /
// Stripe's Deno Deploy guide before going live, and test with the Stripe
// CLI (`stripe listen --forward-to <function-url>` +
// `stripe trigger checkout.session.completed`) prior to enabling this in
// production.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('stripe-webhook: missing required environment variables')
    return jsonResponse({ error: 'Server misconfiguration' }, 500)
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  // Read the RAW body as text — signature verification needs the exact
  // bytes Stripe signed. Parsing as JSON first (even to re-stringify) can
  // silently break verification due to key ordering/whitespace differences.
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    if (!signature) throw new Error('Missing stripe-signature header')
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('stripe-webhook: signature verification failed', err)
    return jsonResponse({ error: 'Invalid signature' }, 400)
  }

  // Acknowledge everything we don't act on — Stripe expects a fast 2xx for
  // any event type it delivers, not just the ones we handle.
  if (event.type !== 'checkout.session.completed') {
    return jsonResponse({ received: true }, 200)
  }

  const session = event.data.object as Stripe.Checkout.Session
  const consolidationId = session.client_reference_id
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Update the payment row first — this half is idempotent by construction
  // (unique(provider, provider_session_id) means retried webhook deliveries
  // just re-apply the same update to the same row).
  const { error: paymentError, data: updatedPayments } = await adminClient
    .from('payments')
    .update({ status: 'succeeded', provider_payment_intent_id: paymentIntentId })
    .eq('provider_session_id', session.id)
    .select('id')

  if (paymentError) {
    console.error('stripe-webhook: failed to update payments row for session', session.id, paymentError)
    // Return 500 so Stripe retries — safe to retry since the update above is
    // idempotent (re-applying the same status/intent id to the same row).
    return jsonResponse({ error: 'Failed to update payment' }, 500)
  }
  if (!updatedPayments || updatedPayments.length === 0) {
    // No matching payments row — shouldn't happen if create-checkout-session
    // ran correctly, but log loudly rather than silently succeeding, since a
    // real payment might otherwise go unrecorded.
    console.error('stripe-webhook: no payments row found for session', session.id)
    return jsonResponse({ error: 'No matching payment record' }, 500)
  }

  if (!consolidationId) {
    console.error('stripe-webhook: checkout session missing client_reference_id', session.id)
    return jsonResponse({ error: 'Missing client_reference_id' }, 500)
  }

  // Second half: flip the consolidation to 'paid'. protect_consolidation_staff_columns
  // (migration 20260730000003) explicitly allows service-role writes to
  // paid_at/status here — without that fix this update would silently
  // revert itself. If this fails after the payment row already succeeded,
  // we still return 500 so Stripe retries; the payments update above is a
  // no-op on retry, and this update is naturally idempotent too (setting the
  // same status/paid_at again is harmless), so retrying is safe.
  const { error: consolidationError, data: updatedConsolidations } = await adminClient
    .from('consolidations')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', consolidationId)
    .select('id')

  if (consolidationError) {
    console.error('stripe-webhook: failed to update consolidation', consolidationId, consolidationError)
    return jsonResponse({ error: 'Failed to update consolidation' }, 500)
  }
  if (!updatedConsolidations || updatedConsolidations.length === 0) {
    console.error('stripe-webhook: no consolidation row found for id', consolidationId)
    return jsonResponse({ error: 'No matching consolidation' }, 500)
  }

  return jsonResponse({ received: true }, 200)
})
