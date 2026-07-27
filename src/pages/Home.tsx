import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  MapPin,
  ShoppingCart,
  PackageCheck,
  Combine,
  Globe,
  PiggyBank,
  Camera,
  Archive,
  UserCheck,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'

interface TextItem {
  title: string
  text: string
}

interface Testimonial {
  quote: string
  name: string
  country: string
}

const STEP_ICONS = [MapPin, ShoppingCart, PackageCheck, Combine, Globe]

const BENEFIT_ICONS = [PiggyBank, Camera, Archive, Globe, UserCheck, ShieldCheck]

const POPULAR_STORES = ['Amazon', 'eBay', 'Walmart', 'Target', 'Best Buy', 'Sephora', 'Nike', 'Apple']

export default function Home() {
  const { t } = useTranslation()

  const steps = t('home.steps.items', { returnObjects: true }) as TextItem[]
  const benefits = t('home.benefits.items', { returnObjects: true }) as TextItem[]
  const testimonials = t('home.testimonials.items', { returnObjects: true }) as Testimonial[]

  return (
    <>
      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
          <div>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('home.hero.title')}</h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">{t('home.hero.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/signup">
                <Button variant="primary" size="lg">
                  {t('home.hero.ctaPrimary')}
                </Button>
              </Link>
              <Link to="/how">
                <Button variant="ghost" size="lg" className="text-white hover:bg-white/10">
                  {t('home.hero.ctaSecondary')}
                </Button>
              </Link>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="hidden h-64 rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-transparent md:block"
          />
        </div>
      </section>

      {/* How it works */}
      <Section>
        <h2 className="text-3xl font-bold text-navy">{t('home.steps.title')}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[index]
            return (
              <Card key={step.title}>
                <div className="flex items-center gap-3">
                  {Icon ? <Icon className="h-6 w-6 text-brand" aria-hidden="true" /> : null}
                  <span className="text-sm font-semibold text-brand">{index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-navy">{step.title}</h3>
                <p className="mt-2 text-sm text-slate">{step.text}</p>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* Benefits */}
      <Section muted>
        <h2 className="text-3xl font-bold text-navy">{t('home.benefits.title')}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => {
            const Icon = BENEFIT_ICONS[index]
            return (
              <Card key={benefit.title}>
                {Icon ? <Icon className="h-6 w-6 text-brand" aria-hidden="true" /> : null}
                <h3 className="mt-4 font-semibold text-navy">{benefit.title}</h3>
                <p className="mt-2 text-sm text-slate">{benefit.text}</p>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* Popular stores */}
      <Section>
        <h2 className="text-3xl font-bold text-navy">{t('home.stores.title')}</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          {POPULAR_STORES.map((store) => (
            <span key={store} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-navy ring-1 ring-slate/10">
              {store}
            </span>
          ))}
        </div>
      </Section>

      {/* Savings example */}
      <Section muted>
        <h2 className="text-3xl font-bold text-navy">{t('home.savings.title')}</h2>
        <Card className="mt-10">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-navy">{t('home.savings.separate.title')}</h3>
              <p className="mt-2 text-sm text-slate">{t('home.savings.separate.desc')}</p>
              <p className="mt-4 text-2xl font-bold text-navy">{t('home.savings.separate.amount')}</p>
            </div>
            <div>
              <h3 className="font-semibold text-navy">{t('home.savings.consolidated.title')}</h3>
              <p className="mt-2 text-sm text-slate">{t('home.savings.consolidated.desc')}</p>
              <p className="mt-4 text-2xl font-bold text-navy">{t('home.savings.consolidated.amount')}</p>
            </div>
          </div>
          <div className="mt-8 border-t border-slate/10 pt-6">
            <p className="text-sm font-medium text-slate">{t('home.savings.savingsLabel')}</p>
            <p className="text-3xl font-bold text-success">{t('home.savings.savingsAmount')}</p>
            <p className="mt-2 text-xs text-slate">{t('home.savings.note')}</p>
          </div>
        </Card>
      </Section>

      {/* Testimonials */}
      <Section>
        <h2 className="text-3xl font-bold text-navy">{t('home.testimonials.title')}</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name}>
              <p className="text-sm italic text-slate">&ldquo;{testimonial.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-semibold text-navy">{testimonial.name}</p>
              <p className="text-xs text-slate">{testimonial.country}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">{t('home.cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/90">{t('home.cta.subtitle')}</p>
          <div className="mt-8">
            <Link to="/signup">
              <Button variant="secondary" size="lg">
                {t('home.cta.button')}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
