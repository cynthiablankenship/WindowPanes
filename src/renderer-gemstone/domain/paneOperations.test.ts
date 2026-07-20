import { describe, expect, it } from 'vitest'
import type { CommandProfile } from '../../shared'
import {
  createGemstoneWorkspaceSnapshot,
  hydrateGemstonePanes,
  type GemPaneState
} from './gemstoneState'
import {
  applyGemPaneBoundsInteraction,
  assignProfileToGemPane,
  bringAllGemPanesOnscreen,
  bringGemPaneToFront,
  clearStoppedGemPanes,
  flipGemPaneFacetOrientation,
  getPtyIdsToStopForLoadedLayout,
  markGemPaneSessionStarting,
  markGemPaneSessionStarted,
  markGemPaneSessionStopped,
  mergeLoadedGemstoneLayout,
  resetVisibleGemPaneArrangement,
  setGemPaneHidden,
  setGemPaneFacetOrientation,
  setGemPaneMaterial,
  toggleGemPaneLock
} from './paneOperations'

const shellProfile: CommandProfile = {
  id: 'builtin.shell',
  name: 'Generic Shell',
  command: '',
  args: [],
  builtIn: true
}

const droidProfile: CommandProfile = {
  id: 'builtin.droid',
  name: 'Droid',
  command: 'droid',
  args: [],
  builtIn: true
}

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

describe('gemstone pane operations', () => {
  it('changes one running pane material without changing pane or session identity and persists it', () => {
    const panes = [
      createPane({
        id: 'running',
        material: 'diamond',
        status: 'running',
        ptyId: 'pty-running',
        launchedProfileId: 'builtin.shell'
      }),
      createPane({ id: 'other', material: 'emerald', ptyId: 'pty-other', zIndex: 2 })
    ]

    const updated = setGemPaneMaterial(panes, 'running', 'ruby')
    const runningPane = updated.find((pane) => pane.id === 'running')
    const otherPane = updated.find((pane) => pane.id === 'other')

    expect(runningPane).toMatchObject({
      id: 'running',
      material: 'ruby',
      ptyId: 'pty-running',
      launchedProfileId: 'builtin.shell',
      bounds: panes[0].bounds,
      zIndex: panes[0].zIndex
    })
    expect(otherPane?.material).toBe('emerald')

    const snapshot = createGemstoneWorkspaceSnapshot(updated, 'running', false)
    const hydrated = hydrateGemstonePanes(snapshot, [], { width: 1200, height: 800 })

    expect(hydrated.find((pane) => pane.id === 'running')?.material).toBe('ruby')
  })

  it('keeps locked panes in each corner at identical state bounds after selection and edits', () => {
    const corners = [
      { id: 'top-left', bounds: { x: 0, y: 0, width: 360, height: 260 } },
      { id: 'top-right', bounds: { x: 840, y: 0, width: 360, height: 260 } },
      { id: 'bottom-left', bounds: { x: 0, y: 540, width: 360, height: 260 } },
      { id: 'bottom-right', bounds: { x: 840, y: 540, width: 360, height: 260 } }
    ].map((corner, index) =>
      createPane({
        id: corner.id,
        bounds: corner.bounds,
        locked: true,
        zIndex: index + 1,
        facetOrientation: 'right'
      })
    )
    const unlocked = createPane({ id: 'unlocked', zIndex: 5, bounds: { x: 420, y: 260, width: 380, height: 280 } })
    const beforeBoundsByPaneId = new Map(corners.map((pane) => [pane.id, { ...pane.bounds }]))

    let current = [...corners, unlocked]
    current = bringGemPaneToFront(current, 'unlocked')
    current = setGemPaneMaterial(current, 'unlocked', 'ruby')
    current = setGemPaneFacetOrientation(current, 'unlocked', 'left')

    for (const pane of corners) {
      current = bringGemPaneToFront(current, pane.id)
      current = setGemPaneMaterial(current, pane.id, 'opal')
      current = flipGemPaneFacetOrientation(current, pane.id)
      expect(current.find((candidate) => candidate.id === pane.id)?.bounds).toEqual(
        beforeBoundsByPaneId.get(pane.id)
      )
    }
  })

  it('assigns a profile to an existing blank pane, starts a new session, persists profile, and preserves visual config', () => {
    const blankPane = createPane({
      id: 'blank',
      title: 'Blank Pane',
      profileId: null,
      material: 'opal',
      treatment: 'architectural',
      facetOrientation: 'symmetric',
      bounds: { x: 120, y: 160, width: 500, height: 340 },
      zIndex: 8,
      locked: true,
      maximized: false,
      status: 'blank',
      ptyId: null
    })
    const runningPane = createPane({
      id: 'running',
      status: 'running',
      ptyId: 'pty-existing',
      zIndex: 2
    })

    const assigned = assignProfileToGemPane([blankPane, runningPane], 'blank', shellProfile)

    expect(assigned.outcome).toBe('assigned')
    expect(assigned.outcome === 'assigned' ? assigned.shouldStart : false).toBe(true)

    const started = assigned.outcome === 'assigned'
      ? markGemPaneSessionStarted(assigned.panes, 'blank', 'pty-new', shellProfile.id)
      : assigned.panes
    const pane = started.find((candidate) => candidate.id === 'blank')

    expect(pane).toMatchObject({
      id: 'blank',
      profileId: 'builtin.shell',
      title: 'Generic Shell',
      material: 'opal',
      treatment: 'architectural',
      facetOrientation: 'symmetric',
      bounds: blankPane.bounds,
      zIndex: 8,
      locked: true,
      maximized: false,
      status: 'running',
      ptyId: 'pty-new',
      launchedProfileId: 'builtin.shell'
    })
    expect(started.find((candidate) => candidate.id === 'running')?.ptyId).toBe('pty-existing')

    const snapshot = createGemstoneWorkspaceSnapshot(started, 'blank', false)
    expect(hydrateGemstonePanes(snapshot, [], { width: 1200, height: 800 })[0]).toMatchObject({
      id: 'blank',
      profileId: 'builtin.shell',
      material: 'opal',
      treatment: 'architectural',
      facetOrientation: 'symmetric',
      bounds: blankPane.bounds,
      locked: true
    })
  })

  it('does not silently replace an active pane session through profile assignment', () => {
    const activePane = createPane({
      id: 'active',
      status: 'running',
      ptyId: 'pty-active',
      profileId: 'builtin.shell'
    })

    const result = assignProfileToGemPane([activePane], 'active', droidProfile)

    expect(result.outcome).toBe('blocked-active-session')
    expect(result.panes[0]).toEqual(activePane)
  })

  it('updates only the targeted pane when Play transitions a configured pane through starting to running', () => {
    const configured = createPane({
      id: 'configured',
      status: 'assigned',
      ptyId: null,
      material: 'opal',
      treatment: 'polished',
      facetOrientation: 'symmetric',
      locked: true
    })
    const other = createPane({ id: 'other', status: 'running', ptyId: 'pty-other', zIndex: 2 })

    const starting = markGemPaneSessionStarting([configured, other], 'configured')
    const running = markGemPaneSessionStarted(starting, 'configured', 'pty-new', shellProfile.id)

    expect(running.find((pane) => pane.id === 'configured')).toMatchObject({
      id: 'configured',
      status: 'running',
      ptyId: 'pty-new',
      launchedProfileId: shellProfile.id,
      material: 'opal',
      treatment: 'polished',
      facetOrientation: 'symmetric',
      locked: true
    })
    expect(running.find((pane) => pane.id === 'other')?.ptyId).toBe('pty-other')
  })

  it('stops only the targeted pane session and returns it to ready without removing visual state', () => {
    const running = createPane({
      id: 'running',
      status: 'running',
      ptyId: 'pty-running',
      launchedProfileId: shellProfile.id,
      bounds: { x: 100, y: 110, width: 500, height: 320 },
      material: 'ruby',
      treatment: 'architectural',
      facetOrientation: 'left'
    })
    const other = createPane({ id: 'other', status: 'running', ptyId: 'pty-other', zIndex: 2 })

    const stopped = markGemPaneSessionStopped([running, other], 'running')

    expect(stopped.find((pane) => pane.id === 'running')).toMatchObject({
      id: 'running',
      status: 'assigned',
      ptyId: null,
      launchedProfileId: undefined,
      bounds: running.bounds,
      material: 'ruby',
      treatment: 'architectural',
      facetOrientation: 'left'
    })
    expect(stopped.find((pane) => pane.id === 'other')?.ptyId).toBe('pty-other')
  })

  it('toggles lock without changing pane geometry or other panes', () => {
    const pane = createPane({ id: 'locked-target', locked: false })
    const other = createPane({ id: 'other', locked: false, zIndex: 2 })

    const locked = toggleGemPaneLock([pane, other], 'locked-target')
    const unlocked = toggleGemPaneLock(locked, 'locked-target')

    expect(locked.find((candidate) => candidate.id === 'locked-target')).toMatchObject({
      locked: true,
      bounds: pane.bounds
    })
    expect(unlocked.find((candidate) => candidate.id === 'locked-target')).toMatchObject({
      locked: false,
      bounds: pane.bounds
    })
    expect(unlocked.find((candidate) => candidate.id === 'other')?.locked).toBe(false)
  })

  it('resets only visible pane arrangement while keeping hidden panes untouched', () => {
    const visible = createPane({ id: 'visible', bounds: { x: -400, y: -300, width: 420, height: 300 } })
    const hidden = createPane({
      id: 'hidden',
      hidden: true,
      bounds: { x: -700, y: -500, width: 420, height: 300 },
      zIndex: 5
    })

    const reset = resetVisibleGemPaneArrangement([visible, hidden], [{ x: 40, y: 50, width: 500, height: 320 }])

    expect(reset.find((pane) => pane.id === 'visible')).toMatchObject({
      bounds: { x: 40, y: 50, width: 500, height: 320 },
      zIndex: 1,
      maximized: false
    })
    expect(reset.find((pane) => pane.id === 'hidden')).toMatchObject({
      bounds: hidden.bounds,
      hidden: true,
      zIndex: 5
    })
  })

  it('moves only the targeted pane without creating duplicate pane models', () => {
    const target = createPane({ id: 'target', bounds: { x: 80, y: 90, width: 420, height: 300 } })
    const other = createPane({ id: 'other', bounds: { x: 300, y: 220, width: 500, height: 340 }, zIndex: 2 })

    const moved = applyGemPaneBoundsInteraction(
      [target, other],
      'target',
      'drag',
      target.bounds,
      140,
      95,
      { width: 1000, height: 720 }
    )

    expect(moved).toHaveLength(2)
    expect(new Set(moved.map((pane) => pane.id)).size).toBe(2)
    expect(moved.find((pane) => pane.id === 'target')).toMatchObject({
      bounds: { x: 220, y: 185, width: 420, height: 300 },
      maximized: false,
      restoreBounds: undefined
    })
    expect(moved.find((pane) => pane.id === 'other')?.bounds).toEqual(other.bounds)
  })

  it('keeps pane geometry valid when dragging quickly toward canvas edges', () => {
    const pane = createPane({ id: 'edge', bounds: { x: 80, y: 70, width: 420, height: 300 } })

    const moved = applyGemPaneBoundsInteraction(
      [pane],
      'edge',
      'drag',
      pane.bounds,
      2000,
      -1200,
      { width: 1000, height: 720 }
    )[0]

    expect(moved.bounds).toEqual({
      x: 952,
      y: -252,
      width: 420,
      height: 300
    })
  })

  it('marks hidden panes in state without removing or duplicating their model', () => {
    const visible = createPane({ id: 'visible' })
    const hidden = createPane({ id: 'hidden', zIndex: 2 })

    const panes = setGemPaneHidden([visible, hidden], 'hidden', true)

    expect(panes).toHaveLength(2)
    expect(new Set(panes.map((pane) => pane.id)).size).toBe(2)
    expect(panes.find((pane) => pane.id === 'hidden')).toMatchObject({
      hidden: true,
      bounds: hidden.bounds
    })
  })

  it('brings every pane onscreen and visible without changing active session identity', () => {
    const panes = [
      createPane({
        id: 'running',
        bounds: { x: -900, y: -700, width: 420, height: 300 },
        hidden: true,
        locked: true,
        status: 'running',
        ptyId: 'pty-running'
      }),
      createPane({
        id: 'ready',
        bounds: { x: 1600, y: 1000, width: 500, height: 340 },
        zIndex: 9
      })
    ]

    const recovered = bringAllGemPanesOnscreen(panes, { width: 1000, height: 700 })

    expect(recovered[0]).toMatchObject({
      id: 'running',
      hidden: false,
      locked: true,
      status: 'running',
      ptyId: 'pty-running'
    })
    expect(recovered[0].bounds.x).toBeGreaterThanOrEqual(24)
    expect(recovered[0].bounds.y).toBeGreaterThanOrEqual(24)
    expect(recovered[1].bounds.x + recovered[1].bounds.width).toBeLessThanOrEqual(976)
  })

  it('clears stopped panes while preserving running sessions', () => {
    const panes = [
      createPane({ id: 'blank', profileId: null, status: 'blank' }),
      createPane({ id: 'assigned', status: 'assigned' }),
      createPane({ id: 'running', status: 'running', ptyId: 'pty-running' })
    ]

    expect(clearStoppedGemPanes(panes).map((pane) => pane.id)).toEqual(['running'])
  })

  it('loads saved layouts without restarting matching live sessions and identifies stale ptys', () => {
    const current = [
      createPane({
        id: 'same',
        profileId: 'builtin.shell',
        status: 'running',
        ptyId: 'pty-keep',
        launchedProfileId: 'builtin.shell'
      }),
      createPane({ id: 'removed', status: 'running', ptyId: 'pty-stop' })
    ]
    const loaded = [
      createPane({
        id: 'same',
        profileId: 'builtin.shell',
        status: 'assigned',
        ptyId: null,
        material: 'ruby'
      }),
      createPane({ id: 'new-pane', profileId: 'builtin.droid', status: 'assigned', ptyId: null })
    ]

    expect(getPtyIdsToStopForLoadedLayout(current, loaded)).toEqual(['pty-stop'])

    const merged = mergeLoadedGemstoneLayout(current, loaded)

    expect(merged.find((pane) => pane.id === 'same')).toMatchObject({
      material: 'ruby',
      status: 'running',
      ptyId: 'pty-keep',
      launchedProfileId: 'builtin.shell'
    })
    expect(merged.find((pane) => pane.id === 'new-pane')?.ptyId).toBeNull()
  })
})
