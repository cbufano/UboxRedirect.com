import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { roleService, type AppRole } from '../services/roleService'
import { useAuth } from './AuthContext'

interface RoleContextValue {
  roles: AppRole[]
  loading: boolean
}

const RoleContext = createContext<RoleContextValue>({ roles: [], loading: true })

export function RoleProvider({ children }: { children: ReactNode }) {
  // Papéis só fazem sentido presos a uma sessão — reagimos a mudanças de
  // usuário (login/logout/troca de conta) para nunca vazar os papéis do
  // usuário anterior para a sessão seguinte.
  const { user } = useAuth()
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    roleService.getMyRoles().then((result) => {
      if (!active) return
      setRoles(result)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [user?.id])

  return <RoleContext.Provider value={{ roles, loading }}>{children}</RoleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRole(): RoleContextValue {
  return useContext(RoleContext)
}
