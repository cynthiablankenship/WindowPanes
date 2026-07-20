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
  return updateGemPane(panes, paneId, (pane) => ({
    ...pane,
    bounds:
      mode === 'drag'
        ? movePaneBounds(startBounds, deltaX, deltaY, canvasSize)
        : resizePaneBounds(startBounds, deltaX, deltaY, mode, canvasSize),
    maximized: false,
    restoreBounds: undefined
  }))
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
