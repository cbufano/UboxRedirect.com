import { AppRoutes } from './routes'
import { DocumentMeta } from './components/DocumentMeta'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <DocumentMeta />
      <AppRoutes />
    </AuthProvider>
  )
}
