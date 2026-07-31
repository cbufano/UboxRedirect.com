import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { settingsService } from './settingsService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('getSettings', () => {
  it('returns all keys as a plain record', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        { key: 'free_storage_days', value: '30' },
        { key: 'paid_unshipped_alert_days', value: '2' },
      ],
      error: null,
    })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const settings = await settingsService.getSettings()

    expect(mockedSupabase.from).toHaveBeenCalledWith('settings')
    expect(select).toHaveBeenCalledWith('key, value')
    expect(settings).toEqual({ free_storage_days: '30', paid_unshipped_alert_days: '2' })
  })

  it('returns an empty record when there is no data', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: null })
    mockedSupabase.from.mockReturnValue({ select } as never)

    expect(await settingsService.getSettings()).toEqual({})
  })

  it('throws when the query fails', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(settingsService.getSettings()).rejects.toThrow('boom')
  })
})

describe('updateSetting', () => {
  function mockUpdateChain(result: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    return { update, eq, select }
  }

  it('updates an existing key and confirms a row was affected', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'))
    mockSession('admin-1')
    const { update, eq, select } = mockUpdateChain({ data: [{ key: 'free_storage_days' }], error: null })

    await settingsService.updateSetting('free_storage_days', '45')

    expect(mockedSupabase.from).toHaveBeenCalledWith('settings')
    expect(update).toHaveBeenCalledWith({ value: '45', updated_at: '2026-07-30T12:00:00.000Z' })
    expect(eq).toHaveBeenCalledWith('key', 'free_storage_days')
    expect(select).toHaveBeenCalledWith('key')
  })

  it('throws when no row is affected (unknown key — never inserts)', async () => {
    mockSession('admin-1')
    const { update } = mockUpdateChain({ data: [], error: null })

    await expect(settingsService.updateSetting('typo_key', '1')).rejects.toThrow(
      'Setting key does not exist or update not permitted',
    )
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(settingsService.updateSetting('free_storage_days', '45')).rejects.toThrow('Not authenticated')
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockSession('admin-1')
    mockUpdateChain({ data: null, error: { message: 'boom' } })

    await expect(settingsService.updateSetting('free_storage_days', '45')).rejects.toThrow('boom')
  })
})
