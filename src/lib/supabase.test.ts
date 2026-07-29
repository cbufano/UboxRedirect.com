import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { supabase } from './supabase'

describe('supabase client', () => {
  it('exports a configured client', () => {
    expect(supabase).toBeDefined()
    expect(supabase.auth).toBeDefined()
  })
})

describe('supabase client env validation', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws a clear error when VITE_SUPABASE_URL is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    await expect(import('./supabase')).rejects.toThrow(/Missing VITE_SUPABASE_URL/)
  })

  it('throws a clear error when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    await expect(import('./supabase')).rejects.toThrow(/VITE_SUPABASE_ANON_KEY/)
  })
})
