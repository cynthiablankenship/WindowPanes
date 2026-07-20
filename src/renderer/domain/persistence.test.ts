import {
  BUILT_IN_PROFILES,
  DEFAULT_PERSISTED_STATE,
  type PersistedState,
  type StorageApi
} from '../../shared'
import { createCustomCommandProfile } from './commandProfiles'
import {
  assignProfileToPane,
  createLayoutProfile,
  moveCanvasPane,
  setLayoutGlassMaterial,
  setLayoutWorkspaceMode,
  updateLayoutSplitSizes
} from './layoutProfiles'
import { hydratePersistedState, loadWorkspaceState, saveWorkspaceState, toPersistedState } from './persistence'

describe('workspace persistence', () => {
  it('hydrates a default layout when storage is empty', () => {
    const workspace = hydratePersistedState(DEFAULT_PERSISTED_STATE)

    expect(workspace.layoutProfiles).toHaveLength(1)
    expect(workspace.activeLayoutId).toBe(workspace.layoutProfiles[0].id)
  })

  it('restores active layout and assigned profiles from persisted state', () => {
    const layout = createLayoutProfile('two-vertical', 'Pair', {
      id: 'layout.pair',
      profileId: 'builtin.claude'
    })
    const state: PersistedState = {
      ...DEFAULT_PERSISTED_STATE,
      layoutProfiles: [layout],
      activeLayoutId: layout.id
    }

    const workspace = hydratePersistedState(state)

    expect(workspace.activeLayoutId).toBe('layout.pair')
    expect(workspace.layoutProfiles[0].panes[0].profileId).toBe('builtin.claude')
    expect(workspace.layoutProfiles[0].panes[1].profileId).toBe('builtin.claude')
  })

  it('hydrates duplicate layout names into unique selector labels', () => {
    const state: PersistedState = {
      ...DEFAULT_PERSISTED_STATE,
      layoutProfiles: [
        createLayoutProfile('single', 'Default', { id: 'layout.default' }),
        createLayoutProfile('single', 'Default', { id: 'layout.default.copy' })
      ],
      activeLayoutId: 'layout.default.copy'
    }

    const workspace = hydratePersistedState(state)

    expect(workspace.layoutProfiles.map((layout) => layout.name)).toEqual(['Default', 'Default Copy'])
    expect(workspace.activeLayoutId).toBe('layout.default.copy')
  })

  it('saves only command metadata and layout profiles through the storage API', async () => {
    const custom = createCustomCommandProfile({ name: 'Codex Local', command: 'codex' })
    let savedState: PersistedState | undefined
    const storage: StorageApi = {
      async load() {
        return {
          ...DEFAULT_PERSISTED_STATE,
          commandProfiles: [custom],
          layoutProfiles: [createLayoutProfile('single', 'Solo', { id: 'layout.solo' })],
          activeLayoutId: 'layout.solo'
        }
      },
      async save(state) {
        savedState = state
      }
    }

    const workspace = await loadWorkspaceState(storage)
    await saveWorkspaceState(storage, {
      ...workspace,
      commandProfiles: [...BUILT_IN_PROFILES, ...workspace.commandProfiles]
    })

    expect(savedState).toEqual(toPersistedState(workspace))
    expect(savedState?.commandProfiles).toHaveLength(1)
    expect(savedState).not.toHaveProperty('paneRuntimes')
    expect(savedState).not.toHaveProperty('transcripts')
  })

  it('persists split sizes independently for each saved layout', () => {
    const pair = updateLayoutSplitSizes(
      assignProfileToPane(createLayoutProfile('two-vertical', 'Pair', { id: 'layout.pair' }), 'pane-1', 'builtin.codex'),
      'columns',
      [64, 36]
    )
    const grid = updateLayoutSplitSizes(
      updateLayoutSplitSizes(
        assignProfileToPane(createLayoutProfile('four-grid', 'Grid', { id: 'layout.grid' }), 'pane-4', 'builtin.droid'),
        'columns',
        [42, 58]
      ),
      'rows',
      [35, 65]
    )
    const state = toPersistedState({
      ...hydratePersistedState(DEFAULT_PERSISTED_STATE),
      layoutProfiles: [pair, grid],
      activeLayoutId: grid.id
    })

    const hydrated = hydratePersistedState(state)

    expect(hydrated.activeLayoutId).toBe('layout.grid')
    expect(hydrated.layoutProfiles.find((layout) => layout.id === 'layout.pair')).toMatchObject({
      preset: 'two-vertical',
      sizes: [64, 36],
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex' },
        { id: 'pane-2', profileId: null }
      ]
    })
    expect(hydrated.layoutProfiles.find((layout) => layout.id === 'layout.grid')).toMatchObject({
      preset: 'four-grid',
      sizes: [42, 58, 35, 65],
      panes: [
        { id: 'pane-1', profileId: null },
        { id: 'pane-2', profileId: null },
        { id: 'pane-3', profileId: null },
        { id: 'pane-4', profileId: 'builtin.droid' }
      ]
    })
  })

  it('persists Docked and Canvas workspace modes independently', () => {
    const docked = createLayoutProfile('two-vertical', 'Docked', { id: 'layout.docked' })
    const canvas = moveCanvasPane(
      setLayoutGlassMaterial(
        setLayoutWorkspaceMode(
          assignProfileToPane(createLayoutProfile('two-vertical', 'Canvas', { id: 'layout.canvas' }), 'pane-2', 'builtin.droid'),
          'canvas'
        ),
        'cobalt'
      ),
      'pane-2',
      { x: -8, y: 6 }
    )
    const state = toPersistedState({
      ...hydratePersistedState(DEFAULT_PERSISTED_STATE),
      layoutProfiles: [docked, canvas],
      activeLayoutId: canvas.id
    })

    const hydrated = hydratePersistedState(state)
    const hydratedDocked = hydrated.layoutProfiles.find((layout) => layout.id === docked.id)
    const hydratedCanvas = hydrated.layoutProfiles.find((layout) => layout.id === canvas.id)

    expect(hydratedDocked).toMatchObject({
      workspaceMode: 'docked',
      layoutLocked: true
    })
    expect(hydratedCanvas).toMatchObject({
      workspaceMode: 'canvas',
      layoutLocked: false,
      glassMaterial: 'cobalt',
      panes: [
        { id: 'pane-1', profileId: null },
        { id: 'pane-2', profileId: 'builtin.droid' }
      ]
    })
    expect(hydratedCanvas?.panes[1].placement).toMatchObject({
      mode: 'floating',
      visible: true
    })
  })

  it('hydrates v0.1 layout data safely into Docked mode', () => {
    const legacyLayout = {
      id: 'layout.old',
      name: 'Old Layout',
      preset: 'two-horizontal' as const,
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex' },
        { id: 'pane-2', profileId: 'builtin.claude' }
      ],
      sizes: [55, 45]
    }
    const state: PersistedState = {
      ...DEFAULT_PERSISTED_STATE,
      layoutProfiles: [legacyLayout],
      activeLayoutId: legacyLayout.id
    }

    const hydrated = hydratePersistedState(state)

    expect(hydrated.layoutProfiles[0]).toMatchObject({
      id: 'layout.old',
      workspaceMode: 'docked',
      layoutLocked: true,
      panes: [
        { id: 'pane-1', profileId: 'builtin.codex', placement: { mode: 'docked' } },
        { id: 'pane-2', profileId: 'builtin.claude', placement: { mode: 'docked' } }
      ]
    })
  })

  it('migrates old Color mode and Glass theme preferences into a Glass Material', () => {
    const state: PersistedState = {
      ...DEFAULT_PERSISTED_STATE,
      preferences: {
        theme: 'dark',
        glassTheme: 'ruby',
        fontSize: 14
      },
      layoutProfiles: [createLayoutProfile('single', 'Solo')],
      activeLayoutId: undefined
    }

    const hydrated = hydratePersistedState(state)
    const saved = toPersistedState(hydrated)

    expect(hydrated.preferences.glassMaterial).toBe('ruby')
    expect(saved.preferences.glassMaterial).toBe('ruby')
    expect(saved.preferences.theme).toBeUndefined()
    expect(saved.preferences.glassTheme).toBeUndefined()
  })

  it('migrates old automatic Glass theme settings to Follow system', () => {
    const hydrated = hydratePersistedState({
      ...DEFAULT_PERSISTED_STATE,
      preferences: {
        theme: 'light',
        glassTheme: 'auto',
        fontSize: 14
      }
    })

    expect(hydrated.preferences.glassMaterial).toBe('follow-system')
  })
})
