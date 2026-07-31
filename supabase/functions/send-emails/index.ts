// Fase 7.4 — Processador do outbox de e-mails (cron).
//
// Autenticação: exige `Authorization: Bearer <service_role_key>` (comparação
// por digest, timing-safe). O gateway (verify_jwt=true, default) já barra
// requisições sem JWT válido, mas a anon key é pública e passaria — por isso
// a checagem própria: só o cron (configurado com a service_role key no
// header) pode disparar envios. Fail-closed.
//
// Duas responsabilidades, nesta ordem:
// 1. Gerar avisos de armazenagem (storage_warning) para pacotes vivos além
//    de free_storage_days — temporal, por isso vive aqui e não em trigger.
//    Dedup: no máximo 1 aviso por pacote a cada 7 dias. (Duas execuções
//    exatamente simultâneas poderiam duplicar um aviso; com a função
//    restrita ao cron de 15 min e terminando em segundos, o risco é
//    aceito e documentado.)
// 2. Processa até 50 linhas 'pending' com claim atômica ANTES do envio:
//    pending → 'sending' (UPDATE com guarda `.eq('status','pending')` +
//    `.select()`; 0 linhas = outra execução levou a linha, pula) → só a
//    execução que reivindicou chama a Resend → 'sent'/'failed'. Sem
//    RESEND_API_KEY marca 'skipped' com explicação — nada se perde
//    silenciosamente, o painel admin mostra. Linhas presas em 'sending'
//    há mais de 10 min (crash no meio) voltam a 'pending' no início da
//    execução seguinte.
//
// Deploy/agendamento (checklist manual no roadmap):
//   supabase functions deploy send-emails
//   supabase secrets set RESEND_API_KEY=re_...   (opcional; sem ela = skipped)
//   Agendar 1×/15min (Dashboard → Integrations → Cron) com o header
//   Authorization: Bearer <service_role_key>.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TEMPLATES: Record<string, { subject: string; body: (p: Record<string, unknown>) => string }> = {
  package_received: {
    subject: 'Your package arrived at our warehouse',
    body: (p) => `Good news! A package from ${p.store} (${p.weight_kg} kg) just arrived at your Bufano Redirect suite. We'll review it and let you know when it's ready to ship.`,
  },
  package_ready: {
    subject: 'Your package is ready to ship',
    body: (p) => `Your package from ${p.store} passed review and is ready. Sign in to consolidate and ship it whenever you like.`,
  },
  payment_confirmed: {
    subject: 'Payment received',
    body: (p) => `We received your payment of $${p.amount_usd}. Your shipment is now being prepared.`,
  },
  shipped: {
    subject: 'Your shipment is on the way',
    body: (p) => `Your consolidation shipped via ${p.carrier}. Tracking code: ${p.tracking_code ?? 'to be assigned'}.`,
  },
  storage_warning: {
    subject: 'Package storage period expiring',
    body: (p) => `Your package from ${p.store} has been stored for ${p.days} days. Free storage is ${p.free_days} days — ship it soon to avoid storage fees.`,
  },
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('send-emails: missing environment variables')
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (!(await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY') ?? null
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // ---- 0) Recupera claims órfãs (crash entre a claim e a marcação) -----
  const staleCutoff = new Date(Date.now() - 10 * 60_000).toISOString()
  await admin.from('email_outbox')
    .update({ status: 'pending', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', staleCutoff)

  // ---- 1) Avisos de armazenagem -------------------------------------
  let warningsCreated = 0
  try {
    const { data: settingRow } = await admin
      .from('settings').select('value').eq('key', 'free_storage_days').maybeSingle()
    const freeDays = Number(settingRow?.value ?? '30') || 30
    const cutoff = new Date(Date.now() - freeDays * 86400_000).toISOString()

    const { data: overdue } = await admin
      .from('packages')
      .select('id, user_id, store, received_at')
      .in('status', ['received', 'in_review', 'ready'])
      .lt('received_at', cutoff)
      .limit(100)

    for (const pkg of overdue ?? []) {
      // Dedup: já existe aviso deste pacote nos últimos 7 dias?
      const since = new Date(Date.now() - 7 * 86400_000).toISOString()
      const { data: recent } = await admin
        .from('email_outbox')
        .select('id')
        .eq('user_id', pkg.user_id)
        .eq('template', 'storage_warning')
        .gte('created_at', since)
        .contains('payload', { package_id: pkg.id })
        .limit(1)
      if (recent && recent.length > 0) continue

      const days = Math.floor((Date.now() - new Date(pkg.received_at).getTime()) / 86400_000)
      const { error } = await admin.from('email_outbox').insert({
        user_id: pkg.user_id,
        template: 'storage_warning',
        payload: { package_id: pkg.id, store: pkg.store, days, free_days: freeDays },
      })
      if (!error) warningsCreated++
    }
  } catch (err) {
    // Falha na geração de avisos não impede o processamento da fila.
    console.error('send-emails: storage-warning generation failed', err)
  }

  // ---- 2) Processa a fila -------------------------------------------
  const { data: batch, error: batchError } = await admin
    .from('email_outbox')
    .select('id, user_id, template, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)
  if (batchError) {
    console.error('send-emails: failed to read outbox', batchError)
    return new Response(JSON.stringify({ error: 'Failed to read outbox' }), { status: 500 })
  }

  const fromSetting = await admin.from('settings').select('value').eq('key', 'email_from').maybeSingle()
  const from = fromSetting.data?.value ?? 'Bufano Redirect <onboarding@resend.dev>'

  let sent = 0, skipped = 0, failed = 0
  for (const row of batch ?? []) {
    // Claim atômica ANTES de qualquer envio: só quem move pending→sending
    // (1 linha afetada) processa a linha. Execuções concorrentes veem 0
    // linhas e pulam — nenhum e-mail sai duas vezes.
    const { data: claimed } = await admin.from('email_outbox')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending').select('id')
    if (!claimed || claimed.length === 0) continue

    const template = TEMPLATES[row.template]
    if (!template) {
      await admin.from('email_outbox')
        .update({ status: 'failed', error: `Unknown template ${row.template}` })
        .eq('id', row.id).eq('status', 'sending')
      failed++
      continue
    }

    if (!resendKey) {
      await admin.from('email_outbox')
        .update({ status: 'skipped', error: 'RESEND_API_KEY not configured — email not sent' })
        .eq('id', row.id).eq('status', 'sending')
      skipped++
      continue
    }

    const { data: profile } = await admin
      .from('profiles').select('email, name').eq('id', row.user_id).maybeSingle()
    if (!profile?.email) {
      await admin.from('email_outbox')
        .update({ status: 'failed', error: 'Recipient profile/email not found' })
        .eq('id', row.id).eq('status', 'sending')
      failed++
      continue
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: profile.email,
          subject: template.subject,
          text: `Hi ${profile.name || ''},\n\n${template.body(row.payload as Record<string, unknown>)}\n\n— Bufano Redirect`,
        }),
      })
      if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`)
      await admin.from('email_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: '' })
        .eq('id', row.id).eq('status', 'sending')
      sent++
    } catch (err) {
      console.error('send-emails: send failed for', row.id, err)
      await admin.from('email_outbox')
        .update({ status: 'failed', error: String(err).slice(0, 500) })
        .eq('id', row.id).eq('status', 'sending')
      failed++
    }
  }

  return new Response(JSON.stringify({ warningsCreated, sent, skipped, failed }), { status: 200 })
})
