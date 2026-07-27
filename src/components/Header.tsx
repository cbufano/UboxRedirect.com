import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Header() {
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-50 bg-navy text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-bold">{t('brand')}</Link>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
