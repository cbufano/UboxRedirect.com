import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Section } from '../components/ui/Section'

interface LegalSection {
  heading: string
  body: string
}

export default function Privacy() {
  const { t } = useTranslation()

  const sections = t('privacy.sections', { returnObjects: true }) as LegalSection[]

  return (
    <>
      {/* Page header */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t('privacy.title')}</h1>
          <p className="mt-4 text-sm text-white/70">{t('privacy.updated')}</p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-3xl">
          {/* Draft notice */}
          <div
            role="note"
            className="mb-10 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p>{t('privacy.draftNotice')}</p>
          </div>

          {/* Legal sections */}
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.heading}>
                <h2 className="text-xl font-semibold text-navy">{section.heading}</h2>
                <p className="mt-3 text-slate">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </>
  )
}
