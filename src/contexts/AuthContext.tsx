import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authService, type User } from '../services/authService'

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    authService.getSession().then((sessionUser) => {
      if (!active) return
      setUser(sessionUser)
      setLoading(false)
    })

    const unsubscribe = authService.onAuthStateChange((changedUser) => {
      if (!active) return
      setUser(changedUser)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
