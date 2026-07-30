// Fase 4 — Stripe Checkout Session creation.
//
// Deno Edge Function. Deployed with:
//   supabase functions deploy create-checkout-session
// Requires two secrets that do NOT exist yet in this project and must be set
// manually once a real Stripe account is available:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided
// automatically to every Edge Function — no manual setup needed for those.)
//
// UNCERTAINTY (verify before real deployment): the exact currently-correct
// pinned Stripe API version string and the `npm:stripe@17` resolution inside
// Deno's npm compat layer were not runtime-verified in this environment (no
// Deno runtime was available to execute this file). The shape of the calls
// below (stripe.checkout.sessions.create, etc.) matches Stripe's documented
// Node/TS SDK surface, which the Deno SDK mirrors, but double-check against
// Stripe's Deno-specific guide (https://github.com/stripe/stripe-node#deno)
// before going live.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// Same dimensional-weight assumption Ship.tsx uses client-side for the
// pre-payment estimate (BOX_DIMENSION_CM = 40, see src/pages/dashboard/Ship.tsx).
// The warehouse doesn't yet record the *actual* packed box dimensions
// anywhere queryable (a future enhancement would have staff fill those in
// before checkout opens) — until that exists, re-deriving the dimensional
// weight from this same fixed assumption, combined with the REAL summed
// packages.weight_kg fetched fresh here, is the most defensible
// server-side recomputation available without a schema change.
const BOX_DIMENSION_CM = 40
const DIM_DIVISOR = 5000 // cm³ per kg — must match src/services/rateService.ts
const DEFAULT_ZONE = 'DEFAULT'

interface RateRow {
  destination_zone: string
  carrier: string
  base_fee_usd: number
  rate_per_kg_usd: number
  multiplier: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    let body: { consolidationId?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const consolidationId = body.consolidationId
    if (!consolidationId || typeof consolidationId !== 'string') {
      return jsonResponse({ error: 'consolidationId is required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeSecretKey) {
      console.error('create-checkout-session: missing required environment variables')
      return jsonResponse({ error: 'Server misconfiguration' }, 500)
    }

    // Per-request client that acts AS the calling user (forwards their JWT),
    // so RLS naturally scopes every query below to rows they're allowed to
    // see — a bad-faith request for someone else's consolidation just
    // returns nothing, no manual ownership check needed for this query.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service-role client for writes and for the authoritative price
    // recomputation below — this must not depend on the caller's RLS view,
    // it needs the real numbers regardless of what the client can see.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Not authenticated' }, 401)
    }
    const userId = userData.user.id

    // 1) Load the consolidation AS the caller (RLS-scoped).
    const { data: consolidation, error: consolidationError } = await userClient
      .from('consolidations')
      .select('id, status, carrier, country')
      .eq('id', consolidationId)
      .maybeSingle()

    if (consolidationError) {
      console.error('create-checkout-session: consolidation lookup failed', consolidationError)
      return jsonResponse({ error: 'Failed to load consolidation' }, 500)
    }
    if (!consolidation || consolidation.status !== 'pending') {
      return jsonResponse({ error: 'Consolidation not found or not payable' }, 400)
    }
    if (!consolidation.carrier) {
      return jsonResponse({ error: 'Consolidation has no carrier selected' }, 400)
    }

    // 2) Guard against double-charging. `payments` has no client-facing
    // insert/update policy, so reads here can use either client — the
    // service-role client is used for consistency with the writes below.
    const { data: existingPayments, error: existingPaymentsError } = await adminClient
      .from('payments')
      .select('id, status, provider_session_id')
      .eq('consolidation_id', consolidationId)

    if (existingPaymentsError) {
      console.error('create-checkout-session: existing payments lookup failed', existingPaymentsError)
      return jsonResponse({ error: 'Failed to check existing payments' }, 500)
    }
    if (existingPayments?.some((payment) => payment.status === 'succeeded')) {
      return jsonResponse({ error: 'Already paid' }, 400)
    }

    // Reuse a still-open pending Checkout Session instead of minting a new
    // one every call. Without this, a double-click or two open tabs each
    // get their OWN valid Stripe session for the correct price — if a
    // customer completes both, Stripe charges them twice for the same
    // consolidation. The webhook can only ever record ONE of those as
    // 'succeeded' (payments_one_succeeded_per_consolidation blocks the
    // second), so a genuine double-charge would otherwise go unrecorded and
    // unrecoverable in the app, even though Stripe took the money twice.
    const stripeForLookup = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const pendingPayment = existingPayments?.find((payment) => payment.status === 'pending')
    if (pendingPayment) {
      try {
        const existingSession = await stripeForLookup.checkout.sessions.retrieve(pendingPayment.provider_session_id)
        if (existingSession.status === 'open' && existingSession.url) {
          return jsonResponse({ url: existingSession.url }, 200)
        }
        // Session expired/completed/otherwise not reusable — fall through
        // and create a fresh one. The old pending row is left as-is; it's
        // harmless (never counted as a real payment) and useful as a log
        // of the abandoned attempt.
      } catch (err) {
        console.error('create-checkout-session: failed to retrieve existing session, creating a new one', err)
        // Non-fatal — proceed to create a fresh session below.
      }
    }

    // 3) Recompute the authoritative price server-side. NEVER trust
    // consolidations.cost_usd — per the migration's comment, that column is
    // only the customer-facing estimate captured at consolidation-creation
    // time. Also do NOT trust consolidations.chargeable_weight_kg blindly:
    // the consolidations_insert_own RLS policy does not restrict that column
    // on INSERT (only status/tracking_code/paid_at/shipped_at are locked
    // down), so a client could in principle forge it directly via the API.
    // Instead, re-derive the chargeable weight from the REAL packages in
    // this consolidation (packages.weight_kg is staff-written only, RLS
    // blocks client writes to it) using the exact same formula as
    // src/services/rateService.ts, then look up a fresh rate_tables row.
    const { data: itemRows, error: itemsError } = await adminClient
      .from('consolidation_items')
      .select('package_id')
      .eq('consolidation_id', consolidationId)

    if (itemsError) {
      console.error('create-checkout-session: consolidation_items lookup failed', itemsError)
      return jsonResponse({ error: 'Failed to load consolidation items' }, 500)
    }
    const packageIds = (itemRows ?? []).map((row) => row.package_id as string)
    if (packageIds.length === 0) {
      return jsonResponse({ error: 'Consolidation has no packages' }, 400)
    }

    const { data: packageRows, error: packagesError } = await adminClient
      .from('packages')
      .select('weight_kg')
      .in('id', packageIds)

    if (packagesError) {
      console.error('create-checkout-session: packages lookup failed', packagesError)
      return jsonResponse({ error: 'Failed to load package weights' }, 500)
    }

    const actualWeightKg = (packageRows ?? []).reduce(
      (sum, row) => sum + Number((row as { weight_kg: number }).weight_kg),
      0,
    )
    if (!(actualWeightKg > 0)) {
      return jsonResponse({ error: 'Consolidation has no measurable weight' }, 400)
    }

    const dimWeightKg = (BOX_DIMENSION_CM * BOX_DIMENSION_CM * BOX_DIMENSION_CM) / DIM_DIVISOR
    const chargeableWeightKg = Math.round(Math.max(actualWeightKg, dimWeightKg) * 100) / 100

    const { data: rateRows, error: rateError } = await adminClient
      .from('rate_tables')
      .select('destination_zone, carrier, base_fee_usd, rate_per_kg_usd, multiplier')
      .in('destination_zone', [consolidation.country, DEFAULT_ZONE])

    if (rateError) {
      console.error('create-checkout-session: rate_tables lookup failed', rateError)
      return jsonResponse({ error: 'Failed to load shipping rates' }, 500)
    }

    const rows = (rateRows ?? []) as RateRow[]
    const specificRows = rows.filter((row) => row.destination_zone === consolidation.country)
    const rowsToUse = specificRows.length > 0 ? specificRows : rows.filter((row) => row.destination_zone === DEFAULT_ZONE)
    const matchedRate = rowsToUse.find((row) => row.carrier === consolidation.carrier)

    if (!matchedRate) {
      return jsonResponse({ error: 'No current shipping rate found for this consolidation' }, 400)
    }

    const recomputedCostUsd =
      Math.round((matchedRate.base_fee_usd + chargeableWeightKg * matchedRate.rate_per_kg_usd * matchedRate.multiplier) * 100) / 100

    if (!(recomputedCostUsd > 0)) {
      console.error('create-checkout-session: recomputed cost is not positive', recomputedCostUsd)
      return jsonResponse({ error: 'Unable to determine a valid price' }, 500)
    }

    // 4) Create the Stripe Checkout Session using ONLY the server-recomputed
    // amount above — the client-supplied consolidationId only selects WHICH
    // shipment is being paid for, never the price. Reuses the Stripe client
    // created in step 2 (no need for a second instance).
    const stripe = stripeForLookup

    const origin = req.headers.get('origin') ?? 'https://uboxredirect.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(recomputedCostUsd * 100),
            product_data: { name: 'Bufano Redirect — Consolidated Shipment' },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/app/shipments?payment=success`,
      cancel_url: `${origin}/app/shipments?payment=cancelled`,
      client_reference_id: consolidationId,
      metadata: { consolidationId, userId },
    })

    if (!session.url) {
      console.error('create-checkout-session: Stripe session created without a url', session.id)
      return jsonResponse({ error: 'Failed to create checkout session' }, 500)
    }

    // 5) Record the pending payment. Only the service-role client can write
    // here — RLS has no insert/update policy for `authenticated` on payments.
    const { error: insertError } = await adminClient.from('payments').insert({
      consolidation_id: consolidationId,
      user_id: userId,
      provider: 'stripe',
      provider_session_id: session.id,
      amount_usd: recomputedCostUsd,
      currency: 'usd',
      status: 'pending',
    })

    if (insertError) {
      console.error('create-checkout-session: failed to insert payments row', insertError)
      return jsonResponse({ error: 'Failed to record payment' }, 500)
    }

    return jsonResponse({ url: session.url }, 200)
  } catch (err) {
    // Log the real error server-side only — an unexpected exception here
    // could be a raw Stripe SDK error or similar, which might contain more
    // implementation detail than we want to hand back to the browser.
    console.error('create-checkout-session: unexpected error', err)
    return jsonResponse({ error: 'Unexpected error' }, 500)
  }
})
