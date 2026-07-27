import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Pricing from './pages/Pricing'
import Services from './pages/Services'
import Calculator from './pages/Calculator'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="how" element={<HowItWorks />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="services" element={<Services />} />
        <Route path="calculator" element={<Calculator />} />
        {/* public routes added as their tasks complete */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
