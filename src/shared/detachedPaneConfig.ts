import type { PaneStatus } from './layout'
import type { CommandProfile } from './profiles'

export const DETACHED_PANE_CONFIG_CHANNEL = 'windowpanes:detached-pane-config'

export interface DetachedPaneAppearanceDraft {
  profileId: string | null
  material: string
  treatment: string
  facetOrientation: string
}

export interface DetachedPaneConfigSnapshot extends DetachedPaneAppearanceDraft {
  paneId: string
  ptyId: string | null
  title: string
  subtitle: string
  status: PaneStatus
  profiles: CommandProfile[]
}

export type DetachedPaneConfigMessage =
  | {
      type: 'detached-pane-config:request'
      paneId: string
    }
  | {
      type: 'detached-pane-config:update'
      paneId: string
      draft: DetachedPaneAppearanceDraft
    }
  | {
      type: 'detached-pane-config:snapshot'
      snapshot: DetachedPaneConfigSnapshot
    }
  | {
      type: 'detached-pane-config:result'
      paneId: string
      ok: boolean
      message?: string
    }
