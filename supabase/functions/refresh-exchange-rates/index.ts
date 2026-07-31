// Fase 7.2 — Atualização diária das cotações de exibição.
//
// USD é a única moeda real do sistema; estas cotações servem SÓ para o
// cliente ver "≈ R$ 987,00" ao lado do valor em dólar. Falha aqui nunca
// pode bloquear nada: o site simplesmente deixa de mostrar a estimativa.
//
// Fonte: frankfurter.app (dados do BCE, gratuito, sem API key). O BCE não
// publica ARS — as moedas ausentes da resposta são apenas puladas e
// registradas no log (o site não mostra estimativa para elas, por design).
//
// Deploy/agendamento (manual, ver checklist no roadmap):
//   supabase functions deploy refresh-exchange-rates
//   Agendar 1×/dia no Dashboard (Integrations → Cron → invocar esta função
//   com o header Authorization: Bearer <service_role key>, que é o padrão
//   do agendador do Supabase).
//
// Exposição: com verify_jwt padrão o gateway aceita QUALQUER JWT válido do
// projeto — inclusive a anon key, que é pública no bundle do site. Ou seja,
// qualquer um PODE invocar esta função. Isso é aceitável de propósito: ela
// não recebe parâmetros, só faz upsert idempotente de dados públicos da
// frankfurter; o pior caso de abuso é forçar um refresh extra.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TARGET_CURRENCIES = ['BRL', 'EUR', 'GBP', 'MXN', 'ARS'] as const

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('refresh-exchange-rates: missing environment variables')
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 })
  }

  const to = TARGET_CURRENCIES.join(',')
  let payload: { date: string; rates: Record<string, number> }
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${to}`)
    if (!res.ok) throw new Error(`frankfurter responded ${res.status}`)
    payload = await res.json()
  } catch (err) {
    // Mantém a última cotação existente — o site segue mostrando a anterior.
    console.error('refresh-exchange-rates: fetch failed, keeping last rates', err)
    return new Response(JSON.stringify({ error: 'Rate source unavailable' }), { status: 502 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const rows = Object.entries(payload.rates).map(([code, rate]) => ({
    currency_code: code,
    rate_per_usd: rate,
    quoted_at: payload.date,
  }))

  const missing = TARGET_CURRENCIES.filter((c) => !(c in payload.rates))
  if (missing.length > 0) {
    console.warn('refresh-exchange-rates: source has no rate for', missing.join(', '), '— skipped')
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ updated: 0, skipped: missing }), { status: 200 })
  }

  // Idempotente: unique (currency_code, quoted_at) + upsert — rodar duas
  // vezes no mesmo dia apenas re-aplica os mesmos valores.
  const { error } = await adminClient
    .from('exchange_rates')
    .upsert(rows, { onConflict: 'currency_code,quoted_at' })
  if (error) {
    console.error('refresh-exchange-rates: upsert failed', error)
    return new Response(JSON.stringify({ error: 'Failed to store rates' }), { status: 500 })
  }

  return new Response(JSON.stringify({ updated: rows.length, skipped: missing, date: payload.date }), {
    status: 200,
  })
})
