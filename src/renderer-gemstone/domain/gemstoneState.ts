import type { PaneStatus, PersistedState } from '../../shared'
import { clampPaneBounds, type CanvasSize, type PixelBounds } from './geometry'
import {
  DEFAULT_GEMSTONE_BACKGROUND,
  GEMSTONE_BACKGROUNDS,
  getDefaultGemstoneBackground
} from './backgroundRegistry'

export {
  DAILY_GEMSTONE_BACKGROUND_REGISTRY,
  GEMSTONE_BACKGROUND_REGISTRY,
  GEMSTONE_BACKGROUNDS,
  REFERENCE_GEMSTONE_BACKGROUND_REGISTRY,
  getDefaultGemstoneBackground,
  getGemstoneBackgroundDefinition
} from './backgroundRegistry'
export type {
  GemstoneBackgroundDefinition,
  GemstoneBackgroundSuitability,
  GemstoneBackgroundType
} from './backgroundRegistry'

export type GemTreatment = 'sharp' | 'polished' | 'architectural'
export type GemMaterial = 'diamond' | 'onyx' | 'opal' | 'amethyst' | 'cobalt' | 'emerald' | 'ruby'
export type FacetOrientation = 'right' | 'left' | 'symmetric'
export type GemstoneBackground =
  | 'original-grid'
  | 'simple-glass'
  | 'simple-diamond'
  | 'simple-onyx'
  | 'simple-amethyst'
  | 'simple-cobalt'
  | 'simple-emerald'
  | 'simple-ruby'
  | 'simple-opal'
  | 'dark-glass'
  | 'custom-local-asset'
  | 'icy-glass-surface'

export interface GemPaneState {
  id: string
  title: string
  profileId: string | null
  material: GemMaterial
  treatment: GemTreatment
  facetOrientation: FacetOrientation
  bounds: PixelBounds
  restoreBounds?: PixelBounds
  zIndex: number
  locked: boolean
  maximized: boolean
  hidden?: boolean
  status: PaneStatus
  ptyId: string | null
  launchedProfileId?: string
  errorMessage?: string
}

export interface StoredGemPaneState {
  id: string
  title: string
  profileId: string | null
  material: GemMaterial
  treatment: GemTreatment
  facetOrientation: FacetOrientation
  bounds: PixelBounds
  restoreBounds?: PixelBounds
  zIndex: number
  locked: boolean
  maximized: boolean
  hidden?: boolean
}

export interface GemstoneWorkspaceSnapshot {
  schemaVersion: 1
  selectedPaneId?: string
  globalLocked: boolean
  displayStyleSelectorExpanded?: boolean
  background?: GemstoneBackground
  backgroundSelectorExpanded?: boolean
  inspectorOpen?: boolean
  panes: StoredGemPaneState[]
  savedLayouts?: GemstoneSavedLayout[]
  activeSavedLayoutId?: string
}

export type GemstoneLayoutData = Omit<GemstoneWorkspaceSnapshot, 'savedLayouts' | 'activeSavedLayoutId'>

export interface GemstoneSavedLayout {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  workspace: GemstoneLayoutData
}

export type PersistedStateWithGemstoneWorkspace = PersistedState & {
  gemstoneWorkspace?: GemstoneWorkspaceSnapshot
}

export const MATERIALS: GemMaterial[] = [
  'diamond',
  'onyx',
  'opal',
  'amethyst',
  'cobalt',
  'emerald',
  'ruby'
]
export const TREATMENTS: GemTreatment[] = ['sharp', 'polished', 'architectural']
export const FACET_ORIENTATIONS: FacetOrientation[] = ['right', 'left', 'symmetric']
export const LIGHT_GEMSTONE_BACKGROUND: GemstoneBackground = DEFAULT_GEMSTONE_BACKGROUND
export const DARK_GEMSTONE_BACKGROUND: GemstoneBackground = 'dark-glass'
const LEGACY_GEMSTONE_BACKGROUNDS: Record<string, GemstoneBackground> = {
  'dark-glass': 'simple-onyx',
  'icy-glass': 'icy-glass-surface',
  'crystal-mist': 'simple-glass',
  'smoked-glass': 'simple-onyx',
  'opal-glass': 'simple-glass',
  'icy-crystal': 'simple-glass',
  'glacial-glow': 'simple-glass',
  'faceted-frost': 'simple-glass',
  'onyx-depth': 'simple-onyx',
  'opal-aurora': 'simple-glass'
}

export function createGemstoneWorkspaceSnapshot(
  panes: readonly GemPaneState[],
  selectedPaneId: string,
  globalLocked: boolean,
  displayStyleSelectorExpanded = false,
  background: GemstoneBackground = LIGHT_GEMSTONE_BACKGROUND,
  backgroundSelectorExpanded = false,
  inspectorOpen = false,
  savedLayouts: readonly GemstoneSavedLayout[] = [],
  activeSavedLayoutId?: string
): GemstoneWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    selectedPaneId,
    globalLocked,
    displayStyleSelectorExpanded,
    background,
    backgroundSelectorExpanded,
    inspectorOpen,
    panes: panes.map((pane) => ({
      id: pane.id,
      title: pane.title,
      profileId: pane.profileId,
      material: pane.material,
      treatment: pane.treatment,
      facetOrientation: pane.facetOrientation,
      bounds: { ...pane.bounds },
      restoreBounds: pane.restoreBounds ? { ...pane.restoreBounds } : undefined,
      zIndex: pane.zIndex,
      locked: pane.locked,
      maximized: pane.maximized,
      hidden: pane.hidden === true
    })),
    savedLayouts: savedLayouts.map(cloneSavedLayout),
    activeSavedLayoutId
  }
}

export function getGemstoneWorkspaceSnapshot(
  state: PersistedState | null | undefined
): GemstoneWorkspaceSnapshot | null {
  const candidate = (state as PersistedStateWithGemstoneWorkspace | null | undefined)?.gemstoneWorkspace

  if (!candidate || candidate.schemaVersion !== 1 || !Array.isArray(candidate.panes)) {
    return null
  }

  return {
    ...candidate,
    background: normalizeGemstoneBackground(candidate.background),
    savedLayouts: normalizeSavedLayouts(candidate.savedLayouts),
    activeSavedLayoutId:
      typeof candidate.activeSavedLayoutId === 'string' ? candidate.activeSavedLayoutId : undefined
  }
}

export function mergeGemstoneWorkspaceSnapshot(
  state: PersistedStateWithGemstoneWorkspace,
  snapshot: GemstoneWorkspaceSnapshot
): PersistedStateWithGemstoneWorkspace {
  return {
    ...state,
    gemstoneWorkspace: snapshot
  }
}

export function hydrateGemstonePanes(
  snapshot: GemstoneWorkspaceSnapshot | null,
  fallbackPanes: readonly GemPaneState[],
  canvasSize: CanvasSize
): GemPaneState[] {
  if (!snapshot || snapshot.panes.length === 0) {
    return fallbackPanes.map((pane) => ({ ...pane }))
  }

  return snapshot.panes.map((pane, index) => {
    const profileId = typeof pane.profileId === 'string' ? pane.profileId : null
    const bounds = clampPaneBounds(normalizeBounds(pane.bounds, fallbackPanes[index]?.bounds), canvasSize)
    const restoreBounds = pane.restoreBounds
      ? clampPaneBounds(normalizeBounds(pane.restoreBounds, fallbackPanes[index]?.restoreBounds), canvasSize)
      : undefined

    return {
      id: normalizeString(pane.id, fallbackPanes[index]?.id ?? `gem-pane-${index + 1}`),
      title: normalizeString(pane.title, fallbackPanes[index]?.title ?? 'Gemstone Pane'),
      profileId,
      material: normalizeMaterial(pane.material),
      treatment: normalizeTreatment(pane.treatment),
      facetOrientation: normalizeFacetOrientation(pane.facetOrientation),
      bounds,
      restoreBounds,
      zIndex: normalizeInteger(pane.zIndex, index + 1, 1),
      locked: pane.locked === true,
      maximized: pane.maximized === true,
      hidden: pane.hidden === true,
      status: getInitialStatus(profileId),
      ptyId: null
    }
  })
}

export function getInitialStatus(profileId: string | null): PaneStatus {
  return profileId ? 'assigned' : 'blank'
}

export function normalizeMaterial(value: unknown): GemMaterial {
  return MATERIALS.includes(value as GemMaterial) ? (value as GemMaterial) : 'diamond'
}

export function normalizeTreatment(value: unknown): GemTreatment {
  return TREATMENTS.includes(value as GemTreatment) ? (value as GemTreatment) : 'sharp'
}

export function normalizeFacetOrientation(value: unknown): FacetOrientation {
  return FACET_ORIENTATIONS.includes(value as FacetOrientation) ? (value as FacetOrientation) : 'right'
}

export function normalizeGemstoneBackground(
  value: unknown,
  fallback: GemstoneBackground = LIGHT_GEMSTONE_BACKGROUND
): GemstoneBackground {
  if (typeof value === 'string' && LEGACY_GEMSTONE_BACKGROUNDS[value]) {
    return LEGACY_GEMSTONE_BACKGROUNDS[value]
  }

  return GEMSTONE_BACKGROUNDS.includes(value as GemstoneBackground) ? (value as GemstoneBackground) : fallback
}

function normalizeBounds(value: unknown, fallback?: PixelBounds): PixelBounds {
  const candidate = value && typeof value === 'object' ? (value as Partial<PixelBounds>) : {}

  return {
    x: normalizeNumber(candidate.x, fallback?.x ?? 64),
    y: normalizeNumber(candidate.y, fallback?.y ?? 72),
    width: normalizeNumber(candidate.width, fallback?.width ?? 560),
    height: normalizeNumber(candidate.height, fallback?.height ?? 360)
  }
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeInteger(value: unknown, fallback: number, min: number): number {
  return Math.max(Math.trunc(normalizeNumber(value, fallback)), min)
}

function cloneSavedLayout(layout: GemstoneSavedLayout): GemstoneSavedLayout {
  return {
    id: layout.id,
    name: layout.name,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
    workspace: cloneLayoutData(layout.workspace)
  }
}

function cloneLayoutData(layout: GemstoneLayoutData): GemstoneLayoutData {
  return {
    schemaVersion: 1,
    selectedPaneId: layout.selectedPaneId,
    globalLocked: layout.globalLocked,
    displayStyleSelectorExpanded: layout.displayStyleSelectorExpanded === true,
    background: normalizeGemstoneBackground(layout.background),
    backgroundSelectorExpanded: layout.backgroundSelectorExpanded === true,
    inspectorOpen: layout.inspectorOpen === true,
    panes: Array.isArray(layout.panes)
      ? layout.panes.map((pane, index) => ({
          id: normalizeString(pane.id, `gem-pane-${index + 1}`),
          title: normalizeString(pane.title, 'Gemstone Pane'),
          profileId: typeof pane.profileId === 'string' ? pane.profileId : null,
          material: normalizeMaterial(pane.material),
          treatment: normalizeTreatment(pane.treatment),
          facetOrientation: normalizeFacetOrientation(pane.facetOrientation),
          bounds: normalizeBounds(pane.bounds),
          restoreBounds: pane.restoreBounds ? normalizeBounds(pane.restoreBounds) : undefined,
          zIndex: normalizeInteger(pane.zIndex, index + 1, 1),
          locked: pane.locked === true,
          maximized: pane.maximized === true,
          hidden: pane.hidden === true
        }))
      : []
  }
}

function normalizeSavedLayouts(value: unknown): GemstoneSavedLayout[] {
  if (!Array.isArray(value)) {
    return []
  }

  const layouts: GemstoneSavedLayout[] = []
  const seenIds = new Set<string>()

  for (const [index, layout] of value.entries()) {
    const candidate = layout && typeof layout === 'object' ? (layout as Partial<GemstoneSavedLayout>) : null

    if (!candidate || !candidate.workspace || candidate.workspace.schemaVersion !== 1) {
      continue
    }

    const id = normalizeString(candidate.id, `gem-layout-${index + 1}`)

    if (seenIds.has(id)) {
      continue
    }

    seenIds.add(id)
    layouts.push({
      id,
      name: normalizeString(candidate.name, `Layout ${layouts.length + 1}`),
      createdAt: normalizeString(candidate.createdAt, ''),
      updatedAt: normalizeString(candidate.updatedAt, candidate.createdAt || ''),
      workspace: cloneLayoutData(candidate.workspace)
    })
  }

  return layouts
}
