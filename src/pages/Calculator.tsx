import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { rateService, type RateEstimate } from '../services/rateService'

const COUNTRY_CODES = ['BR', 'US', 'PT', 'ES', 'MX', 'AR', 'GB', 'OTHER'] as const

export default function Calculator() {
  const { t } = useTranslation()
  const [result, setResult] = useState<RateEstimate | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [calculating, setCalculating] = useState(false)

  const positiveMessage = t('calculator.form.errors.positive')
  const countryMessage = t('calculator.form.errors.country')

  const schema = z.object({
    destinationCountry: z.string().min(1, { message: countryMessage }),
    weightKg: z.coerce.number().positive({ message: positiveMessage }),
    lengthCm: z.coerce.number().positive({ message: positiveMessage }),
    widthCm: z.coerce.number().positive({ message: positiveMessage }),
    heightCm: z.coerce.number().positive({ message: positiveMessage }),
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
      destinationCountry: '',
      weightKg: undefined,
      lengthCm: undefined,
      widthCm: undefined,
      heightCm: undefined,
    },
  })

  const onSubmit: SubmitHandler<FormOutput> = async (values) => {
    setCalcError(null)
    setResult(null)
    setCalculating(true)
    try {
      const estimate = await rateService.estimateShippingCost(values)
      setResult(estimate)
    } catch {
      setResult(null)
      setCalcError(t('calculator.result.error'))
    } finally {
      setCalculating(false)
    }
  }

  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            {t('calculator.title')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('calculator.subtitle')}</p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-2xl">
          <Card>
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="block">
                <label htmlFor="destinationCountry" className="block">
                  {t('calculator.form.countryLabel')}
                  <select
                    id="destinationCountry"
                    className="mt-1 w-full rounded-lg border border-slate/20 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-invalid={errors.destinationCountry ? true : undefined}
                    aria-describedby={
                      errors.destinationCountry ? 'destinationCountry-error' : undefined
                    }
                    defaultValue=""
                    {...register('destinationCountry')}
                  >
                    <option value="" disabled>
                      {t('calculator.form.countryPlaceholder')}
                    </option>
                    {COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {t(`calculator.form.countries.${code}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {errors.destinationCountry && (
                  <p id="destinationCountry-error" className="mt-1 text-sm text-red-600">
                    {errors.destinationCountry.message}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <Input
                  label={t('calculator.form.weightLabel')}
                  id="weightKg"
                  type="number"
                  step="0.1"
                  error={errors.weightKg?.message}
                  {...register('weightKg')}
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Input
                  label={t('calculator.form.lengthLabel')}
                  id="lengthCm"
                  type="number"
                  step="0.1"
                  error={errors.lengthCm?.message}
                  {...register('lengthCm')}
                />
                <Input
                  label={t('calculator.form.widthLabel')}
                  id="widthCm"
                  type="number"
                  step="0.1"
                  error={errors.widthCm?.message}
                  {...register('widthCm')}
                />
                <Input
                  label={t('calculator.form.heightLabel')}
                  id="heightCm"
                  type="number"
                  step="0.1"
                  error={errors.heightCm?.message}
                  {...register('heightCm')}
                />
              </div>

              <div className="mt-6">
                <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto">
                  {t('calculator.form.submit')}
                </Button>
              </div>
            </form>

            {calculating && (
              <p className="mt-4 text-sm text-slate/60" role="status">
                {t('calculator.result.calculating')}
              </p>
            )}

            {calcError && (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {calcError}
              </p>
            )}

            {result && (
              <div className="mt-8 border-t border-slate/10 pt-8">
                <h2 className="text-xl font-semibold text-navy">{t('calculator.result.title')}</h2>
                <p className="mt-2 text-sm text-slate">
                  {t('calculator.result.chargeable', { weight: result.chargeableWeightKg })}
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate/15">
                        <th scope="col" className="py-3 pr-4 font-semibold text-navy">
                          {t('calculator.result.carrier')}
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold text-navy">
                          {t('calculator.result.eta')}
                        </th>
                        <th scope="col" className="py-3 font-semibold text-navy">
                          {t('calculator.result.cost')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.options.map((option) => (
                        <tr key={option.carrier} className="border-b border-slate/10">
                          <td className="py-3 pr-4 text-slate">{option.carrier}</td>
                          <td className="py-3 pr-4 text-slate">{option.etaDays}</td>
                          <td className="py-3 font-medium text-navy">
                            ${option.costUsd.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-xs text-slate">{t('calculator.result.note')}</p>
              </div>
            )}
          </Card>
        </div>
      </Section>
    </>
  )
}
