import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="bg-navy text-white/80">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="text-white font-bold">{t('brand')}</p>
            <p className="mt-2 text-sm text-white/70">{t('footer.pitch')}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">{t('footer.company')}</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/about" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('nav.contact')}
                </Link>
              </li>
              <li>
                <Link to="/faq" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('nav.faq')}
                </Link>
              </li>
              <li>
                <Link to="/how" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('nav.how')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">{t('footer.legal')}</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/terms" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy">
                  {t('footer.privacy')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">{t('footer.contactTitle')}</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="mailto:support@bufanoredirect.com"
                  className="rounded text-sm text-white/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                >
                  support@bufanoredirect.com
                </a>
              </li>
              <li className="text-sm text-white/70">{t('footer.hours')}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm">
          © {new Date().getFullYear()} {t('brand')}. {t('footer.rights')}
        </div>
      </div>
    </footer>
  )
}
