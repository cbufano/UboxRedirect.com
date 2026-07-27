import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { Section } from '../components/ui/Section'
import { Accordion } from '../components/ui/Accordion'

interface FaqCategory {
  name: string
  items: { q: string; a: string }[]
}

export default function FAQ() {
  const { t } = useTranslation()

  const categories = t('faq.categories', { returnObjects: true }) as FaqCategory[]

  return (
    <>
      {/* Page hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('faq.title')}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">{t('faq.subtitle')}</p>
        </div>
      </section>

      {/* FAQ categories */}
      <Section>
        <div className="mx-auto max-w-3xl space-y-12">
          {categories.map((category, categoryIndex) => (
            <div key={category.name}>
              <h2 className="text-2xl font-semibold text-navy">{category.name}</h2>
              <div className="mt-4">
                <Accordion
                  items={category.items.map((item, itemIndex) => ({
                    id: `${categoryIndex}-${itemIndex}`,
                    question: item.q,
                    answer: item.a,
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Still have questions CTA */}
      <Section muted>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-navy">{t('faq.cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate">{t('faq.cta.subtitle')}</p>
          <div className="mt-8">
            <Link to="/contact">
              <Button variant="primary" size="lg">
                {t('faq.cta.button')}
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}
