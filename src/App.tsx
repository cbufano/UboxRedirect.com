import { AppRoutes } from './routes'
import { DocumentMeta } from './components/DocumentMeta'
import { AuthProvider } from './contexts/AuthContext'
import { RoleProvider } from './contexts/RoleContext'

export default function App() {
  return (
    <AuthProvider>
      {/* RoleProvider precisa ser filho de AuthProvider: papéis só fazem
          sentido presos a uma sessão (useRole lê o user do AuthContext). */}
      <RoleProvider>
        <DocumentMeta />
        <AppRoutes />
      </RoleProvider>
    </AuthProvider>
  )
}
