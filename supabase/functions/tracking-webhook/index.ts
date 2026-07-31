// Fase 7.4 — Webhook genérico de rastreamento.
//
// Recebe eventos de QUALQUER fornecedor (agregador tipo AfterShip/17TRACK,
// ou um adaptador próprio para Correios) num formato único:
//   POST { "tracking_code": "...", "status": "...", "occurred_at"?: ISO, "raw"?: any }
// Autenticação: header `x-webhook-secret` deve bater com o secret
// TRACKING_WEBHOOK_SECRET (configurado por fornecedor no painel dele).
// Sem o secret configurado no ambiente, a função NUNCA aceita (503) —
// fail-closed. verify_jwt=false no gateway (fornecedor não tem JWT do
// Supabase), ver supabase/config.toml.
//
// A consolidação é resolvida pelo tracking_code — o fornecedor nunca vê
// ids internos. O trigger tracking_events_apply (migration 7.4) promove
// shipped→delivered sozinho quando o status normalizado é 'delivered'.
//
// Deploy (checklist manual no roadmap):
//   supabase functions deploy tracking-webhook
//   supabase secrets set TRACKING_WEBHOOK_SECRET=<valor forte>
import { createClient } from 'npm:@supabase/supabase-js@2'

const STATUS_MAP: Record<string, string> = {
  delivered: 'delivered',
  delivery: 'delivered',
  entregue: 'delivered',
  in_transit: 'in_transit',
  intransit: 'in_transit',
  transit: 'in_transit',
  'em transito': 'in_transit',
  customs: 'customs',
  customs_hold: 'customs',
  'na alfandega': 'customs',
  out_for_delivery: 'out_for_delivery',
  outfordelivery: 'out_for_delivery',
  'saiu para entrega': 'out_for_delivery',
  exception: 'exception',
  failed_attempt: 'exception',
  returned: 'exception',
  extraviado: 'exception',
}

// Comparação sem short-circuit: compara digests SHA-256 de tamanho fixo.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(da), vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

function normalize(status: string): string {
  const key = status.trim().toLowerCase().replace(/[-\s]+/g, '_')
  const plain = status.trim().toLowerCase()
  // Desconhecido vira 'exception' de propósito: melhor um alerta falso no
  // painel de pendências do que um evento real ignorado em silêncio.
  return STATUS_MAP[key] ?? STATUS_MAP[plain] ?? 'exception'
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const secret = Deno.env.get('TRACKING_WEBHOOK_SECRET')
  if (!secret) {
    console.error('tracking-webhook: TRACKING_WEBHOOK_SECRET not configured — rejecting')
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503 })
  }
  if (!(await timingSafeEqual(req.headers.get('x-webhook-secret') ?? '', secret))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('tracking-webhook: missing environment variables')
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 })
  }

  let body: { tracking_code?: string; status?: string; occurred_at?: string; raw?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  if (!body.tracking_code || !body.status) {
    return new Response(JSON.stringify({ error: 'tracking_code and status are required' }), { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: consolidation, error: findError } = await admin
    .from('consolidations')
    .select('id')
    .eq('tracking_code', body.tracking_code)
    .maybeSingle()
  if (findError) {
    console.error('tracking-webhook: lookup failed', findError)
    return new Response(JSON.stringify({ error: 'Lookup failed' }), { status: 500 })
  }
  if (!consolidation) {
    return new Response(JSON.stringify({ error: 'Unknown tracking code' }), { status: 404 })
  }

  const occurredAt = body.occurred_at && !Number.isNaN(Date.parse(body.occurred_at))
    ? new Date(body.occurred_at).toISOString()
    : new Date().toISOString()

  // Teto no payload bruto: fornecedor bugado/comprometido não infla a
  // tabela — acima de 10 KB guardamos só a marca de truncamento.
  let rawPayload: unknown = body.raw ?? {}
  try {
    if (JSON.stringify(rawPayload).length > 10_000) rawPayload = { truncated: true }
  } catch {
    rawPayload = { truncated: true }
  }

  const { error: insertError } = await admin.from('tracking_events').insert({
    consolidation_id: consolidation.id,
    source: 'webhook',
    raw_status: String(body.status).slice(0, 200),
    normalized_status: normalize(String(body.status)),
    occurred_at: occurredAt,
    payload: rawPayload,
  })
  if (insertError) {
    console.error('tracking-webhook: insert failed', insertError)
    return new Response(JSON.stringify({ error: 'Failed to record event' }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
