/**
 * authService — camada de isolamento de autenticação, agora sobre Supabase.
 * Consumidores nunca importam o supabase-js diretamente para auth: sempre
 * este módulo. Toda a API é assíncrona.
 */
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/** Versão dos Termos aceitos no cadastro — gravada em consents pelo trigger. */
export const TERMS_VERSION = '2026-07-29'

export interface User {
  id: string
  name: string
  email: string
  country: string
}

export interface RegisterInput {
  name: string
  email: string
  country: string
  password: string
}

export interface RegisterResult {
  user: User | null
  /** true quando o Supabase exige confirmação por e-mail antes do login. */
  needsEmailConfirmation: boolean
}

function mapUser(supabaseUser: SupabaseUser | null | undefined): User | null {
  if (!supabaseUser) return null
  const metadata = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>
  return {
    id: supabaseUser.id,
    name: typeof metadata.name === 'string' ? metadata.name : '',
    email: supabaseUser.email ?? '',
    country: typeof metadata.country === 'string' ? metadata.country : '',
  }
}

export const authService = {
  async register(data: RegisterInput): Promise<RegisterResult> {
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          country: data.country,
          terms_accepted: true,
          terms_version: TERMS_VERSION,
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw new Error(error.message)
    return { user: mapUser(result.user), needsEmailConfirmation: !result.session }
  },

  async login(email: string, password: string): Promise<User> {
    const { data: result, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const user = mapUser(result.user)
    if (!user) throw new Error('Invalid credentials')
    return user
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  async getSession(): Promise<User | null> {
    const { data } = await supabase.auth.getSession()
    return mapUser(data.session?.user)
  },

  /** Observa mudanças de sessão; retorna a função de unsubscribe. */
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(mapUser(session?.user))
    })
    return () => data.subscription.unsubscribe()
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  },
}
