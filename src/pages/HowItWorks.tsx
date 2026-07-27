import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, ShoppingCart, PackageCheck, Combine, Globe } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Section } from '../components/ui/Section'

interface Step {
  title: string
  text: string
}

const STEP_ICONS = [MapPin, ShoppingCart, PackageCheck, Combine, Globe]

export default function HowItWorks() {
  const { t } = useTranslation()

  const steps = t('how.steps', { returnObjects: true }) as Step[]

  return (
    <>
      {/* Page hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('how.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('how.subtitle')}</p>
        </div>
      </section>

      {/* Detailed step walkthrough */}
      <Section>
        <div className="mx-auto max-w-3xl">
          <ol className="space-y-10">
            {steps.map((step, index) => {
              const Icon = STEP_ICONS[index]
              return (
                <li key={step.title} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                      {index + 1}
                    </div>
                    {index < steps.length - 1 ? (
                      <div aria-hidden="true" className="mt-2 w-px flex-1 bg-slate/15" />
                    ) : null}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2">
                      {Icon ? <Icon className="h-5 w-5 text-brand" aria-hidden="true" /> : null}
                      <h2 className="text-xl font-semibold text-navy">{step.title}</h2>
                    </div>
                    <p className="mt-2 text-slate">{step.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </Section>

      {/* Mid-page CTA */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">{t('how.cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/90">{t('how.cta.subtitle')}</p>
          <div className="mt-8">
            <Link to="/signup">
              <Button variant="secondary" size="lg">
                {t('how.cta.button')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <Section muted>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-lg text-slate">{t('how.faqTeaser')}</p>
          <div className="mt-6">
            <Link to="/faq">
              <Button variant="ghost" size="lg">
                {t('how.faqButton')}
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}
