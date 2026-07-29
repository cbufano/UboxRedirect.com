import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-center text-slate/60">{t('dashboard.loading')}</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
