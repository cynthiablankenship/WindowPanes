import {
  DEFAULT_PERSISTED_STATE,
  migrateGlassMaterialPreference,
  STORAGE_VERSION,
  type AppPreferences,
  type LayoutProfile,
  type PersistedState,
  type StorageApi
} from '../../shared'
import { getPersistableCommandProfiles } from './commandProfiles'
import {
  createDefaultLayoutProfile,
  normalizeLayoutProfile,
  normalizeLayoutProfileNames
} from './layoutProfiles'

export type WorkspaceState = PersistedState & {
  layoutProfiles: LayoutProfile[]
  activeLayoutId: string
}

export async function loadWorkspaceState(storageApi: Pick<StorageApi, 'load'>): Promise<WorkspaceState> {
  return hydratePersistedState(await storageApi.load())
}

export async function saveWorkspaceState(
  storageApi: Pick<StorageApi, 'save'>,
  state: WorkspaceState
): Promise<void> {
  await storageApi.save(toPersistedState(state))
}

export function hydratePersistedState(state: PersistedState | null | undefined): WorkspaceState {
  const base = state && state.version === STORAGE_VERSION ? state : DEFAULT_PERSISTED_STATE
  const layoutProfiles = normalizeLayoutProfileNames(base.layoutProfiles.map(normalizeLayoutProfile))
  const nextLayouts = layoutProfiles.length > 0 ? layoutProfiles : [createDefaultLayoutProfile()]
  const activeLayoutId =
    base.activeLayoutId && nextLayouts.some((layout) => layout.id === base.activeLayoutId)
      ? base.activeLayoutId
      : nextLayouts[0].id

  return {
    version: STORAGE_VERSION,
    preferences: migratePreferences(base.preferences),
    commandProfiles: getPersistableCommandProfiles(base.commandProfiles),
    layoutProfiles: nextLayouts,
    activeLayoutId
  }
}

function migratePreferences(preferences: AppPreferences): AppPreferences {
  return {
    ...DEFAULT_PERSISTED_STATE.preferences,
    ...preferences,
    glassMaterial: migrateGlassMaterialPreference(preferences.glassMaterial, preferences.glassTheme),
    theme: undefined,
    glassTheme: undefined
  }
}

export function toPersistedState(state: WorkspaceState): PersistedState {
  return {
    version: STORAGE_VERSION,
    preferences: migratePreferences(state.preferences),
    commandProfiles: getPersistableCommandProfiles(state.commandProfiles),
    layoutProfiles: normalizeLayoutProfileNames(state.layoutProfiles.map(normalizeLayoutProfile)),
    activeLayoutId: state.activeLayoutId
  }
}
