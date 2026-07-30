import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { DashboardLayout } from './layouts/DashboardLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { StaffRoute } from './components/StaffRoute'

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
const DashboardPrivacy = lazy(() => import('./pages/dashboard/Privacy'))
const AdminOverview = lazy(() => import('./pages/admin/Overview'))
const AdminPackagesQueue = lazy(() => import('./pages/admin/PackagesQueue'))
const AdminPackageDetail = lazy(() => import('./pages/admin/PackageDetail'))
const AdminConsolidationsQueue = lazy(() => import('./pages/admin/ConsolidationsQueue'))
const AdminWarehouse = lazy(() => import('./pages/admin/Warehouse'))
const AdminPayments = lazy(() => import('./pages/admin/Payments'))
const AdminDataRequestsQueue = lazy(() => import('./pages/admin/DataRequestsQueue'))

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
          <Route path="privacy" element={<DashboardPrivacy />} />
          {/* /app/* child routes added as their tasks complete */}
        </Route>
        <Route path="/admin" element={<StaffRoute><AdminLayout /></StaffRoute>}>
          <Route index element={<AdminOverview />} />
          <Route path="packages" element={<AdminPackagesQueue />} />
          <Route path="packages/:id" element={<AdminPackageDetail />} />
          <Route path="consolidations" element={<AdminConsolidationsQueue />} />
          <Route path="warehouse" element={<AdminWarehouse />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="data-requests" element={<AdminDataRequestsQueue />} />
          {/* /admin/* child routes added as their tasks complete */}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
