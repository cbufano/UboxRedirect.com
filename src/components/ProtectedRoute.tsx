import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authService } from '../services/authService'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = authService.getSession()
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
