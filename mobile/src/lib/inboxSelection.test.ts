import { isSelectable, toggleSelection, pruneSelection } from './inboxSelection'
import type { ReceivedPackage } from '../services/packageService'

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

describe('isSelectable', () => {
  it('is true only for ready packages', () => {
    expect(isSelectable({ status: 'ready' })).toBe(true)
    expect(isSelectable({ status: 'received' })).toBe(false)
    expect(isSelectable({ status: 'in_review' })).toBe(false)
    expect(isSelectable({ status: 'consolidating' })).toBe(false)
    expect(isSelectable({ status: 'shipped' })).toBe(false)
    expect(isSelectable({ status: 'discarded' })).toBe(false)
  })
})

describe('toggleSelection', () => {
  it('adds a ready package that is not yet selected', () => {
    const result = toggleSelection(new Set(), pkg({ id: 'p1', status: 'ready' }))
    expect(result).toEqual(new Set(['p1']))
  })

  it('removes a ready package that is already selected', () => {
    const result = toggleSelection(new Set(['p1']), pkg({ id: 'p1', status: 'ready' }))
    expect(result).toEqual(new Set())
  })

  it('is a no-op for a non-ready package that is not selected', () => {
    const selected = new Set(['other'])
    const result = toggleSelection(selected, pkg({ id: 'p1', status: 'received' }))
    expect(result).toBe(selected)
  })

  it('still allows removing a non-ready package if it was already selected', () => {
    const result = toggleSelection(new Set(['p1']), pkg({ id: 'p1', status: 'consolidating' }))
    expect(result).toEqual(new Set())
  })

  it('does not mutate the input set', () => {
    const selected = new Set<string>()
    toggleSelection(selected, pkg({ id: 'p1', status: 'ready' }))
    expect(selected).toEqual(new Set())
  })
})

describe('pruneSelection', () => {
  it('returns the same instance when selection is empty', () => {
    const selected = new Set<string>()
    expect(pruneSelection(selected, [])).toBe(selected)
  })

  it('returns the same instance when nothing needs pruning', () => {
    const selected = new Set(['p1'])
    const packages = [pkg({ id: 'p1', status: 'ready' })]
    expect(pruneSelection(selected, packages)).toBe(selected)
  })

  it('drops ids whose package is no longer ready', () => {
    const selected = new Set(['p1', 'p2'])
    const packages = [pkg({ id: 'p1', status: 'consolidating' }), pkg({ id: 'p2', status: 'ready' })]
    expect(pruneSelection(selected, packages)).toEqual(new Set(['p2']))
  })

  it('drops ids that no longer exist in the list at all', () => {
    const selected = new Set(['gone'])
    expect(pruneSelection(selected, [pkg({ id: 'p2', status: 'ready' })])).toEqual(new Set())
  })
})
