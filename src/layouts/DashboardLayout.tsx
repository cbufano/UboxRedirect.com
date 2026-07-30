import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  MapPin,
  PackageSearch,
  Inbox,
  PackagePlus,
  Truck,
  ShoppingBag,
  UserCircle,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Button } from '../components/ui/Button'
import { authService } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/app', key: 'dashboard.nav.overview', icon: LayoutDashboard, end: true },
  { to: '/app/address', key: 'dashboard.nav.address', icon: MapPin, end: false },
  { to: '/app/notify', key: 'dashboard.nav.notify', icon: PackageSearch, end: false },
  { to: '/app/inbox', key: 'dashboard.nav.inbox', icon: Inbox, end: false },
  { to: '/app/ship', key: 'dashboard.nav.ship', icon: PackagePlus, end: false },
  { to: '/app/shipments', key: 'dashboard.nav.shipments', icon: Truck, end: false },
  { to: '/app/shopper', key: 'dashboard.nav.shopper', icon: ShoppingBag, end: false },
  { to: '/app/account', key: 'dashboard.nav.account', icon: UserCircle, end: false },
  { to: '/app/privacy', key: 'dashboard.nav.privacy', icon: ShieldCheck, end: false },
] as const

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy ${
    isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
  }`

export function DashboardLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const closeSidebar = () => setIsSidebarOpen(false)

  const handleSignOut = async () => {
    await authService.logout()
    navigate('/')
  }

  const navLinks = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={navLinkClassName}
            onClick={closeSidebar}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {t(item.key)}
          </NavLink>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-navy py-4 text-white transition-transform md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link to="/app" className="px-4 pb-4 text-lg font-bold" onClick={closeSidebar}>
          {t('brand')}
        </Link>
        {navLinks}
      </aside>

      <div className="flex flex-1 flex-col md:pl-0">
        <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 md:hidden"
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            {isSidebarOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user?.name && <span className="text-sm font-medium text-navy">{user.name}</span>}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              {t('dashboard.signOut')}
            </Button>
          </div>
        </div>

        <main className="flex-1 bg-offwhite p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
