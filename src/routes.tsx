import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import Home from './pages/Home'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        {/* public routes added as their tasks complete */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
