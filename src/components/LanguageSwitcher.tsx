import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'

const LABELS: Record<string, string> = { en: 'EN', pt: 'PT', es: 'ES' }

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  return (
    <select
      aria-label="Language"
      value={i18n.resolvedLanguage}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="rounded border border-white/20 bg-transparent px-2 py-1 text-sm"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <option key={lng} value={lng} className="text-slate">{LABELS[lng]}</option>
      ))}
    </select>
  )
}
