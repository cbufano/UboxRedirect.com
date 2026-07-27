import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const TITLE_KEYS: Record<string, string> = {
  '/': 'meta.home',
  '/how': 'meta.how',
  '/pricing': 'meta.pricing',
  '/services': 'meta.services',
  '/calculator': 'meta.calculator',
  '/faq': 'meta.faq',
  '/about': 'meta.about',
  '/contact': 'meta.contact',
  '/terms': 'meta.terms',
  '/privacy': 'meta.privacy',
  '/login': 'meta.login',
  '/signup': 'meta.signup',
  '/forgot': 'meta.forgot',
  '/verify': 'meta.verify',
  '/app': 'meta.dashboard',
  '/app/address': 'meta.address',
  '/app/inbox': 'meta.inbox',
  '/app/ship': 'meta.ship',
  '/app/shipments': 'meta.shipments',
  '/app/shopper': 'meta.shopper',
  '/app/account': 'meta.account',
}

export function DocumentMeta() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const key = TITLE_KEYS[pathname]
    document.title = key ? `${t(key)} · ${t('brand')}` : t('brand')

    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', t('meta.description'))
  }, [pathname, t, i18n.language])

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  }, [i18n.language, i18n.resolvedLanguage])

  return null
}
