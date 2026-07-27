import { useTranslation } from 'react-i18next'
import { authService } from '../../services/authService'

export default function Overview() {
  const { t } = useTranslation()
  const user = authService.getSession()

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.nav.overview')}</h1>
      <p className="mt-2 text-sm text-slate">Welcome, {user?.name}</p>
    </div>
  )
}
