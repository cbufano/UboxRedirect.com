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
                <Link to="/about" className="text-sm text-white/70 hover:text-brand transition">
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-white/70 hover:text-brand transition">
                  {t('nav.contact')}
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-sm text-white/70 hover:text-brand transition">
                  {t('nav.faq')}
                </Link>
              </li>
              <li>
                <Link to="/how" className="text-sm text-white/70 hover:text-brand transition">
                  {t('nav.how')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">{t('footer.legal')}</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/terms" className="text-sm text-white/70 hover:text-brand transition">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-sm text-white/70 hover:text-brand transition">
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
                  className="text-sm text-white/70 hover:text-brand transition"
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
