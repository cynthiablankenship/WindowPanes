/**
 * Local app storage model. A single JSON document persisted in Electron's
 * userData directory. Stores ONLY app preferences, user command-profile
 * metadata, and saved layout profiles.
 *
 * Explicitly NOT stored: terminal transcripts, command output, keystrokes,
 * or any provider credentials. No transcripts are logged by default.
 */

import type { CommandProfile } from './profiles'
import type { LayoutProfile } from './layout'
import type { ColorModePreference, GlassMaterialPreference, GlassThemePreference } from './themes'

export interface AppPreferences {
  /** Legacy light/dark mode retained only for v0.2.0 storage migration. */
  theme?: ColorModePreference
  /** Curated glass material. Follow system resolves to Diamond in light mode and Onyx in dark mode. */
  glassMaterial?: GlassMaterialPreference
  /** Legacy glass/gem visual theme retained only for v0.2.0 storage migration. */
  glassTheme?: GlassThemePreference
  /** Terminal font size in px. */
  fontSize: number
  /** Profile assigned to newly created blank panes, if any. */
  defaultProfileId?: string
}

/** Top-level persisted document. Bump `version` on breaking shape changes. */
export interface PersistedState {
  version: number
  preferences: AppPreferences
  /**
   * User-defined command profiles only. BUILT_IN_PROFILES are merged in at
   * runtime and are never written to disk.
   */
  commandProfiles: CommandProfile[]
  /** Saved layouts. */
  layoutProfiles: LayoutProfile[]
  /** Id of the layout to restore on launch. */
  activeLayoutId?: string
}

export const STORAGE_VERSION = 1

/** Default document used on first launch or when storage is missing/corrupt. */
export const DEFAULT_PERSISTED_STATE: PersistedState = {
  version: STORAGE_VERSION,
  preferences: { glassMaterial: 'follow-system', fontSize: 14 },
  commandProfiles: [],
  layoutProfiles: [],
  activeLayoutId: undefined
}
