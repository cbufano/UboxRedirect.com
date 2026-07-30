import { parseSelectedIds, selectPackages, computeTotalWeightKg, resolveChosenOption } from './shipSelection'
import type { ReceivedPackage } from '../services/packageService'
import type { RateOption } from '../services/rateService'

function pkg(overrides: Partial<ReceivedPackage> = {}): ReceivedPackage {
  return {
    id: 'p1',
    store: 'Amazon',
    description: 'Sneakers',
    weightKg: 1.2,
    status: 'ready',
    receivedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('parseSelectedIds', () => {
  it('parses a valid JSON array of ids', () => {
    expect(parseSelectedIds(JSON.stringify(['p1', 'p2']))).toEqual(['p1', 'p2'])
  })

  it('returns [] when the param is undefined', () => {
    expect(parseSelectedIds(undefined)).toEqual([])
  })

  it('returns [] when the param is an empty string', () => {
    expect(parseSelectedIds('')).toEqual([])
  })

  it('returns [] when the param is malformed JSON', () => {
    expect(parseSelectedIds('[not json')).toEqual([])
  })

  it('returns [] when the parsed JSON is not an array', () => {
    expect(parseSelectedIds(JSON.stringify({ id: 'p1' }))).toEqual([])
  })

  it('returns [] when the param arrives as a string array (expo-router repeated param quirk)', () => {
    expect(parseSelectedIds(['p1', 'p2'])).toEqual([])
  })

  it('filters out non-string entries from the parsed array', () => {
    expect(parseSelectedIds(JSON.stringify(['p1', 42, null]))).toEqual(['p1'])
  })
})

describe('selectPackages', () => {
  const packages = [pkg({ id: 'p1' }), pkg({ id: 'p2' }), pkg({ id: 'p3' })]

  it('returns only the packages matching the given ids, in the packages list order', () => {
    expect(selectPackages(packages, ['p3', 'p1'])).toEqual([packages[0], packages[2]])
  })

  it('returns [] when ids is empty', () => {
    expect(selectPackages(packages, [])).toEqual([])
  })

  it('ignores ids that do not match any package', () => {
    expect(selectPackages(packages, ['gone'])).toEqual([])
  })
})

describe('computeTotalWeightKg', () => {
  it('sums the weight of all packages, rounded to 2 decimals', () => {
    const packages = [pkg({ weightKg: 1.005 }), pkg({ weightKg: 2.005 })]
    expect(computeTotalWeightKg(packages)).toBe(3.01)
  })

  it('returns 0 for an empty list', () => {
    expect(computeTotalWeightKg([])).toBe(0)
  })
})

describe('resolveChosenOption', () => {
  const options: RateOption[] = [
    { carrier: 'Economy', etaDays: '8-14', costUsd: 36 },
    { carrier: 'Express', etaDays: '3-5', costUsd: 52.8 },
  ]

  it('defaults to the first option when no carrier has been manually selected', () => {
    expect(resolveChosenOption(options, null)).toEqual(options[0])
  })

  it('returns the manually selected carrier when it matches an available option', () => {
    expect(resolveChosenOption(options, 'Express')).toEqual(options[1])
  })

  it('returns null when the selected carrier no longer matches any option (e.g. destination changed)', () => {
    // Mirrors the site: it does NOT silently fall back to the first option
    // here, since that could charge for a carrier the user never picked —
    // the UI re-prompts the user to choose again.
    expect(resolveChosenOption(options, 'Overnight')).toBeNull()
  })

  it('returns null when there are no options yet', () => {
    expect(resolveChosenOption(undefined, null)).toBeNull()
    expect(resolveChosenOption([], 'Economy')).toBeNull()
  })
})
