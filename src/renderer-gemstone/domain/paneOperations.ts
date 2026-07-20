import type { CommandProfile } from '../../shared'
import {
  fitPaneBoundsOnscreen,
  movePaneBounds,
  resizePaneBounds,
  type CanvasSize,
  type PixelBounds,
  type ResizeHandle
} from './geometry'
import type { FacetOrientation, GemMaterial, GemPaneState, GemTreatment } from './gemstoneState'

export interface PaneSnapGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
}

export interface PaneBoundsInteractionResult {
  panes: GemPaneState[]
  snapGuides: PaneSnapGuide[]
}

interface PaneSnapResult {
  bounds: PixelBounds
  guides: PaneSnapGuide[]
}

export type ProfileAssignmentResult =
  | {
      outcome: 'assigned'
      panes: GemPaneState[]
      shouldStart: boolean
    }
  | {
      outcome: 'blocked-active-session'
      panes: GemPaneState[]
    }
  | {
      outcome: 'pane-not-found'
      panes: GemPaneState[]
    }

export function hasActiveGemPaneSession(pane: GemPaneState): boolean {
  return Boolean(pane.ptyId) || pane.status === 'running' || pane.status === 'starting'
}

export function setGemPaneMaterial(
  panes: readonly GemPaneState[],
  paneId: string,
  material: GemMaterial
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({ ...pane, material }))
}

export function setGemPaneHidden(
  panes: readonly GemPaneState[],
  paneId: string,
  hidden: boolean
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({ ...pane, hidden }))
}

export function removeGemPane(panes: readonly GemPaneState[], paneId: string): GemPaneState[] {
  return panes.filter((pane) => pane.id !== paneId)
}

export function resetVisibleGemPaneArrangement(
  panes: readonly GemPaneState[],
  boundsByIndex: readonly PixelBounds[]
): GemPaneState[] {
  let visibleIndex = 0

  return panes.map((pane) => {
    if (pane.hidden) {
      return pane
    }

    const nextBounds = boundsByIndex[visibleIndex] ?? boundsByIndex[0] ?? pane.bounds
    visibleIndex += 1

    return {
      ...pane,
      bounds: { ...nextBounds },
      restoreBounds: undefined,
      zIndex: visibleIndex,
      maximized: false
    }
  })
}

export function bringAllGemPanesOnscreen(panes: readonly GemPaneState[], canvasSize: CanvasSize): GemPaneState[] {
  return panes.map((pane, index) => ({
    ...pane,
    hidden: false,
    bounds: fitPaneBoundsOnscreen(pane.bounds, canvasSize),
    restoreBounds: pane.restoreBounds ? fitPaneBoundsOnscreen(pane.restoreBounds, canvasSize) : undefined,
    zIndex: index + 1,
    maximized: false
  }))
}

export function unlockAllGemPanes(panes: readonly GemPaneState[]): GemPaneState[] {
  return panes.map((pane) => ({ ...pane, locked: false }))
}

export function clearStoppedGemPanes(panes: readonly GemPaneState[]): GemPaneState[] {
  return panes.filter(hasActiveGemPaneSession)
}

export function applyGemPaneBoundsInteraction(
  panes: readonly GemPaneState[],
  paneId: string,
  mode: 'drag' | ResizeHandle,
  startBounds: PixelBounds,
  deltaX: number,
  deltaY: number,
  canvasSize: CanvasSize
): GemPaneState[] {
  return getGemPaneBoundsInteractionResult(panes, paneId, mode, startBounds, deltaX, deltaY, canvasSize).panes
}

export function getGemPaneBoundsInteractionResult(
  panes: readonly GemPaneState[],
  paneId: string,
  mode: 'drag' | ResizeHandle,
  startBounds: PixelBounds,
  deltaX: number,
  deltaY: number,
  canvasSize: CanvasSize
): PaneBoundsInteractionResult {
  const rawBounds =
    mode === 'drag'
      ? movePaneBounds(startBounds, deltaX, deltaY, canvasSize)
      : resizePaneBounds(startBounds, deltaX, deltaY, mode, canvasSize)
  const snapResult = snapPaneBounds(rawBounds, panes, paneId, mode, canvasSize)

  return {
    panes: updateGemPane(panes, paneId, (pane) => ({
      ...pane,
      bounds: snapResult.bounds,
      maximized: false,
      restoreBounds: undefined
    })),
    snapGuides: snapResult.guides
  }
}

function snapPaneBounds(
  bounds: PixelBounds,
  panes: readonly GemPaneState[],
  paneId: string,
  mode: 'drag' | ResizeHandle,
  canvasSize: CanvasSize
): PaneSnapResult {
  const SNAP_DISTANCE_PX = 18
  const candidates = createSnapCandidates(panes, paneId, canvasSize)
  const nextBounds = { ...bounds }
  const guides: PaneSnapGuide[] = []
  const verticalSnap = getBestAxisSnap(
    createHorizontalSnapSources(nextBounds, mode),
    candidates.vertical,
    SNAP_DISTANCE_PX
  )
  const horizontalSnap = getBestAxisSnap(
    createVerticalSnapSources(nextBounds, mode),
    candidates.horizontal,
    SNAP_DISTANCE_PX
  )

  if (verticalSnap) {
    applyHorizontalSnap(nextBounds, verticalSnap.source, verticalSnap.delta, mode)
    guides.push({ orientation: 'vertical', position: verticalSnap.target })
  }

  if (horizontalSnap) {
    applyVerticalSnap(nextBounds, horizontalSnap.source, horizontalSnap.delta, mode)
    guides.push({ orientation: 'horizontal', position: horizontalSnap.target })
  }

  return {
    bounds: nextBounds,
    guides
  }
}

function createSnapCandidates(
  panes: readonly GemPaneState[],
  paneId: string,
  canvasSize: CanvasSize
): { vertical: number[]; horizontal: number[] } {
  const visiblePanes = panes.filter((pane) => pane.id !== paneId && pane.hidden !== true)
  const vertical = [0, canvasSize.width / 2, canvasSize.width]
  const horizontal = [0, canvasSize.height / 2, canvasSize.height]

  for (const pane of visiblePanes) {
    vertical.push(pane.bounds.x, pane.bounds.x + pane.bounds.width / 2, pane.bounds.x + pane.bounds.width)
    horizontal.push(pane.bounds.y, pane.bounds.y + pane.bounds.height / 2, pane.bounds.y + pane.bounds.height)
  }

  return { vertical, horizontal }
}

function createHorizontalSnapSources(bounds: PixelBounds, mode: 'drag' | ResizeHandle): SnapSource[] {
  if (mode === 'drag') {
    return [
      { edge: 'left', value: bounds.x },
      { edge: 'centerX', value: bounds.x + bounds.width / 2 },
      { edge: 'right', value: bounds.x + bounds.width }
    ]
  }

  return [
    ...(mode.includes('w') ? [{ edge: 'left' as const, value: bounds.x }] : []),
    ...(mode.includes('e') ? [{ edge: 'right' as const, value: bounds.x + bounds.width }] : [])
  ]
}

function createVerticalSnapSources(bounds: PixelBounds, mode: 'drag' | ResizeHandle): SnapSource[] {
  if (mode === 'drag') {
    return [
      { edge: 'top', value: bounds.y },
      { edge: 'centerY', value: bounds.y + bounds.height / 2 },
      { edge: 'bottom', value: bounds.y + bounds.height }
    ]
  }

  return [
    ...(mode.includes('n') ? [{ edge: 'top' as const, value: bounds.y }] : []),
    ...(mode.includes('s') ? [{ edge: 'bottom' as const, value: bounds.y + bounds.height }] : [])
  ]
}

type SnapSourceEdge = 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY'

interface SnapSource {
  edge: SnapSourceEdge
  value: number
}

function getBestAxisSnap(
  sources: readonly SnapSource[],
  targets: readonly number[],
  snapDistance: number
): { source: SnapSourceEdge; target: number; delta: number } | null {
  let bestSnap: { source: SnapSourceEdge; target: number; delta: number } | null = null

  for (const source of sources) {
    for (const target of targets) {
      const delta = target - source.value

      if (Math.abs(delta) > snapDistance) {
        continue
      }

      if (!bestSnap || Math.abs(delta) < Math.abs(bestSnap.delta)) {
        bestSnap = { source: source.edge, target, delta }
      }
    }
  }

  return bestSnap
}

function applyHorizontalSnap(
  bounds: PixelBounds,
  source: SnapSourceEdge,
  delta: number,
  mode: 'drag' | ResizeHandle
): void {
  if (mode === 'drag' || source === 'centerX') {
    bounds.x += delta
    return
  }

  if (source === 'left') {
    bounds.x += delta
    bounds.width -= delta
    return
  }

  if (source === 'right') {
    bounds.width += delta
  }
}

function applyVerticalSnap(
  bounds: PixelBounds,
  source: SnapSourceEdge,
  delta: number,
  mode: 'drag' | ResizeHandle
): void {
  if (mode === 'drag' || source === 'centerY') {
    bounds.y += delta
    return
  }

  if (source === 'top') {
    bounds.y += delta
    bounds.height -= delta
    return
  }

  if (source === 'bottom') {
    bounds.height += delta
  }
}

export function mergeLoadedGemstoneLayout(
  currentPanes: readonly GemPaneState[],
  loadedPanes: readonly GemPaneState[]
): GemPaneState[] {
  return loadedPanes.map((loadedPane) => {
    const currentPane = currentPanes.find(
      (pane) => pane.id === loadedPane.id && pane.profileId === loadedPane.profileId
    )

    if (!currentPane || !hasActiveGemPaneSession(currentPane)) {
      return loadedPane
    }

    return {
      ...loadedPane,
      status: currentPane.status,
      ptyId: currentPane.ptyId,
      launchedProfileId: currentPane.launchedProfileId,
      errorMessage: currentPane.errorMessage
    }
  })
}

export function getPtyIdsToStopForLoadedLayout(
  currentPanes: readonly GemPaneState[],
  loadedPanes: readonly GemPaneState[]
): string[] {
  const loadedPaneKeys = new Set(loadedPanes.map((pane) => `${pane.id}:${pane.profileId ?? ''}`))

  return currentPanes
    .filter((pane) => pane.ptyId && !loadedPaneKeys.has(`${pane.id}:${pane.profileId ?? ''}`))
    .map((pane) => pane.ptyId as string)
}

export function bringGemPaneToFront(panes: readonly GemPaneState[], paneId: string): GemPaneState[] {
  const maxZIndex = Math.max(...panes.map((pane) => pane.zIndex), 1)
  const target = panes.find((pane) => pane.id === paneId)

  if (!target || target.zIndex >= maxZIndex) {
    return [...panes]
  }

  return updateGemPane(panes, paneId, (pane) => ({ ...pane, zIndex: maxZIndex + 1 }))
}

export function setGemPaneTreatment(
  panes: readonly GemPaneState[],
  paneId: string,
  treatment: GemTreatment
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({ ...pane, treatment }))
}

export function setGemPaneFacetOrientation(
  panes: readonly GemPaneState[],
  paneId: string,
  facetOrientation: FacetOrientation
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({ ...pane, facetOrientation }))
}

export function toggleGemPaneLock(panes: readonly GemPaneState[], paneId: string): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({ ...pane, locked: !pane.locked }))
}

export function flipGemPaneFacetOrientation(
  panes: readonly GemPaneState[],
  paneId: string
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    facetOrientation: pane.facetOrientation === 'left' ? 'right' : 'left'
  }))
}

export function assignProfileToGemPane(
  panes: readonly GemPaneState[],
  paneId: string,
  profile: CommandProfile | null
): ProfileAssignmentResult {
  const target = panes.find((pane) => pane.id === paneId)

  if (!target) {
    return { outcome: 'pane-not-found', panes: [...panes] }
  }

  if (hasActiveGemPaneSession(target)) {
    return { outcome: 'blocked-active-session', panes: [...panes] }
  }

  const shouldStart = target.status === 'blank' && profile !== null
  const nextPanes = updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    profileId: profile?.id ?? null,
    title: profile?.name ?? 'Blank Pane',
    status: profile ? 'assigned' : 'blank',
    ptyId: null,
    launchedProfileId: undefined,
    errorMessage: undefined
  }))

  return {
    outcome: 'assigned',
    panes: nextPanes,
    shouldStart
  }
}

export function markGemPaneSessionStarted(
  panes: readonly GemPaneState[],
  paneId: string,
  ptyId: string,
  launchedProfileId: string
): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    status: 'running',
    ptyId,
    launchedProfileId,
    errorMessage: undefined
  }))
}

export function markGemPaneSessionStarting(panes: readonly GemPaneState[], paneId: string): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    status: 'starting',
    errorMessage: undefined
  }))
}

export function markGemPaneSessionStopped(panes: readonly GemPaneState[], paneId: string): GemPaneState[] {
  return updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    status: pane.profileId ? 'assigned' : 'blank',
    ptyId: null,
    launchedProfileId: undefined
  }))
}

function updateGemPane(
  panes: readonly GemPaneState[],
  paneId: string,
  updater: (pane: GemPaneState) => GemPaneState
): GemPaneState[] {
  return panes.map((pane) => (pane.id === paneId ? updater(pane) : pane))
}
