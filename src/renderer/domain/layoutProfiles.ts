import {
  PRESET_PANE_COUNT,
  type LayoutPreset,
  type LayoutProfile,
  type PaneBounds,
  type PaneConfig,
  type PanePlacement,
  type PaneRuntime,
  type PaneStatus,
  type WorkspaceMode,
  type GlassMaterialPreference,
  type GlassThemePreference
} from '../../shared'

export const DEFAULT_LAYOUT_ID = 'layout.default'
export type PaneSessionKey = `${string}:${string}`
export type PaneRuntimeSession = Pick<PaneRuntime, 'status' | 'ptyId' | 'errorMessage' | 'launchedProfileId'>
export type PaneRuntimeSessionsByKey = Partial<Record<PaneSessionKey, PaneRuntimeSession>>
export interface LayoutProfileMutationResult {
  layoutProfiles: LayoutProfile[]
  activeLayoutId: string
}

export const LAYOUT_PRESET_LABELS: Record<LayoutPreset, string> = {
  single: 'Single',
  'two-vertical': 'Two Vertical',
  'two-horizontal': 'Two Horizontal',
  'three-pane': 'Three Pane',
  'four-grid': 'Four Grid'
}

export const DEFAULT_PANE_PLACEMENT: PanePlacement = {
  mode: 'docked',
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  restoreBounds: undefined,
  zIndex: 1,
  locked: false,
  maximized: false,
  visible: true,
  snapTarget: 'none'
}

export type CanvasResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export interface CanvasSnapGuide {
  axis: 'x' | 'y'
  position: number
}

export interface CanvasSnapResult {
  bounds: PaneBounds
  guides: CanvasSnapGuide[]
  snapTarget: PanePlacement['snapTarget']
}

const MIN_CANVAS_PANE_WIDTH = 22
const MIN_CANVAS_PANE_HEIGHT = 24
const CANVAS_RECOVERY_WIDTH = 10
const CANVAS_RECOVERY_TITLE_BAR_HEIGHT = 10
const CANVAS_SNAP_THRESHOLD = 1

export function createLayoutProfile(
  preset: LayoutPreset,
  name = LAYOUT_PRESET_LABELS[preset],
  options: { id?: string; profileId?: string | null } = {}
): LayoutProfile {
  const panes = Array.from({ length: PRESET_PANE_COUNT[preset] }, (_, index) =>
    createPaneConfig(index, options.profileId ?? null)
  )

  return {
    id: options.id ?? `layout.${preset}.${Date.now().toString(36)}`,
    name,
    preset,
    workspaceMode: 'docked',
    layoutLocked: true,
    panes,
    sizes: createEvenSizes(preset)
  }
}

export function createDefaultLayoutProfile(): LayoutProfile {
  return createLayoutProfile('single', 'Default Layout', { id: DEFAULT_LAYOUT_ID })
}

export function normalizeLayoutProfile(profile: LayoutProfile): LayoutProfile {
  const expectedPaneCount = PRESET_PANE_COUNT[profile.preset]
  const sizes = normalizeSizes(profile.preset, profile.sizes)
  const workspaceMode = normalizeWorkspaceMode(profile.workspaceMode)
  const legacyCanvasLocked = workspaceMode === 'canvas' && profile.layoutLocked === true
  const panes = Array.from({ length: expectedPaneCount }, (_, index) => {
    const existing = profile.panes[index]
    const pane = normalizePaneConfig(
      existing ?? createPaneConfig(index),
      index,
      profile.preset,
      sizes,
      workspaceMode,
      expectedPaneCount
    )

    return legacyCanvasLocked && pane.placement
      ? { ...pane, placement: { ...pane.placement, locked: true } }
      : pane
  })

  return {
    ...profile,
    workspaceMode,
    layoutLocked: workspaceMode === 'canvas' ? false : profile.layoutLocked ?? true,
    glassMaterial: migrateLayoutGlassMaterial(profile),
    panes,
    sizes
  }
}

export function normalizeLayoutProfileNames(layoutProfiles: readonly LayoutProfile[]): LayoutProfile[] {
  return layoutProfiles.reduce<LayoutProfile[]>((profiles, layout) => {
    const name = getUniqueLayoutName(layout.name, profiles)

    profiles.push({ ...layout, name })

    return profiles
  }, [])
}

export function copyActiveLayoutProfile(
  layoutProfiles: readonly LayoutProfile[],
  activeLayoutId: string
): LayoutProfileMutationResult {
  const activeLayout =
    layoutProfiles.find((layout) => layout.id === activeLayoutId) ?? layoutProfiles[0]

  if (!activeLayout) {
    return { layoutProfiles: [], activeLayoutId }
  }

  const copy = {
    ...normalizeLayoutProfile(activeLayout),
    id: createSavedLayoutId(layoutProfiles),
    name: getUniqueLayoutCopyName(activeLayout.name, layoutProfiles)
  }

  return {
    layoutProfiles: [...layoutProfiles, copy],
    activeLayoutId: copy.id
  }
}

export function renameLayoutProfile(
  layoutProfiles: readonly LayoutProfile[],
  activeLayoutId: string,
  name: string
): LayoutProfileMutationResult {
  const validationError = getLayoutRenameError(layoutProfiles, activeLayoutId, name)

  if (validationError) {
    return {
      layoutProfiles: [...layoutProfiles],
      activeLayoutId
    }
  }

  const nextName = normalizeLayoutName(name)

  return {
    layoutProfiles: layoutProfiles.map((layout) =>
      layout.id === activeLayoutId ? { ...layout, name: nextName } : layout
    ),
    activeLayoutId
  }
}

export function getLayoutRenameError(
  layoutProfiles: readonly LayoutProfile[],
  activeLayoutId: string,
  name: string
): string {
  const nextName = name.trim()

  if (!nextName) {
    return 'Layout name is required.'
  }

  const hasDuplicate = layoutProfiles.some(
    (layout) => layout.id !== activeLayoutId && areLayoutNamesEqual(layout.name, nextName)
  )

  return hasDuplicate ? `A layout named "${nextName}" already exists.` : ''
}

export function applyLayoutPreset(profile: LayoutProfile, preset: LayoutPreset): LayoutProfile {
  return normalizeLayoutProfile({
    ...profile,
    preset,
    panes: Array.from({ length: PRESET_PANE_COUNT[preset] }, (_, index) => {
      const existing = profile.panes[index]
      return existing ? { ...existing } : createPaneConfig(index)
    }),
    sizes: createEvenSizes(preset)
  })
}

export function setLayoutWorkspaceMode(profile: LayoutProfile, workspaceMode: WorkspaceMode): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  if (normalized.workspaceMode === workspaceMode) {
    return normalized
  }

  return normalizeLayoutProfile({
    ...normalized,
    workspaceMode,
    layoutLocked: workspaceMode === 'canvas' ? false : normalized.layoutLocked,
    panes: normalized.panes.map((pane, index) => {
      if (workspaceMode === 'docked') {
        return pane
      }

      const placement = pane.placement

      return {
        ...pane,
        placement: {
          ...(placement ?? DEFAULT_PANE_PLACEMENT),
          mode: 'floating' as const,
          bounds:
            placement?.mode === 'floating'
              ? normalizeRecoverableCanvasPaneBounds(placement.bounds)
              : getDefaultCanvasPaneBounds(index, normalized.panes.length),
          restoreBounds: placement?.restoreBounds
            ? normalizeRecoverableCanvasPaneBounds(placement.restoreBounds)
            : undefined,
          zIndex: normalizeZIndex(placement?.zIndex, index),
          locked: placement?.locked ?? false,
          maximized: placement?.maximized ?? false,
          visible: placement?.visible ?? true,
          snapTarget: placement?.snapTarget ?? 'none'
        }
      }
    })
  })
}

export function setLayoutLocked(profile: LayoutProfile, layoutLocked: boolean): LayoutProfile {
  return normalizeLayoutProfile({ ...profile, layoutLocked })
}

export function setLayoutGlassTheme(
  profile: LayoutProfile,
  glassTheme: GlassThemePreference | undefined
): LayoutProfile {
  return normalizeLayoutProfile({ ...profile, glassTheme })
}

export function setLayoutGlassMaterial(
  profile: LayoutProfile,
  glassMaterial: GlassMaterialPreference | undefined
): LayoutProfile {
  return normalizeLayoutProfile({ ...profile, glassMaterial, glassTheme: undefined })
}

export function bringPaneToFront(profile: LayoutProfile, paneId: string): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)
  const target = normalized.panes.find((pane) => pane.id === paneId)

  if (!target) {
    return normalized
  }

  const maxZIndex = Math.max(...normalized.panes.map((pane) => pane.placement?.zIndex ?? 1), 1)

  if ((target.placement?.zIndex ?? 1) >= maxZIndex) {
    return normalized
  }

  return {
    ...normalized,
    panes: normalized.panes.map((pane) =>
      pane.id === paneId
        ? {
            ...pane,
            placement: {
              ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
              mode: 'floating' as const,
              bounds: normalizeRecoverableCanvasPaneBounds(pane.placement?.bounds ?? getDefaultCanvasPaneBounds(0, 1)),
              restoreBounds: pane.placement?.restoreBounds
                ? normalizeRecoverableCanvasPaneBounds(pane.placement.restoreBounds)
                : undefined,
              zIndex: maxZIndex + 1,
              locked: pane.placement?.locked ?? false,
              maximized: pane.placement?.maximized ?? false,
              visible: pane.placement?.visible ?? true,
              snapTarget: pane.placement?.snapTarget ?? 'none'
            }
          }
        : pane
    )
  }
}

export function moveCanvasPane(
  profile: LayoutProfile,
  paneId: string,
  delta: Pick<PaneBounds, 'x' | 'y'>,
  options: { snap?: boolean } = {}
): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  return updateCanvasPanePlacement(normalized, paneId, (pane) => {
    if (pane.placement?.locked || pane.placement?.maximized) {
      return pane.placement
    }

    const bounds = pane.placement?.bounds ?? getDefaultCanvasPaneBounds(0, normalized.panes.length)
    const nextBounds = normalizeRecoverableCanvasPaneBounds({
      ...bounds,
      x: bounds.x + delta.x,
      y: bounds.y + delta.y
    })
    const snap = options.snap ? getCanvasSnapResult(normalized, paneId, nextBounds) : null

    return {
      ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
      mode: 'floating' as const,
      bounds: snap?.bounds ?? nextBounds,
      snapTarget: snap?.snapTarget ?? 'none'
    }
  })
}

export function resizeCanvasPane(
  profile: LayoutProfile,
  paneId: string,
  delta: Pick<PaneBounds, 'x' | 'y'>,
  handle: CanvasResizeHandle,
  options: { snap?: boolean } = {}
): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  return updateCanvasPanePlacement(normalized, paneId, (pane) => {
    if (pane.placement?.locked || pane.placement?.maximized) {
      return pane.placement
    }

    const bounds = pane.placement?.bounds ?? getDefaultCanvasPaneBounds(0, normalized.panes.length)
    const nextBounds = { ...bounds }

    if (handle.includes('e')) {
      nextBounds.width += delta.x
    }

    if (handle.includes('s')) {
      nextBounds.height += delta.y
    }

    if (handle.includes('w')) {
      nextBounds.x += delta.x
      nextBounds.width -= delta.x
    }

    if (handle.includes('n')) {
      nextBounds.y += delta.y
      nextBounds.height -= delta.y
    }

    const normalizedBounds = normalizeRecoverableCanvasPaneBounds(nextBounds)
    const snap = options.snap ? getCanvasSnapResult(normalized, paneId, normalizedBounds) : null

    return {
      ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
      mode: 'floating' as const,
      bounds: snap?.bounds ?? normalizedBounds,
      snapTarget: snap?.snapTarget ?? 'none'
    }
  })
}

export function applyCanvasPaneSnap(
  profile: LayoutProfile,
  paneId: string,
  options: { enabled?: boolean } = {}
): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  if (options.enabled === false) {
    return normalized
  }

  return updateCanvasPanePlacement(normalized, paneId, (pane) => {
    const placement = pane.placement

    if (!placement || placement.locked || placement.maximized) {
      return placement
    }

    const snap = getCanvasSnapResult(normalized, paneId, placement.bounds)

    return {
      ...placement,
      bounds: snap.bounds,
      snapTarget: snap.snapTarget
    }
  })
}

export function setPaneLocked(profile: LayoutProfile, paneId: string, locked: boolean): LayoutProfile {
  return updateCanvasPanePlacement(normalizeLayoutProfile(profile), paneId, (pane) => ({
    ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
    locked
  }))
}

export function setAllCanvasPanesLocked(profile: LayoutProfile, locked: boolean): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  if (normalized.workspaceMode !== 'canvas') {
    return normalized
  }

  return {
    ...normalized,
    panes: normalized.panes.map((pane) => ({
      ...pane,
      placement:
        pane.placement?.visible === false
          ? pane.placement
          : {
              ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
              mode: 'floating' as const,
              locked
            }
    }))
  }
}

export function toggleCanvasPaneMaximized(profile: LayoutProfile, paneId: string): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  return updateCanvasPanePlacement(normalized, paneId, (pane) => {
    const placement = pane.placement ?? DEFAULT_PANE_PLACEMENT

    if (placement.locked) {
      return placement
    }

    if (placement.maximized) {
      return {
        ...placement,
        bounds: normalizeRecoverableCanvasPaneBounds(
          placement.restoreBounds ?? getDefaultCanvasPaneBounds(0, normalized.panes.length)
        ),
        restoreBounds: undefined,
        maximized: false,
        snapTarget: 'none'
      }
    }

    const maxZIndex = Math.max(...normalized.panes.map((candidate) => candidate.placement?.zIndex ?? 1), 1)

    return {
      ...placement,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      restoreBounds: normalizeRecoverableCanvasPaneBounds(placement.bounds),
      zIndex: maxZIndex + 1,
      maximized: true,
      snapTarget: 'none'
    }
  })
}

export function setPaneVisibility(profile: LayoutProfile, paneId: string, visible: boolean): LayoutProfile {
  return updateCanvasPanePlacement(normalizeLayoutProfile(profile), paneId, (pane) => ({
    ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
    visible
  }))
}

export function resetCanvasArrangement(profile: LayoutProfile): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  return {
    ...normalized,
    workspaceMode: 'canvas',
    panes: normalized.panes.map((pane, index) => ({
      ...pane,
      placement: pane.placement?.locked
        ? pane.placement
        : {
            ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
            mode: 'floating' as const,
            bounds: getDefaultCanvasPaneBounds(index, normalized.panes.length),
            restoreBounds: undefined,
            zIndex: index + 1,
            maximized: false,
            visible: true,
            snapTarget: 'none'
          }
    }))
  }
}

export function tileCanvasPanes(profile: LayoutProfile): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  const visiblePanes = normalized.panes.filter(
    (pane) => pane.placement?.visible !== false && pane.placement?.locked !== true
  )
  const count = Math.max(visiblePanes.length, 1)
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const gap = 3
  const width = (100 - gap * (columns + 1)) / columns
  const height = (100 - gap * (rows + 1)) / rows
  const visiblePaneIds = new Set(visiblePanes.map((pane) => pane.id))

  return {
    ...normalized,
    workspaceMode: 'canvas',
    panes: normalized.panes.map((pane, visibleIndex) => {
      if (!visiblePaneIds.has(pane.id)) {
        return pane
      }

      const tileIndex = visiblePanes.findIndex((visiblePane) => visiblePane.id === pane.id)
      const column = tileIndex % columns
      const row = Math.floor(tileIndex / columns)

      return {
        ...pane,
        placement: {
          ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
          mode: 'floating' as const,
          bounds: normalizeCanvasPaneBounds({
            x: gap + column * (width + gap),
            y: gap + row * (height + gap),
            width,
            height
          }),
          restoreBounds: undefined,
          zIndex: visibleIndex + 1,
          maximized: false,
          snapTarget: 'none'
        }
      }
    })
  }
}

export function repairCanvasLayoutBounds(profile: LayoutProfile): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)

  return {
    ...normalized,
    panes: normalized.panes.map((pane, index) => {
      const placement = pane.placement

      if (placement?.mode !== 'floating') {
        return pane
      }

      return {
        ...pane,
        placement: {
          ...placement,
          bounds: normalizeRecoverableCanvasPaneBounds(placement.bounds),
          restoreBounds: placement.restoreBounds
            ? normalizeRecoverableCanvasPaneBounds(placement.restoreBounds)
            : undefined,
          zIndex: normalizeZIndex(placement.zIndex, index),
          maximized: placement.maximized ?? false,
          visible: placement.visible ?? true
        }
      }
    })
  }
}

export function assignProfileToPane(
  profile: LayoutProfile,
  paneId: string,
  profileId: string | null
): LayoutProfile {
  return {
    ...profile,
    panes: profile.panes.map((pane) => (pane.id === paneId ? { ...pane, profileId } : pane))
  }
}

export function removeProfileAssignments(profile: LayoutProfile, profileIds: readonly string[]): LayoutProfile {
  const removedProfileIds = new Set(profileIds)

  if (removedProfileIds.size === 0) {
    return profile
  }

  return {
    ...profile,
    panes: profile.panes.map((pane) =>
      pane.profileId && removedProfileIds.has(pane.profileId) ? { ...pane, profileId: null } : pane
    )
  }
}

export function updateLayoutSizes(profile: LayoutProfile, sizes: number[]): LayoutProfile {
  return syncDockedPanePlacements({
    ...profile,
    sizes: normalizeSizes(profile.preset, sizes)
  })
}

export type LayoutSplitAxis = 'columns' | 'rows'

export function updateLayoutSplitSizes(
  profile: LayoutProfile,
  axis: LayoutSplitAxis,
  sizes: number[]
): LayoutProfile {
  const normalized = normalizeLayoutProfile(profile)
  const split = normalizeSizePair(sizes)

  if (normalized.preset === 'single') {
    return normalized
  }

  if (normalized.preset === 'two-vertical') {
    return axis === 'columns' ? syncDockedPanePlacements({ ...normalized, sizes: split }) : normalized
  }

  if (normalized.preset === 'two-horizontal') {
    return axis === 'rows' ? syncDockedPanePlacements({ ...normalized, sizes: split }) : normalized
  }

  const nextSizes = [...normalized.sizes]
  const offset = axis === 'columns' ? 0 : 2
  nextSizes[offset] = split[0]
  nextSizes[offset + 1] = split[1]

  return syncDockedPanePlacements({
    ...normalized,
    sizes: normalizeSizes(normalized.preset, nextSizes)
  })
}

export function createPaneRuntimes(
  profile: LayoutProfile,
  sessionsByPaneKey: PaneRuntimeSessionsByKey = {}
): PaneRuntime[] {
  const layout = normalizeLayoutProfile(profile)

  return layout.panes.map((pane) => {
    const session = sessionsByPaneKey[makePaneSessionKey(layout.id, pane.id)]

    return {
      config: { ...pane },
      status: session?.status ?? getInitialStatus(pane),
      ptyId: session?.ptyId ?? null,
      launchedProfileId: session?.launchedProfileId,
      errorMessage: session?.errorMessage
    }
  })
}

export function reconcilePaneRuntimes(profile: LayoutProfile, current: PaneRuntime[] = []): PaneRuntime[] {
  return createPaneRuntimes(
    profile,
    Object.fromEntries(
      current.map((pane) => [makePaneSessionKey(profile.id, pane.config.id), pane])
    ) as PaneRuntimeSessionsByKey
  )
}

export function makePaneSessionKey(layoutId: string, paneId: string): PaneSessionKey {
  return `${layoutId}:${paneId}`
}

export function markExitedPaneSession(
  sessionsByPaneKey: PaneRuntimeSessionsByKey,
  layoutProfiles: readonly LayoutProfile[],
  ptyId: string
): PaneRuntimeSessionsByKey {
  const initialSessionsByPaneKey = Object.fromEntries(
    layoutProfiles.flatMap((layoutProfile) => {
      const layout = normalizeLayoutProfile(layoutProfile)

      return layout.panes.map((pane) => [
        makePaneSessionKey(layout.id, pane.id),
        { status: getInitialStatus(pane), ptyId: null }
      ])
    })
  ) as PaneRuntimeSessionsByKey
  let nextSessions: PaneRuntimeSessionsByKey | null = null

  for (const [sessionKey, session] of Object.entries(sessionsByPaneKey) as Array<
    [PaneSessionKey, PaneRuntimeSession | undefined]
  >) {
    if (session?.ptyId !== ptyId) {
      continue
    }

    nextSessions ??= { ...sessionsByPaneKey }
    nextSessions[sessionKey] = initialSessionsByPaneKey[sessionKey] ?? {
      status: 'blank',
      ptyId: null
    }
  }

  return nextSessions ?? sessionsByPaneKey
}

export function getLayoutSplitSizes(profile: LayoutProfile, axis: LayoutSplitAxis): number[] {
  const layout = normalizeLayoutProfile(profile)

  if (layout.preset === 'single') {
    return []
  }

  if (layout.preset === 'two-vertical') {
    return axis === 'columns' ? layout.sizes : []
  }

  if (layout.preset === 'two-horizontal') {
    return axis === 'rows' ? layout.sizes : []
  }

  return axis === 'columns' ? layout.sizes.slice(0, 2) : layout.sizes.slice(2, 4)
}

function createPaneConfig(index: number, profileId: string | null = null): PaneConfig {
  return {
    id: `pane-${index + 1}`,
    profileId,
    placement: {
      ...DEFAULT_PANE_PLACEMENT,
      bounds: { ...DEFAULT_PANE_PLACEMENT.bounds },
      zIndex: index + 1
    }
  }
}

function normalizePaneConfig(
  pane: PaneConfig,
  index: number,
  preset: LayoutPreset,
  sizes: number[],
  workspaceMode: WorkspaceMode,
  paneCount: number
): PaneConfig {
  return {
    id: pane.id,
    profileId: pane.profileId,
    placement: normalizePanePlacement(pane.placement, index, preset, sizes, workspaceMode, paneCount)
  }
}

function normalizePanePlacement(
  placement: PanePlacement | undefined,
  index: number,
  preset: LayoutPreset,
  sizes: number[],
  workspaceMode: WorkspaceMode,
  paneCount: number
): PanePlacement {
  const dockedBounds = getDockedPaneBounds(preset, index, sizes)
  const mode = placement?.mode ?? (workspaceMode === 'canvas' ? 'floating' : 'docked')

  return {
    mode,
    bounds:
      mode === 'docked'
        ? dockedBounds
        : normalizeRecoverableCanvasPaneBounds(placement?.bounds ?? getDefaultCanvasPaneBounds(index, paneCount)),
    restoreBounds: placement?.restoreBounds ? normalizeRecoverableCanvasPaneBounds(placement.restoreBounds) : undefined,
    zIndex: normalizeZIndex(placement?.zIndex, index),
    locked: placement?.locked ?? false,
    maximized: placement?.maximized ?? false,
    visible: placement?.visible ?? true,
    snapTarget: placement?.snapTarget ?? 'none'
  }
}

function syncDockedPanePlacements(profile: LayoutProfile): LayoutProfile {
  const normalizedSizes = normalizeSizes(profile.preset, profile.sizes)

  return {
    ...profile,
    sizes: normalizedSizes,
    panes: profile.panes.map((pane, index) => ({
      ...pane,
      placement:
        pane.placement?.mode === 'floating'
          ? pane.placement
          : {
              ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
              mode: 'docked',
              bounds: getDockedPaneBounds(profile.preset, index, normalizedSizes),
              restoreBounds: pane.placement?.restoreBounds
                ? normalizeRecoverableCanvasPaneBounds(pane.placement.restoreBounds)
                : undefined,
              zIndex: normalizeZIndex(pane.placement?.zIndex, index),
              locked: pane.placement?.locked ?? false,
              maximized: pane.placement?.maximized ?? false,
              visible: pane.placement?.visible ?? true,
              snapTarget: pane.placement?.snapTarget ?? 'none'
            }
    }))
  }
}

function getDockedPaneBounds(preset: LayoutPreset, index: number, sizes: number[]): PaneBounds {
  const columns = normalizeSizePair(sizes.slice(0, 2))
  const rows = normalizeSizePair(sizes.slice(2, 4))

  if (preset === 'single') {
    return { x: 0, y: 0, width: 100, height: 100 }
  }

  if (preset === 'two-vertical') {
    return index === 0
      ? { x: 0, y: 0, width: columns[0], height: 100 }
      : { x: columns[0], y: 0, width: columns[1], height: 100 }
  }

  if (preset === 'two-horizontal') {
    const splitRows = sizes.length >= 2 ? normalizeSizePair(sizes.slice(0, 2)) : rows

    return index === 0
      ? { x: 0, y: 0, width: 100, height: splitRows[0] }
      : { x: 0, y: splitRows[0], width: 100, height: splitRows[1] }
  }

  if (preset === 'three-pane') {
    if (index === 0) {
      return { x: 0, y: 0, width: columns[0], height: 100 }
    }

    return index === 1
      ? { x: columns[0], y: 0, width: columns[1], height: rows[0] }
      : { x: columns[0], y: rows[0], width: columns[1], height: rows[1] }
  }

  const rowIndex = index < 2 ? 0 : 1
  const columnIndex = index % 2

  return {
    x: columnIndex === 0 ? 0 : columns[0],
    y: rowIndex === 0 ? 0 : rows[0],
    width: columns[columnIndex],
    height: rows[rowIndex]
  }
}

function getDefaultCanvasPaneBounds(index: number, paneCount: number): PaneBounds {
  const arrangements: PaneBounds[][] = [
    [{ x: 9, y: 9, width: 74, height: 74 }],
    [
      { x: 7, y: 12, width: 56, height: 68 },
      { x: 38, y: 22, width: 55, height: 64 }
    ],
    [
      { x: 6, y: 10, width: 52, height: 62 },
      { x: 38, y: 18, width: 52, height: 58 },
      { x: 20, y: 48, width: 50, height: 40 }
    ],
    [
      { x: 5, y: 8, width: 45, height: 48 },
      { x: 43, y: 13, width: 48, height: 46 },
      { x: 15, y: 46, width: 48, height: 43 },
      { x: 51, y: 42, width: 43, height: 46 }
    ]
  ]
  const boundedCount = Math.min(Math.max(paneCount, 1), arrangements.length)
  const bounds = arrangements[boundedCount - 1][index] ?? arrangements[boundedCount - 1][0]

  return normalizeCanvasPaneBounds(bounds)
}

function normalizeWorkspaceMode(workspaceMode: WorkspaceMode | undefined): WorkspaceMode {
  return workspaceMode === 'canvas' ? 'canvas' : 'docked'
}

function updateCanvasPanePlacement(
  profile: LayoutProfile,
  paneId: string,
  updater: (pane: PaneConfig, index: number) => PanePlacement | undefined
): LayoutProfile {
  let changed = false

  const panes = profile.panes.map((pane, index) => {
    if (pane.id !== paneId) {
      return pane
    }

    const placement = updater(pane, index)

    if (!placement) {
      return pane
    }

    changed = true
    return {
      ...pane,
      placement: {
        ...(pane.placement ?? DEFAULT_PANE_PLACEMENT),
        ...placement,
        mode: 'floating' as const,
        bounds: normalizeRecoverableCanvasPaneBounds(
          placement.bounds ?? pane.placement?.bounds ?? getDefaultCanvasPaneBounds(index, profile.panes.length)
        ),
        restoreBounds: Object.prototype.hasOwnProperty.call(placement, 'restoreBounds')
          ? placement.restoreBounds
            ? normalizeRecoverableCanvasPaneBounds(placement.restoreBounds)
            : undefined
          : pane.placement?.restoreBounds
            ? normalizeRecoverableCanvasPaneBounds(pane.placement.restoreBounds)
            : undefined,
        zIndex: normalizeZIndex(placement.zIndex ?? pane.placement?.zIndex, index),
        locked: placement.locked ?? pane.placement?.locked ?? false,
        maximized: placement.maximized ?? pane.placement?.maximized ?? false,
        visible: placement.visible ?? pane.placement?.visible ?? true,
        snapTarget: placement.snapTarget ?? pane.placement?.snapTarget ?? 'none'
      }
    }
  })

  return changed ? { ...profile, workspaceMode: 'canvas', panes } : profile
}

export function getCanvasSnapResult(
  profile: LayoutProfile,
  paneId: string,
  proposedBounds: PaneBounds
): CanvasSnapResult {
  const normalized = normalizeLayoutProfile(profile)
  const bounds = normalizeRecoverableCanvasPaneBounds(proposedBounds)
  const horizontalTargets: Array<{ position: number; target: PanePlacement['snapTarget'] }> = [
    { position: 0, target: 'left' },
    { position: 50, target: 'none' },
    { position: 100, target: 'right' }
  ]
  const verticalTargets: Array<{ position: number; target: PanePlacement['snapTarget'] }> = [
    { position: 0, target: 'top' },
    { position: 50, target: 'none' },
    { position: 100, target: 'bottom' }
  ]

  for (const pane of normalized.panes) {
    const placement = pane.placement

    if (pane.id === paneId || placement?.mode !== 'floating' || placement.visible === false) {
      continue
    }

    const other = normalizeRecoverableCanvasPaneBounds(placement.bounds)
    horizontalTargets.push(
      { position: other.x, target: 'none' },
      { position: other.x + other.width, target: 'none' },
      { position: other.x + other.width / 2, target: 'none' }
    )
    verticalTargets.push(
      { position: other.y, target: 'none' },
      { position: other.y + other.height, target: 'none' },
      { position: other.y + other.height / 2, target: 'none' }
    )
  }

  const xSnap = findNearestSnap(
    [
      { value: bounds.x, offset: 0 },
      { value: bounds.x + bounds.width / 2, offset: bounds.width / 2 },
      { value: bounds.x + bounds.width, offset: bounds.width }
    ],
    horizontalTargets
  )
  const ySnap = findNearestSnap(
    [
      { value: bounds.y, offset: 0 },
      { value: bounds.y + bounds.height / 2, offset: bounds.height / 2 },
      { value: bounds.y + bounds.height, offset: bounds.height }
    ],
    verticalTargets
  )
  const snappedBounds = normalizeRecoverableCanvasPaneBounds({
    ...bounds,
    x: xSnap ? xSnap.position - xSnap.offset : bounds.x,
    y: ySnap ? ySnap.position - ySnap.offset : bounds.y
  })
  const guides: CanvasSnapGuide[] = [
    ...(xSnap ? [{ axis: 'x' as const, position: xSnap.position }] : []),
    ...(ySnap ? [{ axis: 'y' as const, position: ySnap.position }] : [])
  ]

  return {
    bounds: snappedBounds,
    guides,
    snapTarget: getSnapTarget(xSnap?.target ?? 'none', ySnap?.target ?? 'none')
  }
}

export function normalizeCanvasPaneBounds(bounds: PaneBounds): PaneBounds {
  const width = clampPercent(bounds.width, MIN_CANVAS_PANE_WIDTH)
  const height = clampPercent(bounds.height, MIN_CANVAS_PANE_HEIGHT)
  const nextWidth = Math.min(width, 100)
  const nextHeight = Math.min(height, 100)

  return {
    x: clampPercent(bounds.x, 0, 100 - nextWidth),
    y: clampPercent(bounds.y, 0, 100 - nextHeight),
    width: Number(nextWidth.toFixed(2)),
    height: Number(nextHeight.toFixed(2))
  }
}

function normalizeRecoverableCanvasPaneBounds(bounds: PaneBounds): PaneBounds {
  const normalized = normalizeCanvasPaneBounds({
    ...bounds,
    x: 0,
    y: 0
  })
  const minimumVisibleWidth = Math.min(CANVAS_RECOVERY_WIDTH, normalized.width)
  const minimumTitleBarHeight = Math.min(CANVAS_RECOVERY_TITLE_BAR_HEIGHT, normalized.height)

  return {
    ...normalized,
    x: clampPercent(bounds.x, minimumVisibleWidth - normalized.width, 100 - minimumVisibleWidth),
    y: clampPercent(bounds.y, 0, 100 - minimumTitleBarHeight)
  }
}

function clampPercent(value: number, min = 0, max = 100): number {
  const lower = Math.min(min, max)
  const upper = Math.max(min, max)

  return Number(Math.min(Math.max(Number.isFinite(value) ? value : lower, lower), upper).toFixed(2))
}

function normalizeZIndex(value: number | undefined, index: number): number {
  return Math.max(typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : index + 1, 1)
}

function findNearestSnap(
  edges: Array<{ value: number; offset: number }>,
  targets: Array<{ position: number; target: PanePlacement['snapTarget'] }>
): { position: number; offset: number; target: PanePlacement['snapTarget']; distance: number } | null {
  let nearest: { position: number; offset: number; target: PanePlacement['snapTarget']; distance: number } | null = null

  for (const edge of edges) {
    for (const target of targets) {
      const distance = Math.abs(edge.value - target.position)

      if (distance > CANVAS_SNAP_THRESHOLD || (nearest && distance >= nearest.distance)) {
        continue
      }

      nearest = { ...target, offset: edge.offset, distance }
    }
  }

  return nearest
}

function getSnapTarget(
  xTarget: PanePlacement['snapTarget'],
  yTarget: PanePlacement['snapTarget']
): PanePlacement['snapTarget'] {
  if (xTarget === 'left' && yTarget === 'top') {
    return 'top-left'
  }

  if (xTarget === 'right' && yTarget === 'top') {
    return 'top-right'
  }

  if (xTarget === 'left' && yTarget === 'bottom') {
    return 'bottom-left'
  }

  if (xTarget === 'right' && yTarget === 'bottom') {
    return 'bottom-right'
  }

  return xTarget !== 'none' ? xTarget : yTarget
}

function migrateLayoutGlassMaterial(profile: LayoutProfile): GlassMaterialPreference | undefined {
  if (profile.glassMaterial) {
    return profile.glassMaterial
  }

  if (profile.glassTheme && profile.glassTheme !== 'auto') {
    return profile.glassTheme
  }

  return undefined
}

function getInitialStatus(pane: PaneConfig): PaneStatus {
  return pane.profileId ? 'assigned' : 'blank'
}

function createEvenSizes(preset: LayoutPreset): number[] {
  const sizeCount = getSizeCount(preset)

  if (sizeCount === 0) {
    return []
  }

  if (sizeCount === 4) {
    return [50, 50, 50, 50]
  }

  return [50, 50]
}

function normalizeSizes(preset: LayoutPreset, sizes: number[]): number[] {
  const sizeCount = getSizeCount(preset)

  if (sizeCount === 0) {
    return []
  }

  if (sizeCount === 2) {
    return normalizeSizePair(sizes.length === 2 ? sizes : createEvenSizes(preset))
  }

  if (sizes.length === 2) {
    return [...normalizeSizePair(sizes), 50, 50]
  }

  if (sizes.length !== sizeCount) {
    return createEvenSizes(preset)
  }

  return [...normalizeSizePair(sizes.slice(0, 2)), ...normalizeSizePair(sizes.slice(2, 4))]
}

function getSizeCount(preset: LayoutPreset): number {
  if (preset === 'single') {
    return 0
  }

  return preset === 'two-vertical' || preset === 'two-horizontal' ? 2 : 4
}

function normalizeSizePair(sizes: number[]): number[] {
  const nextSizes = sizes.length === 2 ? sizes : [50, 50]
  const sanitized = nextSizes.map((size) => Math.max(Number.isFinite(size) ? size : 0, 1))
  const total = sanitized.reduce((sum, size) => sum + size, 0)

  return sanitized.map((size) => Number(((size / total) * 100).toFixed(2)))
}

function getUniqueLayoutName(
  requestedName: string,
  layoutProfiles: readonly LayoutProfile[]
): string {
  const baseName = normalizeLayoutName(requestedName)

  if (isLayoutNameAvailable(baseName, layoutProfiles)) {
    return baseName
  }

  const copyBaseName = getCopyBaseName(baseName)

  if (isLayoutNameAvailable(copyBaseName, layoutProfiles)) {
    return copyBaseName
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${copyBaseName} ${index}`

    if (isLayoutNameAvailable(candidate, layoutProfiles)) {
      return candidate
    }
  }
}

function getUniqueLayoutCopyName(
  activeLayoutName: string,
  layoutProfiles: readonly LayoutProfile[]
): string {
  return getUniqueLayoutName(getCopyBaseName(normalizeLayoutName(activeLayoutName)), layoutProfiles)
}

function normalizeLayoutName(name: string): string {
  const trimmed = name.trim()

  return trimmed || 'Untitled Layout'
}

function getCopyBaseName(name: string): string {
  return name.match(/ Copy(?: \d+)?$/) ? name.replace(/ Copy(?: \d+)?$/, ' Copy') : `${name} Copy`
}

function isLayoutNameAvailable(name: string, layoutProfiles: readonly LayoutProfile[]): boolean {
  return !layoutProfiles.some((layout) => areLayoutNamesEqual(layout.name, name))
}

function areLayoutNamesEqual(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

function createSavedLayoutId(layoutProfiles: readonly LayoutProfile[]): string {
  const baseId = `layout.saved.${Date.now().toString(36)}`
  const existingIds = new Set(layoutProfiles.map((layout) => layout.id))

  if (!existingIds.has(baseId)) {
    return baseId
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}.${index}`

    if (!existingIds.has(candidate)) {
      return candidate
    }
  }
}
