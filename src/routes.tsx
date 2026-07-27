import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<div className="mx-auto max-w-6xl p-8">Home</div>} />
        {/* public routes added as their tasks complete */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
