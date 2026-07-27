import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Button } from './ui/Button'

const NAV_ITEMS = [
  { to: '/how', key: 'nav.how' },
  { to: '/pricing', key: 'nav.pricing' },
  { to: '/services', key: 'nav.services' },
  { to: '/calculator', key: 'nav.calculator' },
  { to: '/faq', key: 'nav.faq' },
  { to: '/about', key: 'nav.about' },
  { to: '/contact', key: 'nav.contact' },
] as const

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? 'text-brand' : 'text-white/80 hover:text-white'}`

export function Header() {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const closeMenu = () => setIsMenuOpen(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-bold">
          {t('brand')}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClassName}>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link to="/login">
            <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/10">
              {t('nav.login')}
            </Button>
          </Link>
          <Link to="/signup">
            <Button variant="primary" size="sm">
              {t('nav.signup')}
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 md:hidden"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="border-t border-white/10 px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-4 pt-4">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClassName} onClick={closeMenu}>
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <LanguageSwitcher />
            <Link to="/login" onClick={closeMenu}>
              <Button variant="ghost" size="sm" className="w-full !text-white hover:!bg-white/10">
                {t('nav.login')}
              </Button>
            </Link>
            <Link to="/signup" onClick={closeMenu}>
              <Button variant="primary" size="sm" className="w-full">
                {t('nav.signup')}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
