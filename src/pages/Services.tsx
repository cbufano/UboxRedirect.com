import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Combine, Package, Camera, ShoppingBag, ShieldCheck, Archive } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'

interface ServiceItem {
  title: string
  text: string
}

const SERVICE_ICONS = [Combine, Package, Camera, ShoppingBag, ShieldCheck, Archive]

export default function Services() {
  const { t } = useTranslation()

  const items = t('services.items', { returnObjects: true }) as ServiceItem[]

  return (
    <>
      {/* Page hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('services.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('services.subtitle')}</p>
        </div>
      </section>

      {/* Services grid */}
      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const Icon = SERVICE_ICONS[index]
            return (
              <Card key={item.title}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                  {Icon ? <Icon className="h-6 w-6 text-brand" aria-hidden="true" /> : null}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-navy">{item.title}</h3>
                <p className="mt-2 text-sm text-slate">{item.text}</p>
                <Link
                  to="/signup"
                  className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
                >
                  {t('nav.signup')}
                </Link>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* CTA band */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">{t('services.cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/90">{t('services.cta.subtitle')}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/signup">
              <Button variant="secondary" size="lg">
                {t('services.cta.button')}
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="ghost" size="lg" className="text-white hover:bg-white/10">
                {t('nav.pricing')}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
