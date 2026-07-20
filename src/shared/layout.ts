import type { GlassMaterialPreference, GlassThemePreference } from './themes'

/**
 * Layout types describe *how* panes are arranged and which CommandProfile is
 * assigned to each pane. bob owns the renderer-side layout/profile management;
 * these types are the persisted, serializable shape.
 */

/**
 * Runtime status of a single pane.
 * - blank:    no profile assigned yet
 * - assigned: a profile is assigned but no process is running
 * - starting: spawn is in progress
 * - running:  a pty is live for this pane
 * - error:    last spawn failed or the process exited non-zero
 */
export type PaneStatus = 'blank' | 'assigned' | 'starting' | 'running' | 'error'

/** Supported split arrangements. Each maps to a fixed pane count. */
export type LayoutPreset =
  | 'single' // 1 pane
  | 'two-vertical' // 2 panes, side by side
  | 'two-horizontal' // 2 panes, stacked
  | 'three-pane' // 3 panes (one + two split)
  | 'four-grid' // 2x2 grid

/** Number of panes each preset renders. Source of truth for both sides. */
export const PRESET_PANE_COUNT: Record<LayoutPreset, number> = {
  single: 1,
  'two-vertical': 2,
  'two-horizontal': 2,
  'three-pane': 3,
  'four-grid': 4
}

export type PaneLayoutMode = 'docked' | 'floating'
export type WorkspaceMode = 'docked' | 'canvas'

export type PaneSnapTarget =
  | 'none'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** Percent-based pane bounds within the workspace canvas. */
export interface PaneBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Future-compatible pane placement metadata.
 *
 * This iteration still renders panes through the docked split layout, but each
 * pane carries canvas-ready bounds, stacking, lock, and snap metadata so a
 * later floating renderer can consume saved layouts without reshaping storage.
 */
export interface PanePlacement {
  mode: PaneLayoutMode
  bounds: PaneBounds
  restoreBounds?: PaneBounds
  zIndex: number
  locked: boolean
  maximized?: boolean
  visible: boolean
  snapTarget: PaneSnapTarget
}

/**
 * Persisted per-pane configuration within a layout. Holds only durable
 * assignment data — runtime status and the live ptyId are NOT persisted.
 */
export interface PaneConfig {
  /** Stable id, unique within the LayoutProfile. */
  id: string
  /** Assigned CommandProfile id, or null when the pane is blank. */
  profileId: string | null
  /** Durable placement metadata used by docked layouts now and floating panes later. */
  placement?: PanePlacement
}

/**
 * Runtime pane state, held in renderer memory only (never persisted).
 * Created by bob's layout state from a PaneConfig + live terminal status.
 */
export interface PaneRuntime {
  config: PaneConfig
  status: PaneStatus
  /** Live pty handle id when status === 'running'; otherwise null. */
  ptyId: string | null
  /** Command profile id used to launch the live pty, when known. */
  launchedProfileId?: string
  /** Last launch/terminal error for this pane, held in renderer memory only. */
  errorMessage?: string
}

/** A saved, named workspace layout. Persisted in app storage. */
export interface LayoutProfile {
  /** Stable id. */
  id: string
  /** Human-readable label. */
  name: string
  /** Arrangement; determines pane count (must match panes.length). */
  preset: LayoutPreset
  /** Current workspace renderer for this layout. Legacy layouts hydrate as docked. */
  workspaceMode?: WorkspaceMode
  /** When true, Canvas panes cannot be moved or structurally resized. */
  layoutLocked?: boolean
  /** Optional per-layout glass material override. */
  glassMaterial?: GlassMaterialPreference
  /** Legacy per-layout glass theme override retained for v0.2.0 storage migration. */
  glassTheme?: GlassThemePreference
  /** One entry per pane, ordered to match the preset's visual slots. */
  panes: PaneConfig[]
  /**
   * Split sizes as percentages. Two-pane layouts store one pair. Three Pane
   * and Four Grid store column pair followed by row pair. Empty/omitted means
   * use even splits.
   */
  sizes: number[]
}
