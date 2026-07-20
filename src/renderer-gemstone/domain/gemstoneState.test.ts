import { describe, expect, it } from 'vitest'
import type { PersistedState } from '../../shared'
import {
  createGemstoneWorkspaceSnapshot,
  DAILY_GEMSTONE_BACKGROUND_REGISTRY,
  GEMSTONE_BACKGROUND_REGISTRY,
  GEMSTONE_BACKGROUNDS,
  REFERENCE_GEMSTONE_BACKGROUND_REGISTRY,
  getDefaultGemstoneBackground,
  getGemstoneBackgroundDefinition,
  getGemstoneWorkspaceSnapshot,
  hydrateGemstonePanes,
  mergeGemstoneWorkspaceSnapshot,
  normalizeGemstoneBackground,
  type GemPaneState
} from './gemstoneState'

const canvas = { width: 1200, height: 800 }

function createPane(overrides: Partial<GemPaneState> = {}): GemPaneState {
  return {
    id: 'gem-shell',
    title: 'Shell',
    profileId: 'builtin.shell',
    material: 'diamond',
    treatment: 'sharp',
    facetOrientation: 'right',
    bounds: { x: 40, y: 50, width: 500, height: 320 },
    zIndex: 1,
    locked: false,
    maximized: false,
    status: 'running',
    ptyId: 'pty-live',
    launchedProfileId: 'builtin.shell',
    errorMessage: 'runtime only',
    ...overrides
  }
}

describe('gemstone workspace persistence', () => {
  it('persists per-pane material, treatment, and facet orientation without runtime session fields', () => {
    const panes = [
      createPane({ id: 'one', material: 'diamond', facetOrientation: 'left', ptyId: 'pty-one' }),
      createPane({
        id: 'two',
        material: 'ruby',
        treatment: 'architectural',
        facetOrientation: 'right',
        ptyId: 'pty-two',
        zIndex: 4
      })
    ]

    const snapshot = createGemstoneWorkspaceSnapshot(panes, 'two', true)
    const hydrated = hydrateGemstonePanes(snapshot, [], canvas)

    expect(snapshot.selectedPaneId).toBe('two')
    expect(snapshot.globalLocked).toBe(true)
    expect(snapshot.panes.map((pane) => [pane.material, pane.treatment, pane.facetOrientation])).toEqual([
      ['diamond', 'sharp', 'left'],
      ['ruby', 'architectural', 'right']
    ])
    expect(hydrated.map((pane) => pane.ptyId)).toEqual([null, null])
    expect(hydrated.map((pane) => pane.status)).toEqual(['assigned', 'assigned'])
    expect(hydrated.map((pane) => pane.errorMessage)).toEqual([undefined, undefined])
  })

  it('stores the gemstone snapshot on the persisted document independently of app layouts', () => {
    const state: PersistedState = {
      version: 1,
      preferences: { glassMaterial: 'follow-system', fontSize: 14 },
      commandProfiles: [],
      layoutProfiles: [],
      activeLayoutId: undefined
    }
    const snapshot = createGemstoneWorkspaceSnapshot(
      [createPane({ id: 'opal-pane', material: 'opal', facetOrientation: 'symmetric' })],
      'opal-pane',
      false
    )
    const nextState = mergeGemstoneWorkspaceSnapshot(state, snapshot)

    expect(getGemstoneWorkspaceSnapshot(nextState)?.panes[0]).toMatchObject({
      id: 'opal-pane',
      material: 'opal',
      facetOrientation: 'symmetric'
    })
    expect(nextState.layoutProfiles).toEqual([])
  })

  it('persists hidden pane visibility separately from runtime session fields', () => {
    const snapshot = createGemstoneWorkspaceSnapshot(
      [createPane({ id: 'hidden-pane', hidden: true, ptyId: 'pty-hidden' })],
      'hidden-pane',
      false
    )
    const hydrated = hydrateGemstonePanes(snapshot, [], canvas)[0]

    expect(snapshot.panes[0].hidden).toBe(true)
    expect(hydrated).toMatchObject({
      id: 'hidden-pane',
      hidden: true,
      ptyId: null,
      status: 'assigned'
    })
  })

  it('persists the collapsible workspace display-style selector preference', () => {
    const defaultSnapshot = createGemstoneWorkspaceSnapshot([createPane()], 'gem-shell', false)
    const collapsedSnapshot = createGemstoneWorkspaceSnapshot([createPane()], 'gem-shell', false, false, 'dark-glass', false)
    const expandedSnapshot = createGemstoneWorkspaceSnapshot(
      [createPane()],
      'gem-shell',
      false,
      true,
      'dark-glass',
      true
    )
    const state: PersistedState = {
      version: 1,
      preferences: { glassMaterial: 'follow-system', fontSize: 14 },
      commandProfiles: [],
      layoutProfiles: [],
      activeLayoutId: undefined
    }

    expect(defaultSnapshot.displayStyleSelectorExpanded).toBe(false)
    expect(collapsedSnapshot.displayStyleSelectorExpanded).toBe(false)
    expect(collapsedSnapshot.backgroundSelectorExpanded).toBe(false)
    expect(expandedSnapshot.displayStyleSelectorExpanded).toBe(true)
    expect(expandedSnapshot.backgroundSelectorExpanded).toBe(true)
    expect(expandedSnapshot.inspectorOpen).toBe(false)
    expect(getGemstoneWorkspaceSnapshot(mergeGemstoneWorkspaceSnapshot(state, collapsedSnapshot))?.displayStyleSelectorExpanded).toBe(
      false
    )
  })

  it('persists inspector open state and saved gemstone layouts without using production layouts', () => {
    const state: PersistedState = {
      version: 1,
      preferences: { glassMaterial: 'follow-system', fontSize: 14 },
      commandProfiles: [],
      layoutProfiles: [],
      activeLayoutId: undefined
    }
    const savedWorkspace = createGemstoneWorkspaceSnapshot(
      [createPane({ id: 'layout-pane', material: 'emerald' })],
      'layout-pane',
      false,
      false,
      'dark-glass',
      false,
      true
    )
    const snapshot = createGemstoneWorkspaceSnapshot(
      [createPane({ id: 'live-pane', material: 'ruby' })],
      'live-pane',
      false,
      false,
      'simple-glass',
      false,
      true,
      [
        {
          id: 'layout-one',
          name: 'Daily Lab',
          createdAt: '2026-06-20T13:00:00.000Z',
          updatedAt: '2026-06-20T13:00:00.000Z',
          workspace: {
            schemaVersion: 1,
            selectedPaneId: savedWorkspace.selectedPaneId,
            globalLocked: savedWorkspace.globalLocked,
            displayStyleSelectorExpanded: savedWorkspace.displayStyleSelectorExpanded,
            background: savedWorkspace.background,
            backgroundSelectorExpanded: savedWorkspace.backgroundSelectorExpanded,
            inspectorOpen: savedWorkspace.inspectorOpen,
            panes: savedWorkspace.panes
          }
        }
      ],
      'layout-one'
    )

    const reloaded = getGemstoneWorkspaceSnapshot(mergeGemstoneWorkspaceSnapshot(state, snapshot))

    expect(reloaded?.inspectorOpen).toBe(true)
    expect(reloaded?.savedLayouts?.[0]).toMatchObject({
      id: 'layout-one',
      name: 'Daily Lab',
      workspace: {
        background: 'simple-onyx',
        inspectorOpen: true
      }
    })
    expect(reloaded?.activeSavedLayoutId).toBe('layout-one')
    expect(mergeGemstoneWorkspaceSnapshot(state, snapshot).layoutProfiles).toEqual([])
  })

  it('persists selected background after serialization and reload', () => {
    const state: PersistedState = {
      version: 1,
      preferences: { glassMaterial: 'follow-system', fontSize: 14 },
      commandProfiles: [],
      layoutProfiles: [],
      activeLayoutId: undefined
    }
    const snapshot = createGemstoneWorkspaceSnapshot(
      [createPane()],
      'gem-shell',
      false,
      false,
      'original-grid',
      true
    )

    const reloaded = getGemstoneWorkspaceSnapshot(mergeGemstoneWorkspaceSnapshot(state, snapshot))

    expect(reloaded?.background).toBe('original-grid')
    expect(reloaded?.backgroundSelectorExpanded).toBe(true)
  })

  it('keeps background changes independent from pane geometry and runtime session state', () => {
    const runningPane = createPane({
      bounds: { x: 88, y: 99, width: 640, height: 410 },
      restoreBounds: { x: 30, y: 40, width: 500, height: 320 },
      ptyId: 'pty-live',
      launchedProfileId: 'builtin.shell',
      errorMessage: 'runtime only'
    })

    const simpleSnapshot = createGemstoneWorkspaceSnapshot([runningPane], 'gem-shell', false, false, 'simple-glass')
    const darkSnapshot = createGemstoneWorkspaceSnapshot([runningPane], 'gem-shell', false, false, 'simple-onyx')

    expect(darkSnapshot.panes).toEqual(simpleSnapshot.panes)
    const hydrated = hydrateGemstonePanes(darkSnapshot, [], canvas)[0]

    expect(hydrated).toMatchObject({
      bounds: runningPane.bounds,
      restoreBounds: runningPane.restoreBounds,
      ptyId: null
    })
    expect(hydrated.launchedProfileId).toBeUndefined()
    expect(hydrated.errorMessage).toBeUndefined()
  })

  it('normalizes background presets and defaults to Simple Glass for every color scheme', () => {
    expect(GEMSTONE_BACKGROUNDS).toContain('original-grid')
    expect(GEMSTONE_BACKGROUNDS).toEqual([
      'simple-glass',
      'simple-diamond',
      'simple-onyx',
      'simple-amethyst',
      'simple-cobalt',
      'simple-emerald',
      'simple-ruby',
      'simple-opal',
      'original-grid',
      'dark-glass',
      'custom-local-asset',
      'icy-glass-surface'
    ])
    expect(new Set(GEMSTONE_BACKGROUNDS).size).toBe(GEMSTONE_BACKGROUNDS.length)
    expect(normalizeGemstoneBackground('simple-glass')).toBe('simple-glass')
    expect(normalizeGemstoneBackground('simple-diamond')).toBe('simple-diamond')
    expect(normalizeGemstoneBackground('simple-onyx')).toBe('simple-onyx')
    expect(normalizeGemstoneBackground('simple-amethyst')).toBe('simple-amethyst')
    expect(normalizeGemstoneBackground('simple-cobalt')).toBe('simple-cobalt')
    expect(normalizeGemstoneBackground('simple-emerald')).toBe('simple-emerald')
    expect(normalizeGemstoneBackground('simple-ruby')).toBe('simple-ruby')
    expect(normalizeGemstoneBackground('simple-opal')).toBe('simple-opal')
    expect(normalizeGemstoneBackground('dark-glass')).toBe('simple-onyx')
    expect(normalizeGemstoneBackground('custom-local-asset')).toBe('custom-local-asset')
    expect(normalizeGemstoneBackground('original-grid')).toBe('original-grid')
    expect(normalizeGemstoneBackground('icy-glass')).toBe('icy-glass-surface')
    expect(normalizeGemstoneBackground('icy-crystal')).toBe('simple-glass')
    expect(normalizeGemstoneBackground('onyx-depth')).toBe('simple-onyx')
    expect(normalizeGemstoneBackground('opal-aurora')).toBe('simple-glass')
    expect(normalizeGemstoneBackground('grid' as never, 'dark-glass')).toBe('dark-glass')
    expect(getDefaultGemstoneBackground(false)).toBe('simple-glass')
    expect(getDefaultGemstoneBackground(true)).toBe('simple-glass')
  })

  it('defines live background registry metadata and keeps only one stable default', () => {
    expect(GEMSTONE_BACKGROUND_REGISTRY.map((background) => background.name)).toEqual([
      'Simple Glass',
      'Simple Diamond',
      'Simple Onyx',
      'Simple Amethyst',
      'Simple Cobalt',
      'Simple Emerald',
      'Simple Ruby',
      'Simple Opal',
      'Original Grid',
      'Dark Glass',
      'Custom Background',
      'Icy Glass Surface'
    ])
    expect(GEMSTONE_BACKGROUND_REGISTRY.filter((background) => background.default).map((background) => background.id)).toEqual([
      'simple-glass'
    ])

    for (const background of GEMSTONE_BACKGROUND_REGISTRY) {
      expect(['css', 'svg', 'image', 'webgl']).toContain(background.type)
      expect(['light', 'dark', 'both']).toContain(background.suitability)
      expect(typeof background.shortDescription).toBe('string')
      expect(background.shortDescription.length).toBeGreaterThan(12)
      expect(background.opacity).toBeGreaterThan(0)
      expect(background.intensity).toBeGreaterThan(0)
    }

    expect(GEMSTONE_BACKGROUND_REGISTRY.filter((background) => !background.experimental).map((background) => background.name)).toEqual([
      'Simple Glass',
      'Simple Diamond',
      'Simple Onyx',
      'Simple Amethyst',
      'Simple Cobalt',
      'Simple Emerald',
      'Simple Ruby',
      'Simple Opal',
      'Original Grid'
    ])
    expect(GEMSTONE_BACKGROUND_REGISTRY.filter((background) => background.experimental).map((background) => background.name)).toEqual([
      'Dark Glass',
      'Custom Background',
      'Icy Glass Surface'
    ])
    expect(DAILY_GEMSTONE_BACKGROUND_REGISTRY.map((background) => background.name)).toEqual([
      'Simple Glass',
      'Simple Diamond',
      'Simple Onyx',
      'Simple Amethyst',
      'Simple Cobalt',
      'Simple Emerald',
      'Simple Ruby',
      'Simple Opal',
      'Original Grid'
    ])
    expect(REFERENCE_GEMSTONE_BACKGROUND_REGISTRY.map((background) => background.name)).toEqual([
      'Dark Glass',
      'Custom Background',
      'Icy Glass Surface'
    ])
    expect(getGemstoneBackgroundDefinition('original-grid').experimental).toBe(false)
    expect(getGemstoneBackgroundDefinition('simple-onyx')).toMatchObject({
      name: 'Simple Onyx',
      experimental: false,
      type: 'css'
    })
    expect(getGemstoneBackgroundDefinition('icy-glass-surface')).toMatchObject({
      name: 'Icy Glass Surface',
      experimental: true,
      type: 'css',
      suitability: 'both'
    })
    expect(getGemstoneBackgroundDefinition('custom-local-asset')).toMatchObject({
      type: 'image',
      suitability: 'both'
    })
  })

  it('persists experimental backgrounds without changing pane geometry or reviving sessions', () => {
    const runningPane = createPane({
      bounds: { x: 122, y: 88, width: 620, height: 390 },
      restoreBounds: { x: 40, y: 50, width: 500, height: 320 },
      status: 'running',
      ptyId: 'pty-reference',
      launchedProfileId: 'builtin.shell',
      errorMessage: 'runtime only'
    })

    for (const background of ['custom-local-asset', 'icy-glass-surface'] as const) {
      const snapshot = createGemstoneWorkspaceSnapshot([runningPane], 'gem-shell', false, false, background)
      const reloaded = getGemstoneWorkspaceSnapshot(
        mergeGemstoneWorkspaceSnapshot(
          {
            version: 1,
            preferences: { glassMaterial: 'follow-system', fontSize: 14 },
            commandProfiles: [],
            layoutProfiles: [],
            activeLayoutId: undefined
          },
          snapshot
        )
      )
      const hydrated = hydrateGemstonePanes(reloaded, [], canvas)[0]

      expect(reloaded?.background).toBe(background)
      expect(hydrated.bounds).toEqual(runningPane.bounds)
      expect(hydrated.restoreBounds).toEqual(runningPane.restoreBounds)
      expect(hydrated.ptyId).toBeNull()
      expect(hydrated.launchedProfileId).toBeUndefined()
      expect(hydrated.errorMessage).toBeUndefined()
    }
  })

  it('falls back to safe defaults for invalid persisted material and orientation values', () => {
    const snapshot = createGemstoneWorkspaceSnapshot(
      [createPane({ material: 'emerald', facetOrientation: 'left' })],
      'gem-shell',
      false
    )

    snapshot.panes[0] = {
      ...snapshot.panes[0],
      material: 'glass' as never,
      facetOrientation: 'upside-down' as never
    }

    expect(hydrateGemstonePanes(snapshot, [], canvas)[0]).toMatchObject({
      material: 'diamond',
      facetOrientation: 'right'
    })
  })
})
