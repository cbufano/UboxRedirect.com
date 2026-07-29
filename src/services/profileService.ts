/**
 * profileService — leitura/edição do perfil do usuário logado e da sua
 * suite. Toda escrita passa por RLS: o usuário só alcança a própria linha.
 */
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  name: string
  email: string
  country: string
  preferredLanguage: string
  suiteNumber: string | null
}

interface ProfileRow {
  id: string
  name: string
  email: string
  country: string
  preferred_language: string
  suites: { suite_number: string } | { suite_number: string }[] | null
}

function mapProfile(row: ProfileRow): Profile {
  const suite = Array.isArray(row.suites) ? row.suites[0] : row.suites
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    country: row.country,
    preferredLanguage: row.preferred_language,
    suiteNumber: suite?.suite_number ?? null,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const profileService = {
  async getMyProfile(): Promise<Profile | null> {
    const userId = await currentUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, country, preferred_language, suites (suite_number)')
      .eq('id', userId)
      .single()
    if (error) throw new Error(error.message)
    return mapProfile(data as ProfileRow)
  },

  async updateMyProfile(input: { name: string; country: string }): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('profiles')
      .update({ name: input.name, country: input.country })
      .eq('id', userId)
    if (error) throw new Error(error.message)

    // O nome do header vem do user_metadata — manter em sincronia.
    const { error: authError } = await supabase.auth.updateUser({
      data: { name: input.name, country: input.country },
    })
    if (authError) throw new Error(authError.message)
  },
}
