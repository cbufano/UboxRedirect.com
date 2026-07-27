import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'

interface FeeRow {
  service: string
  fee: string
}

export default function Pricing() {
  const { t } = useTranslation()

  const freeFeatures = t('pricing.free.features', { returnObjects: true }) as string[]
  const premiumFeatures = t('pricing.premium.features', { returnObjects: true }) as string[]
  const feeRows = t('pricing.fees.rows', { returnObjects: true }) as FeeRow[]

  return (
    <>
      {/* Page hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('pricing.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('pricing.subtitle')}</p>
        </div>
      </section>

      {/* Plan cards */}
      <Section>
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          {/* Free plan */}
          <Card>
            <h2 className="text-xl font-semibold text-navy">{t('pricing.free.name')}</h2>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-navy">$0</span>
              <span className="text-sm text-slate">{t('pricing.free.priceNote')}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link to="/signup">
                <Button variant="secondary" size="lg" className="w-full">
                  {t('pricing.free.cta')}
                </Button>
              </Link>
            </div>
          </Card>

          {/* Premium plan */}
          <Card className="relative ring-2 ring-brand">
            <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
              {t('pricing.premium.badge')}
            </span>
            <h2 className="text-xl font-semibold text-navy">{t('pricing.premium.name')}</h2>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-navy">{t('pricing.premium.price')}</span>
            </div>
            <p className="mt-1 text-sm text-slate">{t('pricing.premium.priceNote')}</p>
            <ul className="mt-6 space-y-3">
              {premiumFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link to="/signup">
                <Button variant="primary" size="lg" className="w-full">
                  {t('pricing.premium.cta')}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </Section>

      {/* Fee table */}
      <Section muted>
        <h2 className="text-3xl font-bold text-navy">{t('pricing.fees.title')}</h2>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate/15">
                <th scope="col" className="py-3 pr-4 font-semibold text-navy">
                  {t('pricing.fees.serviceLabel')}
                </th>
                <th scope="col" className="py-3 font-semibold text-navy">
                  {t('pricing.fees.feeLabel')}
                </th>
              </tr>
            </thead>
            <tbody>
              {feeRows.map((row) => (
                <tr key={row.service} className="border-b border-slate/10">
                  <td className="py-3 pr-4 text-slate">{row.service}</td>
                  <td className="py-3 font-medium text-navy">{row.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate">{t('pricing.fees.note')}</p>
      </Section>
    </>
  )
}
