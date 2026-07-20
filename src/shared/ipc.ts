/**
 * IPC contract between the Electron renderer and main process.
 *
 * Process model:
 *   - main:     owns all node-pty instances. Spawns, writes, resizes, kills.
 *   - preload:  exposes the typed `window.terminalApi` / `window.storageApi`
 *               below over contextBridge. The renderer never touches
 *               ipcRenderer directly.
 *   - renderer: calls the typed API; receives data/exit via subscriptions.
 *
 * tom implements the main-side handlers + preload bridge against this file.
 * bob consumes `window.terminalApi` / `window.storageApi` from the renderer.
 * This file is the single source of truth — neither side redefines channels.
 */

import type { CommandProfile } from './profiles'
import type { CommandAvailabilityResult } from './commandAvailability'
import type { PersistedState } from './storage'

/** Channel names. Keep request/response on the same string. */
export const IpcChannel = {
  // renderer -> main (invoke / request-response)
  TerminalSpawn: 'terminal:spawn',
  TerminalWrite: 'terminal:write',
  TerminalResize: 'terminal:resize',
  TerminalKill: 'terminal:kill',
  TerminalRestart: 'terminal:restart',
  TerminalCheckCommand: 'terminal:check-command',
  TerminalSpawnSetup: 'terminal:spawn-setup',
  TerminalReplayData: 'terminal:replay-data',
  TerminalDetachPane: 'terminal:detach-pane',
  DetachedWindowUpdate: 'detached-window:update',
  StorageLoad: 'storage:load',
  StorageSave: 'storage:save',
  // main -> renderer (push events)
  TerminalData: 'terminal:data',
  TerminalExit: 'terminal:exit'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

// --- Terminal: request payloads (renderer -> main) ---------------------------

export interface SpawnRequest {
  /** Pane requesting the process; echoed back so the renderer can correlate. */
  paneId: string
  /** Fully-resolved profile to launch. The renderer resolves built-ins first. */
  profile: CommandProfile
  /** Initial terminal size. */
  cols: number
  rows: number
}

export interface SetupSpawnRequest extends SpawnRequest {}

export interface SpawnResult {
  /** Live handle id for subsequent write/resize/kill/restart calls. */
  ptyId: string
  paneId: string
}

export interface WriteRequest {
  ptyId: string
  /** Raw bytes (utf-8) to write to the pty stdin. */
  data: string
}

export interface ResizeRequest {
  ptyId: string
  cols: number
  rows: number
}

export interface KillRequest {
  ptyId: string
}

export interface RestartRequest {
  /** Kill the existing pty (if any) and respawn with the requested profile/size. */
  ptyId: string
  /** Current pane assignment at the time Restart was clicked. */
  profile: CommandProfile
}

export interface ReplayDataRequest {
  ptyId: string
}

export interface CommandAvailabilityRequest {
  profile: CommandProfile
}

export interface DetachPaneRequest {
  ptyId: string
  title: string
}

export interface DetachedWindowUpdateRequest {
  locked?: boolean
  alwaysOnTop?: boolean
}

// --- Terminal: event payloads (main -> renderer) -----------------------------

export interface TerminalDataEvent {
  ptyId: string
  /** Monotonic output sequence per pty, used to order replay + live data. */
  seq: number
  /** Raw output chunk to feed into xterm.write(). */
  data: string
}

export interface TerminalExitEvent {
  ptyId: string
  exitCode: number
  /** POSIX signal name/number when killed by signal; null otherwise. */
  signal: number | null
}

/** Unsubscribe handle returned by event subscriptions. */
export type Unsubscribe = () => void

/**
 * Renderer-facing terminal API, exposed by preload as `window.terminalApi`.
 * spawn/restart are async (return the new handle); write/resize/kill are
 * fire-and-forget. data/exit arrive via subscriptions.
 */
export interface TerminalApi {
  spawn(req: SpawnRequest): Promise<SpawnResult>
  spawnSetup(req: SetupSpawnRequest): Promise<SpawnResult>
  checkCommand(req: CommandAvailabilityRequest): Promise<CommandAvailabilityResult>
  write(req: WriteRequest): void
  resize(req: ResizeRequest): void
  kill(req: KillRequest): void
  restart(req: RestartRequest): Promise<SpawnResult>
  replayData(req: ReplayDataRequest): Promise<TerminalDataEvent[]>
  detachPane(req: DetachPaneRequest): Promise<void>
  updateDetachedWindow(req: DetachedWindowUpdateRequest): Promise<void>
  onData(listener: (event: TerminalDataEvent) => void): Unsubscribe
  onExit(listener: (event: TerminalExitEvent) => void): Unsubscribe
}

/**
 * Renderer-facing storage API, exposed by preload as `window.storageApi`.
 * Backed by a single JSON document in the app's userData dir (see storage.ts).
 */
export interface StorageApi {
  load(): Promise<PersistedState>
  save(state: PersistedState): Promise<void>
}

/** Augment the renderer global. Available after preload runs. */
declare global {
  interface Window {
    terminalApi: TerminalApi
    storageApi: StorageApi
  }
}
