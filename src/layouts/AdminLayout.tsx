import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, PackageSearch, Boxes, Warehouse, CreditCard, Tags, Users, UserCog, ShieldCheck, FileClock, Settings, Menu, X } from 'lucide-react'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Button } from '../components/ui/Button'
import { authService } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/admin', key: 'admin.nav.overview', icon: LayoutDashboard, end: true },
  { to: '/admin/packages', key: 'admin.nav.packages', icon: PackageSearch, end: false },
  { to: '/admin/consolidations', key: 'admin.nav.consolidations', icon: Boxes, end: false },
  { to: '/admin/warehouse', key: 'admin.nav.warehouse', icon: Warehouse, end: false },
  { to: '/admin/payments', key: 'admin.nav.payments', icon: CreditCard, end: false },
  { to: '/admin/rates', key: 'admin.nav.rates', icon: Tags, end: false },
  { to: '/admin/customers', key: 'admin.nav.customers', icon: Users, end: false },
  { to: '/admin/staff', key: 'admin.nav.staff', icon: UserCog, end: false },
  { to: '/admin/data-requests', key: 'admin.nav.dataRequests', icon: FileClock, end: false },
  { to: '/admin/settings', key: 'admin.nav.settings', icon: Settings, end: false },
] as const

// Acento âmbar (em vez do azul/navy do dashboard de cliente) + badge "STAFF"
// no topo do sidebar — sinal visual rápido de que esta é uma área interna,
// para ninguém confundir o painel de operação com o painel do cliente.
const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate ${
    isActive ? 'bg-amber-400/15 text-amber-300' : 'text-white/70 hover:bg-white/5 hover:text-white'
  }`

export function AdminLayout() {
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
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClassName} onClick={closeSidebar}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {t(item.key)}
          </NavLink>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-slate py-4 text-white transition-transform md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link to="/admin" className="flex items-center gap-2 px-4 pb-4" onClick={closeSidebar}>
          <span className="text-lg font-bold">{t('brand')}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t('admin.staffBadge')}
          </span>
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
