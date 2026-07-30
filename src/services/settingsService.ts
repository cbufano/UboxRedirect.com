/**
 * settingsService — parâmetros operacionais chave-valor (Fase 7.2). Staff lê,
 * admin escreve — quem decide é a RLS (settings_select_staff /
 * settings_write_admin, ver migration 20260731000003_finance.sql). Mesmas
 * convenções de adminService (currentUserId em escrita, `throw new
 * Error(error.message)`, anti-0-linhas com `.select()`).
 */
import { supabase } from '../lib/supabase'

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const settingsService = {
  /** Todas as chaves como Record simples — o chamador parseia o que precisar. */
  async getSettings(): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('settings').select('key, value')
    if (error) throw new Error(error.message)

    const settings: Record<string, string> = {}
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      settings[row.key] = row.value
    }
    return settings
  },

  /**
   * Atualiza uma chave EXISTENTE — nunca insere: o conjunto de chaves é
   * definido pelo seed da migration, e um upsert aqui criaria chaves órfãs
   * que nenhum código lê. 0 linhas afetadas (chave inexistente ou sem
   * permissão de admin) falha alto.
   */
  async updateSetting(key: string, value: string): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select('key')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Setting key does not exist or update not permitted')
  },
}
