import { Outlet, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export function DashboardLayout() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-navy text-white p-4">
        <p className="font-bold">Bufano</p>
        {/* Task 24 will add the real sidebar nav */}
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end gap-3 border-b bg-white px-4 py-3">
          <LanguageSwitcher />
          <button onClick={() => navigate('/')} className="text-sm text-brand">Sign out</button>
        </div>
        <main className="flex-1 bg-offwhite p-6"><Outlet /></main>
      </div>
    </div>
  )
}
