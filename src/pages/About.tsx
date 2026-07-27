import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Handshake, PiggyBank, Globe2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'

interface ValueItem {
  title: string
  text: string
}

interface StatItem {
  value: string
  label: string
}

const VALUE_ICONS = [ShieldCheck, Handshake, PiggyBank, Globe2]

export default function About() {
  const { t } = useTranslation()

  const mission = t('about.mission', { returnObjects: true }) as string[]
  const values = t('about.values', { returnObjects: true }) as ValueItem[]
  const stats = t('about.stats', { returnObjects: true }) as StatItem[]

  return (
    <>
      {/* Page hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('about.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('about.subtitle')}</p>
        </div>
      </section>

      {/* Story / mission */}
      <Section>
        <div className="mx-auto max-w-3xl space-y-6">
          {mission.map((paragraph, index) => (
            <p key={index} className="text-slate">
              {paragraph}
            </p>
          ))}
        </div>
      </Section>

      {/* Values */}
      <Section muted>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value, index) => {
            const Icon = VALUE_ICONS[index % VALUE_ICONS.length]
            return (
              <Card key={value.title}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                  <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-navy">{value.title}</h3>
                <p className="mt-2 text-sm text-slate">{value.text}</p>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* Stats band */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold md:text-4xl">{stat.value}</p>
                <p className="mt-2 text-sm text-white/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <Link to="/signup">
            <Button variant="primary" size="lg">
              {t('about.cta')}
            </Button>
          </Link>
        </div>
      </Section>
    </>
  )
}
