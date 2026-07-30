import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { DashboardLayout } from './layouts/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'

const Home = lazy(() => import('./pages/Home'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Services = lazy(() => import('./pages/Services'))
const Calculator = lazy(() => import('./pages/Calculator'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Contact = lazy(() => import('./pages/Contact'))
const About = lazy(() => import('./pages/About'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Login = lazy(() => import('./pages/auth/Login'))
const Signup = lazy(() => import('./pages/auth/Signup'))
const Forgot = lazy(() => import('./pages/auth/Forgot'))
const Verify = lazy(() => import('./pages/auth/Verify'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Overview = lazy(() => import('./pages/dashboard/Overview'))
const Address = lazy(() => import('./pages/dashboard/Address'))
const NotifyPurchase = lazy(() => import('./pages/dashboard/NotifyPurchase'))
const Inbox = lazy(() => import('./pages/dashboard/Inbox'))
const Ship = lazy(() => import('./pages/dashboard/Ship'))
const Shipments = lazy(() => import('./pages/dashboard/Shipments'))
const Shopper = lazy(() => import('./pages/dashboard/Shopper'))
const Account = lazy(() => import('./pages/dashboard/Account'))

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate/60">Loading…</div>}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="how" element={<HowItWorks />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="services" element={<Services />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="contact" element={<Contact />} />
          <Route path="about" element={<About />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot" element={<Forgot />} />
          <Route path="verify" element={<Verify />} />
          <Route path="reset-password" element={<ResetPassword />} />
          {/* public routes added as their tasks complete */}
        </Route>
        <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Overview />} />
          <Route path="address" element={<Address />} />
          <Route path="notify" element={<NotifyPurchase />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="ship" element={<Ship />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shopper" element={<Shopper />} />
          <Route path="account" element={<Account />} />
          {/* /app/* child routes added as their tasks complete */}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
