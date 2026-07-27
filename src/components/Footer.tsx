import { useTranslation } from 'react-i18next'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="bg-navy text-white/80">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm">
        © {new Date().getFullYear()} {t('brand')}
      </div>
    </footer>
  )
}
