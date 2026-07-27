import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface ShopperRequest {
  id: string
  productUrl: string
  quantity: number
  maxBudgetUsd: number
  notes?: string
}

export default function Shopper() {
  const { t } = useTranslation()
  const [requests, setRequests] = useState<ShopperRequest[]>([])
  const [justSubmitted, setJustSubmitted] = useState(false)

  const urlInvalidMessage = t('dashboard.shopper.form.errors.urlInvalid')
  const quantityPositiveMessage = t('dashboard.shopper.form.errors.quantityPositive')
  const budgetPositiveMessage = t('dashboard.shopper.form.errors.budgetPositive')

  const schema = z.object({
    productUrl: z.string().url({ message: urlInvalidMessage }),
    quantity: z.coerce.number().int().positive({ message: quantityPositiveMessage }),
    maxBudgetUsd: z.coerce.number().positive({ message: budgetPositiveMessage }),
    notes: z.string().optional(),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      productUrl: '',
      quantity: undefined,
      maxBudgetUsd: undefined,
      notes: '',
    },
  })

  const onValid: SubmitHandler<FormOutput> = (values) => {
    const request: ShopperRequest = {
      id: `req-${Date.now()}`,
      productUrl: values.productUrl,
      quantity: values.quantity,
      maxBudgetUsd: values.maxBudgetUsd,
      notes: values.notes,
    }
    setRequests((prev) => [request, ...prev])
    setJustSubmitted(true)
    reset()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.shopper.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.shopper.subtitle')}</p>

      <form
        onSubmit={handleSubmit(onValid)}
        noValidate
        onChange={() => setJustSubmitted(false)}
      >
        <Card className="mt-6 max-w-xl">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-navy">{t('dashboard.shopper.title')}</h2>
          </div>

          <div className="mt-4 space-y-4">
            <Input
              label={t('dashboard.shopper.form.productUrl')}
              id="productUrl"
              type="text"
              placeholder={t('dashboard.shopper.form.productUrlPlaceholder')}
              error={errors.productUrl?.message}
              {...register('productUrl')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('dashboard.shopper.form.quantity')}
                id="quantity"
                type="number"
                min={1}
                step={1}
                error={errors.quantity?.message}
                {...register('quantity')}
              />
              <Input
                label={t('dashboard.shopper.form.maxBudget')}
                id="maxBudgetUsd"
                type="number"
                min={0}
                step="0.01"
                error={errors.maxBudgetUsd?.message}
                {...register('maxBudgetUsd')}
              />
            </div>

            <label htmlFor="notes" className="block">
              {t('dashboard.shopper.form.notes')}
              <textarea
                id="notes"
                rows={3}
                placeholder={t('dashboard.shopper.form.notesPlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate/20 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                {...register('notes')}
              />
            </label>
          </div>

          <div className="mt-6">
            <Button type="submit" variant="primary" size="lg">
              {t('dashboard.shopper.form.submit')}
            </Button>
          </div>
        </Card>
      </form>

      {justSubmitted && (
        <Card className="mt-6 max-w-xl" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
            <p className="text-sm text-navy">{t('dashboard.shopper.confirmation')}</p>
          </div>
        </Card>
      )}

      {requests.length > 0 && (
        <Card className="mt-6 max-w-xl">
          <h2 className="text-lg font-semibold text-navy">{t('dashboard.shopper.requestsTitle')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate">
            {requests.map((request) => (
              <li key={request.id} className="border-t border-slate/10 pt-2 first:border-t-0 first:pt-0">
                {t('dashboard.shopper.requestItem', {
                  quantity: request.quantity,
                  url: request.productUrl,
                })}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
