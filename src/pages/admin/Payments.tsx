/**
 * Payments — financeiro do painel staff (/admin/payments): histórico de
 * pagamentos com filtros client-side (status/meio), registro de pagamento
 * manual recebido FORA do Stripe (PIX direto, transferência) e trilha de
 * estornos. O estorno Stripe REAL é feito no dashboard do Stripe — aqui fica
 * só o registro de decisão/conciliação (aviso fixo no card de estornos).
 *
 * Tratamento de erro especial: registerManualPayment pode falhar DEPOIS de o
 * pagamento ter sido gravado ("Payment was recorded but…"). Esse caso não é
 * erro genérico — o dinheiro entrou e a linha existe — então mostra um aviso
 * âmbar próprio pedindo revisão manual e AINDA recarrega a lista.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { CreditCard, Undo2 } from 'lucide-react'
import {
  financeAdminService,
  type AdminPayment,
  type AdminRefund,
  type PaymentProvider,
  type PaymentStatus,
} from '../../services/financeAdminService'
import { adminService, type CustomerLookup, type PendingConsolidationOption } from '../../services/adminService'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

type CustomerMatch = CustomerLookup | 'not_found' | null

const MANUAL_PROVIDERS = ['manual_pix', 'manual_transfer', 'manual_other'] as const
const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'succeeded', 'failed', 'refunded']
const PAYMENT_PROVIDERS: PaymentProvider[] = ['stripe', 'manual_pix', 'manual_transfer', 'manual_other']

const paymentStatusClasses: Record<PaymentStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  succeeded: 'bg-success/10 text-success',
  failed: 'bg-red-500/10 text-red-600',
  refunded: 'bg-slate/10 text-slate',
}

const refundStatusClasses: Record<AdminRefund['status'], string> = {
  requested: 'bg-amber-500/10 text-amber-600',
  processed: 'bg-success/10 text-success',
  failed: 'bg-red-500/10 text-red-600',
}

/**
 * registerManualPayment sinaliza "pagamento gravado mas consolidação não
 * atualizada" com mensagens que começam por este prefixo (ver
 * financeAdminService) — as duas variantes (0 linhas / erro do update) são a
 * mesma inconsistência para o operador.
 */
function isInconsistencyError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Payment was recorded but')
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

const selectClasses =
  'mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

export default function Payments() {
  const { t } = useTranslation()

  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all')
  const [providerFilter, setProviderFilter] = useState<'all' | PaymentProvider>('all')

  const [refunds, setRefunds] = useState<AdminRefund[]>([])
  const [refundsLoading, setRefundsLoading] = useState(true)
  const [refundsError, setRefundsError] = useState(false)

  // Registro manual: lookup por suite → consolidações pending do cliente.
  const [customerMatch, setCustomerMatch] = useState<CustomerMatch>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [pendingConsolidations, setPendingConsolidations] = useState<PendingConsolidationOption[]>([])
  const [consolidationsLoading, setConsolidationsLoading] = useState(false)
  const [consolidationsError, setConsolidationsError] = useState(false)
  const [selectedConsolidationId, setSelectedConsolidationId] = useState('')
  const [consolidationMissing, setConsolidationMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(false)
  const [formSuccess, setFormSuccess] = useState(false)
  const [inconsistency, setInconsistency] = useState(false)

  // Form inline de estorno (abre por pagamento succeeded).
  const [refundFor, setRefundFor] = useState<AdminPayment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundAmountError, setRefundAmountError] = useState(false)
  const [refundReasonError, setRefundReasonError] = useState(false)
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [refundError, setRefundError] = useState(false)
  const [refundSuccess, setRefundSuccess] = useState(false)

  // Ações processado/falhou nos refunds 'requested'.
  const [refundActionId, setRefundActionId] = useState<string | null>(null)
  const [refundActionError, setRefundActionError] = useState(false)

  const loadPayments = async () => {
    try {
      setPayments(await financeAdminService.getPayments())
      setPaymentsError(false)
    } catch {
      setPaymentsError(true)
    }
  }

  const loadRefunds = async () => {
    try {
      setRefunds(await financeAdminService.getRefunds())
      setRefundsError(false)
    } catch {
      setRefundsError(true)
    }
  }

  useEffect(() => {
    let active = true
    financeAdminService
      .getPayments()
      .then((data) => {
        if (active) setPayments(data)
      })
      .catch(() => {
        if (active) setPaymentsError(true)
      })
      .finally(() => {
        if (active) setPaymentsLoading(false)
      })
    financeAdminService
      .getRefunds()
      .then((data) => {
        if (active) setRefunds(data)
      })
      .catch(() => {
        if (active) setRefundsError(true)
      })
      .finally(() => {
        if (active) setRefundsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const suiteRequiredMessage = t('admin.payments.manual.errors.suiteRequired')
  const amountPositiveMessage = t('admin.payments.manual.errors.amountPositive')

  const schema = z.object({
    suiteNumber: z.string().min(1, { message: suiteRequiredMessage }),
    amountUsd: z.coerce.number().positive({ message: amountPositiveMessage }),
    provider: z.enum(MANUAL_PROVIDERS),
    notes: z.string(),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { suiteNumber: '', amountUsd: undefined, provider: 'manual_pix', notes: '' },
  })

  const suiteNumberValue = watch('suiteNumber')

  // Se a suite mudar depois de uma busca, invalida o match — o operador
  // precisa buscar de novo antes de registrar (mesmo padrão de PackagesQueue).
  useEffect(() => {
    setCustomerMatch(null)
    setPendingConsolidations([])
    setConsolidationsError(false)
    setSelectedConsolidationId('')
    setConsolidationMissing(false)
  }, [suiteNumberValue])

  const loadConsolidations = (userId: string) => {
    setConsolidationsLoading(true)
    setConsolidationsError(false)
    adminService
      .getPendingConsolidationsForUser(userId)
      .then((data) => setPendingConsolidations(data))
      .catch(() => setConsolidationsError(true))
      .finally(() => setConsolidationsLoading(false))
  }

  const handleLookup = async () => {
    const suiteNumber = getValues('suiteNumber').trim()
    if (!suiteNumber) return
    setFormError(false)
    setFormSuccess(false)
    setInconsistency(false)
    setLookupLoading(true)
    try {
      const match = await adminService.findUserBySuite(suiteNumber)
      setCustomerMatch(match ?? 'not_found')
      if (match) loadConsolidations(match.userId)
    } catch {
      setFormError(true)
    } finally {
      setLookupLoading(false)
    }
  }

  const handleConsolidationChange = (id: string) => {
    setSelectedConsolidationId(id)
    setConsolidationMissing(false)
    const consolidation = pendingConsolidations.find((candidate) => candidate.id === id)
    // Valor default = cotação da consolidação escolhida, quando existir.
    if (consolidation?.costUsd != null) setValue('amountUsd', consolidation.costUsd)
  }

  const matchFound = customerMatch && customerMatch !== 'not_found' ? customerMatch : null

  const onValid: SubmitHandler<FormOutput> = async (values) => {
    if (!matchFound) return
    setFormError(false)
    setFormSuccess(false)
    setInconsistency(false)
    const consolidation = pendingConsolidations.find((candidate) => candidate.id === selectedConsolidationId)
    if (!consolidation) {
      setConsolidationMissing(true)
      return
    }
    setSubmitting(true)
    let recorded = false
    try {
      await financeAdminService.registerManualPayment({
        consolidationId: consolidation.id,
        userId: matchFound.userId,
        amountUsd: values.amountUsd,
        provider: values.provider,
        notes: values.notes.trim(),
      })
      recorded = true
      setFormSuccess(true)
    } catch (error) {
      if (isInconsistencyError(error)) {
        // O pagamento FOI gravado — não é o erro genérico; a consolidação é
        // que precisa de revisão manual.
        recorded = true
        setInconsistency(true)
      } else {
        setFormError(true)
      }
    } finally {
      setSubmitting(false)
    }
    if (recorded) {
      reset()
      setCustomerMatch(null)
      setPendingConsolidations([])
      setSelectedConsolidationId('')
      await loadPayments()
    }
  }

  const openRefundForm = (payment: AdminPayment) => {
    setRefundFor(payment)
    setRefundAmount(payment.amountUsd.toFixed(2))
    setRefundReason('')
    setRefundAmountError(false)
    setRefundReasonError(false)
    setRefundError(false)
    setRefundSuccess(false)
  }

  const handleRefundSubmit = async () => {
    if (!refundFor) return
    const amount = Number(refundAmount)
    const reason = refundReason.trim()
    const amountInvalid = !(amount > 0)
    const reasonInvalid = reason.length === 0
    setRefundAmountError(amountInvalid)
    setRefundReasonError(reasonInvalid)
    if (amountInvalid || reasonInvalid) return

    setRefundSubmitting(true)
    setRefundError(false)
    try {
      await financeAdminService.requestRefund({ paymentId: refundFor.id, amountUsd: amount, reason })
      setRefundFor(null)
      setRefundSuccess(true)
      await loadRefunds()
    } catch {
      setRefundError(true)
    } finally {
      setRefundSubmitting(false)
    }
  }

  const handleRefundAction = async (id: string, action: 'processed' | 'failed') => {
    setRefundActionError(false)
    setRefundActionId(id)
    try {
      if (action === 'processed') await financeAdminService.markRefundProcessed(id)
      else await financeAdminService.markRefundFailed(id)
      await loadRefunds()
    } catch {
      setRefundActionError(true)
    } finally {
      setRefundActionId(null)
    }
  }

  const visiblePayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          (statusFilter === 'all' || payment.status === statusFilter) &&
          (providerFilter === 'all' || payment.provider === providerFilter),
      ),
    [payments, statusFilter, providerFilter],
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('admin.payments.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('admin.payments.subtitle')}</p>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy">{t('admin.payments.manual.title')}</h2>
        </div>
        <p className="mt-1 text-sm text-slate/70">{t('admin.payments.manual.hint')}</p>

        <form onSubmit={handleSubmit(onValid)} noValidate className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label={t('admin.payments.manual.suiteLabel')}
              id="suiteNumber"
              type="text"
              placeholder={t('admin.payments.manual.suitePlaceholder')}
              error={errors.suiteNumber?.message}
              {...register('suiteNumber')}
            />
            <Button type="button" variant="secondary" onClick={handleLookup} disabled={lookupLoading}>
              {lookupLoading ? t('admin.payments.manual.looking') : t('admin.payments.manual.lookup')}
            </Button>
          </div>

          {customerMatch === 'not_found' && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {t('admin.payments.manual.notFound')}
            </p>
          )}
          {matchFound && (
            <>
              <p role="status" className="mt-2 text-sm font-medium text-success">
                {t('admin.payments.manual.found', { name: matchFound.name, suite: getValues('suiteNumber') })}
              </p>

              <div className="mt-3 rounded-lg border border-slate/10 p-4">
                {consolidationsLoading ? (
                  <p className="text-xs text-slate/60">{t('admin.payments.manual.consolidationsLoading')}</p>
                ) : consolidationsError ? (
                  <p role="alert" className="text-xs text-red-600">
                    {t('admin.payments.manual.consolidationsError')}
                  </p>
                ) : pendingConsolidations.length === 0 ? (
                  <p role="status" className="text-xs font-medium text-amber-600">
                    {t('admin.payments.manual.consolidationsEmpty')}
                  </p>
                ) : (
                  <label htmlFor="consolidationId" className="block text-sm text-navy">
                    {t('admin.payments.manual.consolidationLabel')}
                    <select
                      id="consolidationId"
                      value={selectedConsolidationId}
                      onChange={(event) => handleConsolidationChange(event.target.value)}
                      className={selectClasses}
                    >
                      <option value="">{t('admin.payments.manual.consolidationPlaceholder')}</option>
                      {pendingConsolidations.map((consolidation) => (
                        <option key={consolidation.id} value={consolidation.id}>
                          {consolidation.costUsd != null
                            ? t('admin.payments.manual.consolidationOption', {
                                city: consolidation.city,
                                country: consolidation.country,
                                value: consolidation.costUsd.toFixed(2),
                              })
                            : t('admin.payments.manual.consolidationOptionNoQuote', {
                                city: consolidation.city,
                                country: consolidation.country,
                              })}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {consolidationMissing && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {t('admin.payments.manual.errors.consolidationRequired')}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label={t('admin.payments.manual.amountLabel')}
              id="amountUsd"
              type="number"
              step="0.01"
              error={errors.amountUsd?.message}
              {...register('amountUsd')}
            />
            <label htmlFor="provider" className="block text-navy">
              {t('admin.payments.manual.providerLabel')}
              <select id="provider" className={selectClasses} {...register('provider')}>
                {MANUAL_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {t(`admin.payments.provider.${provider}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label htmlFor="notes" className="mt-4 block text-navy">
            {t('admin.payments.manual.notesLabel')}
            <textarea
              id="notes"
              rows={2}
              placeholder={t('admin.payments.manual.notesPlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              {...register('notes')}
            />
          </label>

          {formError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {t('admin.payments.manual.error')}
            </p>
          )}
          {inconsistency && (
            <p
              role="alert"
              className="mt-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700"
            >
              {t('admin.payments.manual.inconsistency')}
            </p>
          )}
          {formSuccess && (
            <p role="status" className="mt-3 text-sm font-medium text-success">
              {t('admin.payments.manual.success')}
            </p>
          )}

          <div className="mt-4">
            <Button type="submit" disabled={!matchFound || submitting}>
              {submitting ? t('admin.payments.manual.submitting') : t('admin.payments.manual.submit')}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
          <h2 className="text-lg font-semibold text-navy">{t('admin.payments.list.title')}</h2>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="statusFilter" className="block text-xs text-slate/70">
              {t('admin.payments.list.filters.statusLabel')}
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | PaymentStatus)}
                className={selectClasses}
              >
                <option value="all">{t('admin.payments.list.filters.all')}</option>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`admin.payments.status.${status}`)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="providerFilter" className="block text-xs text-slate/70">
              {t('admin.payments.list.filters.providerLabel')}
              <select
                id="providerFilter"
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value as 'all' | PaymentProvider)}
                className={selectClasses}
              >
                <option value="all">{t('admin.payments.list.filters.all')}</option>
                {PAYMENT_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {t(`admin.payments.provider.${provider}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {refundSuccess && (
          <p role="status" className="px-4 pt-3 text-sm font-medium text-success">
            {t('admin.payments.refund.success')}
          </p>
        )}

        {paymentsLoading ? (
          <p className="px-4 py-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : paymentsError ? (
          <p role="alert" className="mx-4 my-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.payments.list.loadError')}
          </p>
        ) : visiblePayments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate/60">{t('admin.payments.list.empty')}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.date')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.customer')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.destination')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.amount')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.provider')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.list.table.status')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('admin.payments.list.table.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {visiblePayments.map((payment) => (
                  <Fragment key={payment.id}>
                    <tr>
                      <td className="px-4 py-3 text-slate">{formatDate(payment.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-navy">{payment.customerName}</td>
                      <td className="px-4 py-3 text-slate">
                        {payment.city || payment.country ? `${payment.city}, ${payment.country}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate">${payment.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate">{t(`admin.payments.provider.${payment.provider}`)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusClasses[payment.status]}`}
                        >
                          {t(`admin.payments.status.${payment.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {payment.status === 'succeeded' && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => openRefundForm(payment)}>
                            {t('admin.payments.refund.button')}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {refundFor?.id === payment.id && (
                      <tr>
                        <td colSpan={7} className="bg-offwhite px-4 py-4">
                          <h3 className="text-sm font-semibold text-navy">{t('admin.payments.refund.formTitle')}</h3>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <Input
                              label={t('admin.payments.refund.amountLabel')}
                              id="refundAmountUsd"
                              type="number"
                              step="0.01"
                              value={refundAmount}
                              onChange={(event) => setRefundAmount(event.target.value)}
                              error={
                                refundAmountError ? t('admin.payments.refund.errors.amountPositive') : undefined
                              }
                            />
                            <label htmlFor="refundReason" className="block text-navy">
                              {t('admin.payments.refund.reasonLabel')}
                              <textarea
                                id="refundReason"
                                rows={2}
                                placeholder={t('admin.payments.refund.reasonPlaceholder')}
                                value={refundReason}
                                onChange={(event) => setRefundReason(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              />
                              {refundReasonError && (
                                <p className="mt-1 text-sm text-red-600">
                                  {t('admin.payments.refund.errors.reasonRequired')}
                                </p>
                              )}
                            </label>
                          </div>
                          {refundError && (
                            <p role="alert" className="mt-3 text-sm text-red-600">
                              {t('admin.payments.refund.error')}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button type="button" size="sm" disabled={refundSubmitting} onClick={handleRefundSubmit}>
                              {refundSubmitting
                                ? t('admin.payments.refund.submitting')
                                : t('admin.payments.refund.submit')}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setRefundFor(null)}>
                              {t('admin.payments.refund.cancel')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-0">
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-navy">{t('admin.payments.refunds.title')}</h2>
          </div>
          {/* Aviso fixo: o estorno REAL no Stripe acontece no dashboard deles. */}
          <p className="mt-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700">
            {t('admin.payments.refunds.stripeNotice')}
          </p>
          {refundActionError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {t('admin.payments.refunds.actionError')}
            </p>
          )}
        </div>

        {refundsLoading ? (
          <p className="px-4 py-4 text-sm text-slate/60">{t('dashboard.loading')}</p>
        ) : refundsError ? (
          <p role="alert" className="mx-4 my-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {t('admin.payments.refunds.loadError')}
          </p>
        ) : refunds.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate/60">{t('admin.payments.refunds.empty')}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.refunds.table.date')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.refunds.table.customer')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.refunds.table.amount')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.refunds.table.reason')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('admin.payments.refunds.table.status')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('admin.payments.refunds.table.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate/10">
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className="px-4 py-3 text-slate">{formatDate(refund.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-navy">{refund.customerName}</td>
                    <td className="px-4 py-3 text-slate">${refund.amountUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate">{refund.reason}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${refundStatusClasses[refund.status]}`}
                      >
                        {t(`admin.payments.refunds.status.${refund.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {refund.status === 'requested' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={refundActionId === refund.id}
                            onClick={() => handleRefundAction(refund.id, 'processed')}
                          >
                            {refundActionId === refund.id
                              ? t('admin.payments.refunds.working')
                              : t('admin.payments.refunds.markProcessed')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={refundActionId === refund.id}
                            onClick={() => handleRefundAction(refund.id, 'failed')}
                          >
                            {t('admin.payments.refunds.markFailed')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
