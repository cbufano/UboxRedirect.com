import { useMemo, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Boxes, Truck, FileText, CheckCircle2 } from 'lucide-react'
import { packages } from '../../mocks/packages'
import { estimateShipping, type EstimateResult } from '../../lib/shippingEstimator'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const COUNTRY_CODES = ['BR', 'US', 'PT', 'ES', 'MX', 'AR', 'GB', 'OTHER'] as const

// Consolidated box dimensions assumed for the estimate, in centimeters.
const BOX_DIMENSION_CM = 40

interface OrderConfirmation {
  reference: string
  destinationCountry: string
  carrier: string
  costUsd: number
}

export default function Ship() {
  const { t } = useTranslation()
  const location = useLocation()

  const selectedIds = (location.state as { selectedIds?: string[] } | null)?.selectedIds
  const selected =
    selectedIds && selectedIds.length > 0
      ? packages.filter((pkg) => selectedIds.includes(pkg.id))
      : packages

  const totalWeightKg = useMemo(
    () => Math.round(selected.reduce((sum, pkg) => sum + pkg.weightKg, 0) * 100) / 100,
    [selected],
  )

  const [destinationCountry, setDestinationCountry] = useState<string>('BR')
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderConfirmation | null>(null)

  const estimate: EstimateResult | null = useMemo(() => {
    if (totalWeightKg <= 0) return null
    try {
      return estimateShipping({
        destinationCountry,
        weightKg: totalWeightKg,
        lengthCm: BOX_DIMENSION_CM,
        widthCm: BOX_DIMENSION_CM,
        heightCm: BOX_DIMENSION_CM,
      })
    } catch {
      return null
    }
  }, [destinationCountry, totalWeightKg])

  const chosenCarrierName = selectedCarrier ?? estimate?.options[0]?.carrier ?? null
  const chosenOption = estimate?.options.find((option) => option.carrier === chosenCarrierName) ?? null

  const contentsRequiredMessage = t('dashboard.ship.customs.errors.contentsRequired')
  const valuePositiveMessage = t('dashboard.ship.customs.errors.valuePositive')

  const schema = z.object({
    contentsDescription: z.string().min(3, { message: contentsRequiredMessage }),
    declaredValueUsd: z.coerce.number().positive({ message: valuePositiveMessage }),
  })

  type FormInput = z.input<typeof schema>
  type FormOutput = z.output<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      contentsDescription: '',
      declaredValueUsd: undefined,
    },
  })

  const onValid: SubmitHandler<FormOutput> = (values) => {
    if (!chosenOption) return
    const reference = `${destinationCountry}${selected.length}-${Math.round(values.declaredValueUsd)}`
    setOrder({
      reference,
      destinationCountry,
      carrier: chosenOption.carrier,
      costUsd: chosenOption.costUsd,
    })
  }

  if (order) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy">{t('dashboard.ship.title')}</h1>
        <Card className="mt-6 max-w-xl" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-navy">
                {t('dashboard.ship.confirmation.title')}
              </h2>
              <dl className="mt-3 space-y-1 text-sm text-slate">
                <p>{t('dashboard.ship.confirmation.reference', { reference: order.reference })}</p>
                <p>
                  {t('dashboard.ship.confirmation.destination', {
                    country: t(`dashboard.ship.destination.countries.${order.destinationCountry}`),
                  })}
                </p>
                <p>{t('dashboard.ship.confirmation.carrier', { carrier: order.carrier })}</p>
                <p>
                  {t('dashboard.ship.confirmation.cost', { cost: order.costUsd.toFixed(2) })}
                </p>
              </dl>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (selected.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy">{t('dashboard.ship.title')}</h1>
        <Card className="mt-6">
          <p className="text-sm text-slate/70">{t('dashboard.ship.empty')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.ship.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.ship.subtitle')}</p>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy">{t('dashboard.ship.summary.title')}</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate/10 text-xs font-medium uppercase tracking-wide text-slate/50">
                <th scope="col" className="px-2 py-2">
                  {t('dashboard.ship.summary.table.store')}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t('dashboard.ship.summary.table.description')}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t('dashboard.ship.summary.table.weight')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {selected.map((pkg) => (
                <tr key={pkg.id}>
                  <td className="px-2 py-2 font-medium text-navy">{pkg.store}</td>
                  <td className="px-2 py-2 text-slate">{pkg.description}</td>
                  <td className="px-2 py-2 text-slate">{pkg.weightKg} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm font-medium text-navy">
          {t('dashboard.ship.summary.totalWeight', { weight: totalWeightKg })}
        </p>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-navy">{t('dashboard.ship.destination.title')}</h2>
        </div>

        <label htmlFor="destinationCountry" className="mt-4 block max-w-xs">
          {t('dashboard.ship.destination.countryLabel')}
          <select
            id="destinationCountry"
            className="mt-1 w-full rounded-lg border border-slate/20 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            value={destinationCountry}
            onChange={(event) => setDestinationCountry(event.target.value)}
          >
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`dashboard.ship.destination.countries.${code}`)}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-3 text-xs text-slate/60">{t('dashboard.ship.destination.boxNote')}</p>

        {estimate && (
          <>
            <p className="mt-4 text-sm text-slate">
              {t('dashboard.ship.destination.chargeableWeight', {
                weight: estimate.chargeableWeightKg,
              })}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {estimate.options.map((option) => {
                const isChecked = chosenCarrierName === option.carrier
                return (
                  <label
                    key={option.carrier}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition ${
                      isChecked ? 'border-brand bg-brand/5' : 'border-slate/20 hover:border-slate/40'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="carrier"
                        value={option.carrier}
                        checked={isChecked}
                        onChange={() => setSelectedCarrier(option.carrier)}
                        className="h-4 w-4 text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      />
                      <span className="font-semibold text-navy">{option.carrier}</span>
                    </span>
                    <span className="text-sm text-slate">
                      {t('dashboard.ship.destination.eta', { days: option.etaDays })}
                    </span>
                    <span className="text-lg font-bold text-navy">
                      {t('dashboard.ship.destination.cost', { cost: option.costUsd.toFixed(2) })}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <form onSubmit={handleSubmit(onValid)} noValidate>
        <Card className="mt-6">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-navy">{t('dashboard.ship.customs.title')}</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label={t('dashboard.ship.customs.contentsLabel')}
              id="contentsDescription"
              type="text"
              error={errors.contentsDescription?.message}
              {...register('contentsDescription')}
            />
            <Input
              label={t('dashboard.ship.customs.valueLabel')}
              id="declaredValueUsd"
              type="number"
              step="0.01"
              error={errors.declaredValueUsd?.message}
              {...register('declaredValueUsd')}
            />
          </div>
        </Card>

        {chosenOption && (
          <Card className="mt-6 max-w-md">
            <h2 className="text-lg font-semibold text-navy">{t('dashboard.ship.costSummary.title')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate/70">{t('dashboard.ship.costSummary.chargeableWeight')}</dt>
                <dd className="font-medium text-navy">{estimate?.chargeableWeightKg} kg</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate/70">{t('dashboard.ship.costSummary.carrier')}</dt>
                <dd className="font-medium text-navy">{chosenOption.carrier}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate/10 pt-2">
                <dt className="font-semibold text-navy">{t('dashboard.ship.costSummary.total')}</dt>
                <dd className="text-lg font-bold text-navy">${chosenOption.costUsd.toFixed(2)}</dd>
              </div>
            </dl>
          </Card>
        )}

        <div className="mt-6">
          <Button type="submit" variant="primary" size="lg" disabled={!chosenOption}>
            {t('dashboard.ship.placeOrder')}
          </Button>
        </div>
      </form>
    </div>
  )
}
