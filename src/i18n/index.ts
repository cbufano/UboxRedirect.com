import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enCommon from './locales/en/common.json'
import ptCommon from './locales/pt/common.json'
import esCommon from './locales/es/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'] as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      pt: { common: ptCommon },
      es: { common: esCommon },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
