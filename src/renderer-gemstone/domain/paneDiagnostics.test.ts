import { describe, expect, it } from 'vitest'
import type { GemPaneState } from './gemstoneState'
import {
  getDuplicateGemPaneIds,
  getRenderableGemPanes,
  getVisibleGemPaneStateCount
} from './paneDiagnostics'

function createPane(overrides: Partial<GemPaneState> = {}): GemPaneState {
  return {
    id: 'pane-a',
    title: 'Pane A',
    profileId: 'builtin.shell',
    material: 'diamond',
    treatment: 'sharp',
    facetOrientation: 'right',
    bounds: { x: 24, y: 30, width: 420, height: 300 },
    zIndex: 1,
    locked: false,
    maximized: false,
    status: 'assigned',
    ptyId: null,
    ...overrides
  }
}

describe('gemstone pane render diagnostics', () => {
  it('renders one root for each visible unique pane state entry', () => {
    const panes = [
      createPane({ id: 'visible-a' }),
      createPane({ id: 'hidden', hidden: true, zIndex: 2 }),
      createPane({ id: 'visible-b', zIndex: 3 })
    ]

    expect(getVisibleGemPaneStateCount(panes)).toBe(2)
    expect(getRenderableGemPanes(panes).map((pane) => pane.id)).toEqual(['visible-a', 'visible-b'])
  })

  it('does not render hidden pane roots or shadow-bearing pane wrappers', () => {
    const hidden = createPane({ id: 'hidden', hidden: true })

    expect(getRenderableGemPanes([hidden])).toEqual([])
    expect(getVisibleGemPaneStateCount([hidden])).toBe(0)
  })

  it('prevents duplicate pane IDs from rendering more than one root', () => {
    const panes = [
      createPane({ id: 'duplicate', bounds: { x: 10, y: 20, width: 420, height: 300 } }),
      createPane({ id: 'duplicate', bounds: { x: 220, y: 240, width: 420, height: 300 }, zIndex: 2 }),
      createPane({ id: 'unique', zIndex: 3 })
    ]

    expect(getDuplicateGemPaneIds(panes)).toEqual(['duplicate'])
    expect(getRenderableGemPanes(panes).map((pane) => pane.id)).toEqual(['duplicate', 'unique'])
  })
})
