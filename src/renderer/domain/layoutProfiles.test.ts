import { PRESET_PANE_COUNT, type LayoutProfile } from '../../shared'
import {
  applyCanvasPaneSnap,
  applyLayoutPreset,
  assignProfileToPane,
  bringPaneToFront,
  copyActiveLayoutProfile,
  createLayoutProfile,
  createPaneRuntimes,
  getCanvasSnapResult,
  getLayoutRenameError,
  getLayoutSplitSizes,
  markExitedPaneSession,
  makePaneSessionKey,
  moveCanvasPane,
  normalizeLayoutProfileNames,
  normalizeLayoutProfile,
  repairCanvasLayoutBounds,
  removeProfileAssignments,
  renameLayoutProfile,
  resetCanvasArrangement,
  resizeCanvasPane,
  setAllCanvasPanesLocked,
  setLayoutGlassMaterial,
  setLayoutLocked,
  setLayoutWorkspaceMode,
  setPaneLocked,
  tileCanvasPanes,
  toggleCanvasPaneMaximized,
  updateLayoutSplitSizes,
  updateLayoutSizes
} from './layoutProfiles'

describe('layout profile helpers', () => {
  it('creates one pane per preset slot', () => {
    const layout = createLayoutProfile('four-grid', 'Grid')

    expect(layout.panes).toHaveLength(PRESET_PANE_COUNT['four-grid'])
    expect(layout.sizes).toEqual([50, 50, 50, 50])
  })

  it('preserves existing pane assignments when changing presets', () => {
    const initial = assignProfileToPane(createLayoutProfile('single'), 'pane-1', 'builtin.codex')
    const expanded = applyLayoutPreset(initial, 'three-pane')

    expect(expanded.panes).toHaveLength(3)
    expect(expanded.panes[0].profileId).toBe('builtin.codex')
    expect(expanded.panes[1].profileId).toBeNull()
  })

  it('normalizes bad pane and size counts before persistence', () => {
    const layout: LayoutProfile = {
      id: 'layout.bad',
      name: 'Bad Layout',
      preset: 'two-vertical',
      panes: [{ id: 'pane-1', profileId: 'builtin.claude' }],
      sizes: [80, 20, 10]
    }

    const normalized = normalizeLayoutProfile(layout)

    expect(normalized.panes).toHaveLength(2)
    expect(normalized.sizes).toEqual([50, 50])
    expect(normalized.panes[0].placement).toMatchObject({
      mode: 'docked',
      bounds: { x: 0, y: 0, width: 50, height: 100 },
      zIndex: 1
    })
    expect(normalized.panes[1].placement).toMatchObject({
      mode: 'docked',
      bounds: { x: 50, y: 0, width: 50, height: 100 },
      zIndex: 2
    })
  })

  it('preserves future floating placement metadata during normalization', () => {
    const layout: LayoutProfile = {
      id: 'layout.future',
      name: 'Future',
      preset: 'single',
      panes: [
        {
          id: 'pane-1',
          profileId: 'builtin.shell',
      placement: {
        mode: 'floating',
        bounds: { x: 12, y: 8, width: 55, height: 48 },
        restoreBounds: undefined,
        zIndex: 8,
        locked: true,
        maximized: false,
        visible: true,
        snapTarget: 'top-right'
      }
        }
      ],
      sizes: []
    }

    expect(normalizeLayoutProfile(layout).panes[0].placement).toEqual({
      mode: 'floating',
      bounds: { x: 12, y: 8, width: 55, height: 48 },
      restoreBounds: undefined,
      zIndex: 8,
      locked: true,
      maximized: false,
      visible: true,
      snapTarget: 'top-right'
    })
  })

  it('migrates old layouts without workspace fields into locked Docked mode', () => {
    const layout: LayoutProfile = {
      id: 'layout.legacy',
      name: 'Legacy',
      preset: 'two-vertical',
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex' },
        { id: 'pane-2', profileId: 'builtin.droid' }
      ],
      sizes: [60, 40]
    }

    const normalized = normalizeLayoutProfile(layout)

    expect(normalized.workspaceMode).toBe('docked')
    expect(normalized.layoutLocked).toBe(true)
    expect(normalized.panes.map((pane) => pane.profileId)).toEqual(['builtin.codex', 'builtin.droid'])
    expect(normalized.panes.map((pane) => pane.placement?.mode)).toEqual(['docked', 'docked'])
  })

  it('switches to Canvas with overlapping floating geometry while preserving profiles', () => {
    const layout = assignProfileToPane(
      assignProfileToPane(createLayoutProfile('two-vertical', 'Agents'), 'pane-1', 'builtin.codex'),
      'pane-2',
      'builtin.droid'
    )

    const canvas = setLayoutWorkspaceMode(layout, 'canvas')

    expect(canvas.workspaceMode).toBe('canvas')
    expect(canvas.layoutLocked).toBe(false)
    expect(canvas.panes.map((pane) => pane.profileId)).toEqual(['builtin.codex', 'builtin.droid'])
    expect(canvas.panes.map((pane) => pane.placement?.mode)).toEqual(['floating', 'floating'])
    expect(canvas.panes.map((pane) => pane.placement?.locked)).toEqual([false, false])
    expect(canvas.panes[0].placement?.bounds.x).toBeLessThan(canvas.panes[1].placement?.bounds.x ?? 0)
    expect(canvas.panes[0].placement?.bounds.width).toBeGreaterThan(0)
  })

  it('moves and resizes unlocked Canvas panes without changing pane ids or profile assignments', () => {
    const layout = setLayoutWorkspaceMode(
      assignProfileToPane(createLayoutProfile('two-vertical'), 'pane-1', 'builtin.droid'),
      'canvas'
    )

    const moved = moveCanvasPane(layout, 'pane-1', { x: 8, y: 10 })
    const resized = resizeCanvasPane(moved, 'pane-1', { x: 6, y: 5 }, 'se')

    expect(resized.panes[0]).toMatchObject({
      id: 'pane-1',
      profileId: 'builtin.droid',
      placement: {
        mode: 'floating',
        bounds: {
          x: 15,
          y: 22,
          width: 62,
          height: 73
        }
      }
    })
  })

  it('brings clicked Canvas panes to the front by increasing z-order', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('three-pane'), 'canvas')
    const fronted = bringPaneToFront(layout, 'pane-1')

    expect(fronted.panes.find((pane) => pane.id === 'pane-1')?.placement?.zIndex).toBe(4)
  })

  it('blocks Canvas movement and resizing when the pane is locked', () => {
    const unlockedLayout = setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas')
    const paneLocked = setPaneLocked(unlockedLayout, 'pane-1', true)

    expect(moveCanvasPane(paneLocked, 'pane-1', { x: 10, y: 10 }).panes[0].placement?.bounds).toEqual(
      paneLocked.panes[0].placement?.bounds
    )
    expect(resizeCanvasPane(paneLocked, 'pane-1', { x: 10, y: 10 }, 'se').panes[0].placement?.bounds).toEqual(
      paneLocked.panes[0].placement?.bounds
    )
  })

  it('migrates old locked Canvas layouts into per-pane locks', () => {
    const oldCanvas = {
      ...setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas'),
      layoutLocked: true
    }

    const migrated = normalizeLayoutProfile(oldCanvas)

    expect(migrated.layoutLocked).toBe(false)
    expect(migrated.panes.map((pane) => pane.placement?.locked)).toEqual([true, true])
  })

  it('keeps old editable Canvas layouts unlocked except explicit pane locks', () => {
    const oldCanvas = setPaneLocked(
      {
        ...setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas'),
        layoutLocked: false
      },
      'pane-2',
      true
    )

    const migrated = normalizeLayoutProfile(oldCanvas)

    expect(migrated.layoutLocked).toBe(false)
    expect(migrated.panes.map((pane) => pane.placement?.locked)).toEqual([false, true])
  })

  it('locks and unlocks every Canvas pane from the workspace controls', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('three-pane'), 'canvas')
    const locked = setAllCanvasPanesLocked(layout, true)
    const unlocked = setAllCanvasPanesLocked(locked, false)

    expect(locked.panes.map((pane) => pane.placement?.locked)).toEqual([true, true, true])
    expect(unlocked.panes.map((pane) => pane.placement?.locked)).toEqual([false, false, false])
  })

  it('maximizes and restores a Canvas pane while preserving restore geometry', () => {
    const layout = moveCanvasPane(setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas'), 'pane-1', {
      x: 8,
      y: 4
    })
    const originalBounds = layout.panes[0].placement?.bounds
    const maximized = toggleCanvasPaneMaximized(layout, 'pane-1')
    const restored = toggleCanvasPaneMaximized(maximized, 'pane-1')

    expect(maximized.panes[0].placement).toMatchObject({
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      restoreBounds: originalBounds,
      maximized: true
    })
    expect(restored.panes[0].placement).toMatchObject({
      bounds: originalBounds,
      restoreBounds: undefined,
      maximized: false
    })
  })

  it('accepts overlapping Canvas pane geometry', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas')
    const overlapped = moveCanvasPane(layout, 'pane-1', { x: 31, y: 10 })
    const paneOneBounds = overlapped.panes[0].placement?.bounds
    const paneTwoBounds = overlapped.panes[1].placement?.bounds

    expect(paneOneBounds).toMatchObject({ x: 38, y: 22 })
    expect(paneTwoBounds).toMatchObject({ x: 38, y: 22 })
  })

  it('does not clamp movement against neighboring Canvas panes', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas')
    const movedThroughNeighbor = moveCanvasPane(layout, 'pane-1', { x: 58, y: 0 })

    expect(movedThroughNeighbor.panes[0].placement?.bounds.x).toBe(65)
    expect(movedThroughNeighbor.panes[0].placement?.bounds.x).toBeGreaterThan(
      movedThroughNeighbor.panes[1].placement?.bounds.x ?? 0
    )
  })

  it('calculates subtle snapping guides without moving live drag geometry', () => {
    const layout = moveCanvasPane(setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas'), 'pane-2', {
      x: -10,
      y: 0
    })
    const dragged = moveCanvasPane(layout, 'pane-1', { x: -6.6, y: 9.4 })
    const result = getCanvasSnapResult(layout, 'pane-1', { x: 0.4, y: 21.4, width: 40, height: 68 })

    expect(dragged.panes[0].placement?.bounds.x).toBe(0.4)
    expect(result.bounds.x).toBe(0)
    expect(result.guides).toContainEqual({ axis: 'x', position: 0 })
    expect(result.guides.length).toBeGreaterThan(0)
  })

  it('applies Canvas snapping only on release and only within threshold', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas')
    const nearEdge = moveCanvasPane(layout, 'pane-1', { x: -6.25, y: 0 })
    const snapped = applyCanvasPaneSnap(nearEdge, 'pane-1')
    const outsideThreshold = moveCanvasPane(layout, 'pane-1', { x: -5.8, y: 0 })
    const unsnapped = applyCanvasPaneSnap(outsideThreshold, 'pane-1')

    expect(nearEdge.panes[0].placement?.bounds.x).toBe(0.75)
    expect(snapped.panes[0].placement?.bounds.x).toBe(0)
    expect(outsideThreshold.panes[0].placement?.bounds.x).toBe(1.2)
    expect(unsnapped.panes[0].placement?.bounds.x).toBe(1.2)
  })

  it('can bypass Canvas snapping through the internal snap option', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas')
    const nearEdge = moveCanvasPane(layout, 'pane-1', { x: -6.25, y: 0 })
    const bypassed = applyCanvasPaneSnap(nearEdge, 'pane-1', { enabled: false })

    expect(bypassed.panes[0].placement?.bounds.x).toBe(0.75)
  })

  it('keeps a recoverable Canvas title bar visible at the workspace boundary', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('single'), 'canvas')
    const moved = moveCanvasPane(layout, 'pane-1', { x: -80, y: 95 })
    const bounds = moved.panes[0].placement?.bounds

    expect(bounds).toMatchObject({
      x: -64,
      y: 90,
      width: 74,
      height: 74
    })
  })

  it('calculates magnetic snapping against Canvas and neighboring pane edges', () => {
    const layout = moveCanvasPane(setLayoutWorkspaceMode(createLayoutProfile('two-vertical'), 'canvas'), 'pane-2', {
      x: -10,
      y: 0
    })
    const result = getCanvasSnapResult(layout, 'pane-1', { x: 0.4, y: 21.4, width: 40, height: 68 })

    expect(result.bounds.x).toBe(0)
    expect(result.guides).toContainEqual({ axis: 'x', position: 0 })
    expect(result.guides.length).toBeGreaterThan(0)
  })

  it('preserves profile and running session identity through Canvas geometry changes', () => {
    const layout = assignProfileToPane(
      setLayoutWorkspaceMode(createLayoutProfile('single', 'Solo', { id: 'layout.solo' }), 'canvas'),
      'pane-1',
      'builtin.droid'
    )
    const sessions = {
      [makePaneSessionKey(layout.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-droid',
        launchedProfileId: 'builtin.droid'
      }
    }
    const changed = resizeCanvasPane(moveCanvasPane(layout, 'pane-1', { x: 3, y: 2 }), 'pane-1', { x: -4, y: 6 }, 'sw')

    expect(createPaneRuntimes(changed, sessions)[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.droid' },
      status: 'running',
      ptyId: 'pty-droid',
      launchedProfileId: 'builtin.droid'
    })
  })

  it('stores the selected glass material on the layout', () => {
    const layout = setLayoutGlassMaterial(createLayoutProfile('single'), 'amethyst')

    expect(layout.glassMaterial).toBe('amethyst')
    expect(layout.glassTheme).toBeUndefined()
  })

  it('repairs out-of-bounds Canvas geometry after display changes', () => {
    const layout = setLayoutWorkspaceMode(createLayoutProfile('single'), 'canvas')
    const broken: LayoutProfile = {
      ...layout,
      panes: [
        {
          ...layout.panes[0],
          placement: {
            ...layout.panes[0].placement!,
            bounds: { x: 92, y: -20, width: 40, height: 120 }
          }
        }
      ]
    }

    const repaired = repairCanvasLayoutBounds(broken)

    expect(repaired.panes[0].placement?.bounds).toEqual({ x: 90, y: 0, width: 40, height: 100 })
  })

  it('tiles and resets Canvas panes with visible persisted placement', () => {
    const layout = setLayoutLocked(setLayoutWorkspaceMode(createLayoutProfile('four-grid'), 'canvas'), false)
    const tiled = tileCanvasPanes(layout)
    const reset = resetCanvasArrangement(tiled)

    expect(tiled.panes.every((pane) => pane.placement?.mode === 'floating')).toBe(true)
    expect(tiled.panes.every((pane) => pane.placement?.visible === true)).toBe(true)
    expect(reset.panes.map((pane) => pane.placement?.zIndex)).toEqual([1, 2, 3, 4])
    expect(reset.panes[0].placement?.bounds).not.toEqual(tiled.panes[0].placement?.bounds)
  })

  it('hydrates legacy complex layout sizes with an even secondary split', () => {
    const layout: LayoutProfile = {
      id: 'layout.legacy',
      name: 'Legacy Grid',
      preset: 'four-grid',
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex' },
        { id: 'pane-2', profileId: 'builtin.claude' },
        { id: 'pane-3', profileId: 'builtin.opencode' },
        { id: 'pane-4', profileId: null }
      ],
      sizes: [70, 30]
    }

    const normalized = normalizeLayoutProfile(layout)

    expect(normalized.sizes).toEqual([70, 30, 50, 50])
    expect(getLayoutSplitSizes(normalized, 'columns')).toEqual([70, 30])
    expect(getLayoutSplitSizes(normalized, 'rows')).toEqual([50, 50])
  })

  it('keeps runtime status and pty handles out of layout profiles', () => {
    const layout = assignProfileToPane(createLayoutProfile('single'), 'pane-1', 'builtin.shell')
    const runtime = createPaneRuntimes(layout)
    const resized = updateLayoutSizes(applyLayoutPreset(layout, 'two-horizontal'), [70, 30])

    expect(runtime[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.shell' },
      status: 'assigned',
      ptyId: null
    })
    expect(runtime[0].config.placement).toMatchObject({
      mode: 'docked',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      zIndex: 1,
      locked: false,
      snapTarget: 'none'
    })
    expect(resized).not.toHaveProperty('ptyId')
    expect(resized.sizes).toEqual([70, 30])
  })

  it('persists column and row drag sizes without changing pane assignments', () => {
    const layout = assignProfileToPane(createLayoutProfile('four-grid', 'Grid'), 'pane-4', 'builtin.droid')
    const columnResized = updateLayoutSplitSizes(layout, 'columns', [62, 38])
    const rowResized = updateLayoutSplitSizes(columnResized, 'rows', [35, 65])

    expect(rowResized.sizes).toEqual([62, 38, 35, 65])
    expect(rowResized.panes.map((pane) => ({ id: pane.id, profileId: pane.profileId }))).toEqual(
      layout.panes.map((pane) => ({ id: pane.id, profileId: pane.profileId }))
    )
    expect(rowResized.panes.map((pane) => pane.placement?.bounds)).toEqual([
      { x: 0, y: 0, width: 62, height: 35 },
      { x: 62, y: 0, width: 38, height: 35 },
      { x: 0, y: 35, width: 62, height: 65 },
      { x: 62, y: 35, width: 38, height: 65 }
    ])
    expect(getLayoutSplitSizes(rowResized, 'columns')).toEqual([62, 38])
    expect(getLayoutSplitSizes(rowResized, 'rows')).toEqual([35, 65])
  })

  it('keeps resized panes and running sessions matched by pane id', () => {
    const layout = assignProfileToPane(createLayoutProfile('three-pane', 'Agents'), 'pane-2', 'builtin.opencode')
    const sessions = {
      [makePaneSessionKey(layout.id, 'pane-2')]: {
        status: 'running' as const,
        ptyId: 'pty-opencode',
        launchedProfileId: 'builtin.opencode'
      }
    }

    const resized = updateLayoutSplitSizes(updateLayoutSplitSizes(layout, 'columns', [40, 60]), 'rows', [
      30,
      70
    ])
    const runtimes = createPaneRuntimes(resized, sessions)

    expect(resized.sizes).toEqual([40, 60, 30, 70])
    expect(runtimes[1]).toMatchObject({
      config: { id: 'pane-2', profileId: 'builtin.opencode' },
      status: 'running',
      ptyId: 'pty-opencode',
      launchedProfileId: 'builtin.opencode'
    })
  })

  it('keeps a missing CLI profile assignment in place while the pane stays stopped', () => {
    const layout = assignProfileToPane(createLayoutProfile('single'), 'pane-1', 'builtin.codex')
    const runtime = createPaneRuntimes(layout, {
      [makePaneSessionKey(layout.id, 'pane-1')]: {
        status: 'assigned',
        ptyId: null,
        errorMessage: 'codex is missing'
      }
    })

    expect(runtime[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.codex' },
      status: 'assigned',
      ptyId: null,
      errorMessage: 'codex is missing',
      launchedProfileId: undefined
    })
  })

  it('saves a copy of the active layout without deleting existing layouts', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })
    const activeLayout = updateLayoutSizes(
      assignProfileToPane(
        createLayoutProfile('two-vertical', 'Client Work', { id: 'layout.client-work' }),
        'pane-1',
        'builtin.codex'
      ),
      [65, 35]
    )

    const result = copyActiveLayoutProfile([defaultLayout, activeLayout], activeLayout.id)

    expect(result.layoutProfiles.map((layout) => layout.name)).toEqual([
      'Default',
      'Client Work',
      'Client Work Copy'
    ])
    expect(result.activeLayoutId).toBe(result.layoutProfiles[2].id)
    expect(result.layoutProfiles[2]).toMatchObject({
      name: 'Client Work Copy',
      preset: 'two-vertical',
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex' },
        { id: 'pane-2', profileId: null }
      ],
      sizes: [65, 35]
    })
  })

  it('generates predictable names when saving duplicate layout copies', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })
    const clientWork = createLayoutProfile('single', 'Client Work', { id: 'layout.client-work' })
    const clientWorkCopy = createLayoutProfile('single', 'Client Work Copy', { id: 'layout.client-work.copy' })

    const result = copyActiveLayoutProfile([defaultLayout, clientWork, clientWorkCopy], clientWork.id)

    expect(result.layoutProfiles.map((layout) => layout.name)).toEqual([
      'Default',
      'Client Work',
      'Client Work Copy',
      'Client Work Copy 2'
    ])

    const copiedCopy = copyActiveLayoutProfile(result.layoutProfiles, clientWorkCopy.id)

    expect(copiedCopy.layoutProfiles.map((layout) => layout.name)).toEqual([
      'Default',
      'Client Work',
      'Client Work Copy',
      'Client Work Copy 2',
      'Client Work Copy 3'
    ])
  })

  it('renames one layout without creating an unwanted copy', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })
    const draftLayout = createLayoutProfile('single', 'Draft', { id: 'layout.draft' })

    const result = renameLayoutProfile([defaultLayout, draftLayout], draftLayout.id, 'Client Work')

    expect(result.layoutProfiles).toHaveLength(2)
    expect(result.layoutProfiles.map((layout) => layout.name)).toEqual(['Default', 'Client Work'])
    expect(result.activeLayoutId).toBe(draftLayout.id)
  })

  it('blocks duplicate names when renaming the active layout', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })
    const clientWork = createLayoutProfile('single', 'Client Work', { id: 'layout.client-work' })

    expect(getLayoutRenameError([defaultLayout, clientWork], clientWork.id, 'Default')).toBe(
      'A layout named "Default" already exists.'
    )

    const result = renameLayoutProfile([defaultLayout, clientWork], clientWork.id, 'Default')

    expect(result.layoutProfiles.map((layout) => layout.name)).toEqual(['Default', 'Client Work'])
  })

  it('creates a custom copy without removing Default', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })

    const copied = copyActiveLayoutProfile([defaultLayout], defaultLayout.id)
    const renamed = renameLayoutProfile(copied.layoutProfiles, copied.activeLayoutId, 'Client Work')

    expect(renamed.layoutProfiles.map((layout) => layout.name)).toEqual(['Default', 'Client Work'])
    expect(renamed.activeLayoutId).toBe(copied.activeLayoutId)
  })

  it('keeps active layout selection valid after copy and rename', () => {
    const defaultLayout = createLayoutProfile('single', 'Default', { id: 'layout.default' })

    const copied = copyActiveLayoutProfile([defaultLayout], defaultLayout.id)
    const renamed = renameLayoutProfile(copied.layoutProfiles, copied.activeLayoutId, 'Client Work')

    expect(renamed.layoutProfiles.some((layout) => layout.id === renamed.activeLayoutId)).toBe(true)
    expect(renamed.layoutProfiles.find((layout) => layout.id === renamed.activeLayoutId)?.name).toBe(
      'Client Work'
    )
  })

  it('normalizes duplicate layout names to avoid confusing selector entries', () => {
    const layouts = normalizeLayoutProfileNames([
      createLayoutProfile('single', 'Default', { id: 'layout.default' }),
      createLayoutProfile('single', 'Default', { id: 'layout.default.copy' }),
      createLayoutProfile('single', 'Default Copy', { id: 'layout.default.copy.2' })
    ])

    expect(layouts.map((layout) => layout.name)).toEqual(['Default', 'Default Copy', 'Default Copy 2'])
  })

  it('preserves running sessions by layout and pane id when profile assignments change', () => {
    const layout = createLayoutProfile('two-vertical', 'Pair')
    const assigned = assignProfileToPane(
      assignProfileToPane(layout, 'pane-1', 'builtin.shell'),
      'pane-2',
      'builtin.codex'
    )
    const runningSessions = Object.fromEntries(
      createPaneRuntimes(assigned).map((pane, index) => [
        makePaneSessionKey(assigned.id, pane.config.id),
        {
          ...pane,
          status: 'running' as const,
          ptyId: `pty-${index + 1}`
        }
      ])
    )
    const reassigned = assignProfileToPane(assigned, 'pane-2', 'builtin.claude')

    const reconciled = createPaneRuntimes(reassigned, runningSessions)

    expect(reconciled).toMatchObject([
      {
        config: { id: 'pane-1', profileId: 'builtin.shell' },
        status: 'running',
        ptyId: 'pty-1'
      },
      {
        config: { id: 'pane-2', profileId: 'builtin.claude' },
        status: 'running',
        ptyId: 'pty-2'
      }
    ])
  })

  it('does not leak running sessions into another layout that reuses pane ids', () => {
    const layoutA = createLayoutProfile('two-vertical', 'Layout A', { id: 'layout.a' })
    const layoutB = createLayoutProfile('two-vertical', 'Layout B', { id: 'layout.b' })
    const assignedA = assignProfileToPane(layoutA, 'pane-1', 'builtin.shell')
    const assignedB = assignProfileToPane(layoutB, 'pane-1', 'builtin.codex')
    const sessions = {
      [makePaneSessionKey(assignedA.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-layout-a'
      }
    }

    expect(createPaneRuntimes(assignedB, sessions)[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.codex' },
      status: 'assigned',
      ptyId: null,
      errorMessage: undefined
    })
    expect(createPaneRuntimes(assignedA, sessions)[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.shell' },
      status: 'running',
      ptyId: 'pty-layout-a',
      errorMessage: undefined
    })
  })

  it('does not leak running terminal session state into a layout copy', () => {
    const layout = assignProfileToPane(
      createLayoutProfile('single', 'Default', { id: 'layout.default' }),
      'pane-1',
      'builtin.shell'
    )
    const sessions = {
      [makePaneSessionKey(layout.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-default'
      }
    }

    const copied = copyActiveLayoutProfile([layout], layout.id)
    const copy = copied.layoutProfiles.find((profile) => profile.id === copied.activeLayoutId)

    expect(copy).toBeDefined()
    expect(createPaneRuntimes(copy!, sessions)[0]).toMatchObject({
      config: { id: 'pane-1', profileId: 'builtin.shell' },
      status: 'assigned',
      ptyId: null,
      errorMessage: undefined
    })
  })

  it('marks an exited session assigned in an inactive layout without touching active layout sessions', () => {
    const layoutA = assignProfileToPane(
      createLayoutProfile('two-vertical', 'Layout A', { id: 'layout.a' }),
      'pane-1',
      'builtin.shell'
    )
    const layoutB = assignProfileToPane(
      createLayoutProfile('two-vertical', 'Layout B', { id: 'layout.b' }),
      'pane-1',
      'builtin.codex'
    )
    const sessions = {
      [makePaneSessionKey(layoutA.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-layout-a'
      },
      [makePaneSessionKey(layoutB.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-layout-b'
      }
    }

    const nextSessions = markExitedPaneSession(sessions, [layoutA, layoutB], 'pty-layout-a')

    expect(nextSessions).toEqual({
      [makePaneSessionKey(layoutA.id, 'pane-1')]: {
        status: 'assigned',
        ptyId: null
      },
      [makePaneSessionKey(layoutB.id, 'pane-1')]: {
        status: 'running',
        ptyId: 'pty-layout-b'
      }
    })
  })

  it('ignores stale exit events for a pane that has already restarted', () => {
    const layout = assignProfileToPane(
      createLayoutProfile('single', 'Solo', { id: 'layout.solo' }),
      'pane-1',
      'builtin.shell'
    )
    const sessions = {
      [makePaneSessionKey(layout.id, 'pane-1')]: {
        status: 'running' as const,
        ptyId: 'pty-new'
      }
    }

    expect(markExitedPaneSession(sessions, [layout], 'pty-old')).toBe(sessions)
  })

  it('clears an exited session whose pane is no longer in the current preset', () => {
    const layout = assignProfileToPane(
      createLayoutProfile('two-vertical', 'Pair', { id: 'layout.pair' }),
      'pane-2',
      'builtin.codex'
    )
    const reducedLayout = applyLayoutPreset(layout, 'single')
    const sessions = {
      [makePaneSessionKey(layout.id, 'pane-2')]: {
        status: 'running' as const,
        ptyId: 'pty-hidden-pane'
      }
    }

    expect(markExitedPaneSession(sessions, [reducedLayout], 'pty-hidden-pane')).toEqual({
      [makePaneSessionKey(layout.id, 'pane-2')]: {
        status: 'blank',
        ptyId: null
      }
    })
  })

  it('unassigns panes using a deleted custom profile only', () => {
    const layout = createLayoutProfile('three-pane', 'Mixed')
    const assigned = {
      ...layout,
      panes: [
        { id: 'pane-1', profileId: 'profile.custom.deleted' },
        { id: 'pane-2', profileId: 'builtin.codex' },
        { id: 'pane-3', profileId: 'profile.custom.other' }
      ]
    }

    const cleaned = removeProfileAssignments(assigned, ['profile.custom.deleted'])

    expect(cleaned.panes).toEqual([
      { id: 'pane-1', profileId: null },
      { id: 'pane-2', profileId: 'builtin.codex' },
      { id: 'pane-3', profileId: 'profile.custom.other' }
    ])
  })
})
