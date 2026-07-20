import type { PaneStatus } from '../../shared'
import type { GemMaterial, GemPaneState } from './gemstoneState'
import { hasActiveGemPaneSession } from './paneOperations'

export type PanePrimarySessionIcon = 'play' | 'stop'
export type PaneLockIcon = 'locked' | 'unlocked'
export type PaneMenuActionId =
  | 'start'
  | 'stop'
  | 'restart'
  | 'toggle-lock'
  | 'toggle-maximized'
  | 'bring-to-front'
  | 'assign-profile'
  | 'change-material'
  | 'change-treatment'
  | 'flip-gemstone'
  | 'set-facet-orientation'
  | 'open-inspector'
  | 'hide-pane'
  | 'remove-pane'

export interface PaneIconRules {
  primary: PanePrimarySessionIcon
  showRestart: boolean
  lock: PaneLockIcon
}

export interface PaneMenuAction {
  id: PaneMenuActionId
  label: string
  disabledReason?: string
}

export interface PaneMenuModel {
  session: PaneMenuAction[]
  paneState: PaneMenuAction[]
  profileAppearance: PaneMenuAction[]
  management: PaneMenuAction[]
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  left: number
  top: number
}

export function getPaneIconRules(pane: Pick<GemPaneState, 'profileId' | 'status' | 'locked'>): PaneIconRules {
  return {
    primary: isStopStatus(pane.status) ? 'stop' : 'play',
    showRestart: canRestartPane(pane),
    lock: pane.locked ? 'locked' : 'unlocked'
  }
}

export function shouldShowBlankPaneProfilePrompt(pane: Pick<GemPaneState, 'profileId' | 'status'>): boolean {
  return pane.status === 'blank' && !pane.profileId
}

export function getPaneMenuModel(pane: GemPaneState, globalLocked: boolean): PaneMenuModel {
  const canStart = canStartPane(pane)
  const canStop = canStopPane(pane)
  const canRestart = canRestartPane(pane)
  const geometryLockedReason = globalLocked
    ? 'Workspace lock is enabled.'
    : pane.locked
      ? 'Unlock this pane before changing its bounds.'
      : undefined

  return {
    session: [
      {
        id: 'start',
        label: 'Start',
        disabledReason: canStart ? undefined : getStartDisabledReason(pane)
      },
      {
        id: 'stop',
        label: 'Stop',
        disabledReason: canStop ? undefined : 'No running terminal session.'
      },
      {
        id: 'restart',
        label: 'Restart',
        disabledReason: canRestart ? undefined : getRestartDisabledReason(pane)
      }
    ],
    paneState: [
      {
        id: 'toggle-lock',
        label: pane.locked ? 'Unlock' : 'Lock'
      },
      {
        id: 'toggle-maximized',
        label: pane.maximized ? 'Restore' : 'Maximize',
        disabledReason: geometryLockedReason
      },
      {
        id: 'bring-to-front',
        label: 'Bring to front'
      }
    ],
    profileAppearance: [
      {
        id: 'assign-profile',
        label: pane.profileId ? 'Change profile' : 'Assign profile'
      },
      {
        id: 'change-material',
        label: 'Change material'
      },
      {
        id: 'change-treatment',
        label: 'Change treatment'
      },
      {
        id: 'flip-gemstone',
        label: 'Flip gemstone'
      },
      {
        id: 'set-facet-orientation',
        label: 'Select facet orientation'
      },
      {
        id: 'open-inspector',
        label: 'Open full inspector'
      }
    ],
    management: [
      {
        id: 'hide-pane',
        label: 'Hide pane'
      },
      {
        id: 'remove-pane',
        label: 'Remove pane'
      }
    ]
  }
}

export function placePaneMenu(anchor: Rect, menu: Size, viewport: Size, margin = 12): Point {
  const preferredLeft = anchor.left + anchor.width - menu.width
  const preferredTop = anchor.top + anchor.height + 8
  const maxLeft = Math.max(margin, viewport.width - menu.width - margin)
  const maxTop = Math.max(margin, viewport.height - menu.height - margin)

  return {
    left: clamp(preferredLeft, margin, maxLeft),
    top: clamp(preferredTop, margin, maxTop)
  }
}

export function getPaneManagementConfirmation(
  pane: GemPaneState,
  action: 'hide' | 'remove'
): string | null {
  if (hasActiveGemPaneSession(pane)) {
    return action === 'hide'
      ? `Hide ${pane.title}? The terminal session will keep running while the pane is hidden.`
      : `Remove ${pane.title}? This will stop the running terminal session and remove the pane.`
  }

  if (action === 'remove' && (pane.profileId || pane.status === 'error')) {
    return `Remove ${pane.title}? Pane configuration and visible terminal history will be lost.`
  }

  return null
}

export function getProfileReplacementConfirmation(pane: GemPaneState, material?: GemMaterial): string | null {
  if (!hasActiveGemPaneSession(pane)) {
    return null
  }

  const materialText = material && material !== pane.material ? ' Appearance changes will be kept.' : ''
  return `Change profile for ${pane.title}? This will stop the current terminal session before launching the replacement profile.${materialText}`
}

function canStartPane(pane: Pick<GemPaneState, 'profileId' | 'status'>): boolean {
  return Boolean(pane.profileId) && !isStopStatus(pane.status)
}

function canStopPane(pane: Pick<GemPaneState, 'ptyId' | 'status'>): boolean {
  return Boolean(pane.ptyId) || isStopStatus(pane.status)
}

function canRestartPane(pane: Pick<GemPaneState, 'profileId' | 'status'>): boolean {
  return Boolean(pane.profileId) && pane.status !== 'blank' && pane.status !== 'starting'
}

function getStartDisabledReason(pane: Pick<GemPaneState, 'profileId' | 'status'>): string {
  if (!pane.profileId) {
    return 'Assign a profile before starting.'
  }

  return isStopStatus(pane.status) ? 'Terminal session is already active.' : 'Start is unavailable.'
}

function getRestartDisabledReason(pane: Pick<GemPaneState, 'profileId' | 'status'>): string {
  if (!pane.profileId) {
    return 'Assign a profile before restarting.'
  }

  return pane.status === 'starting' ? 'Terminal session is already starting.' : 'Restart is unavailable.'
}

function isStopStatus(status: PaneStatus): boolean {
  return status === 'running' || status === 'starting'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
