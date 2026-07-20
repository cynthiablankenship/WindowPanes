# WindowPanes Architecture Note

WindowPanes is a local desktop app that hosts AI coding CLIs (Claude Code, Codex, Droid, OpenCode, Reasonix, Pi, Hermes, OpenClaw) and
plain shells in Docked or Canvas terminal workspaces. It is a **neutral
terminal host**: it launches the user's own CLIs exactly as a shell would and
gets out of the way.

## 1. Process model

Electron, three contexts, strict separation:

| Context    | Responsibility                                                              |
| ---------- | -------------------------------------------------------------------------- |
| `main`     | Owns all `node-pty` instances. Spawn/write/resize/kill/restart. Storage IO. |
| `preload`  | Exposes a typed, minimal API over `contextBridge`. No Node access leaks.    |
| `renderer` | React + xterm.js UI. Calls the typed API only; never touches `ipcRenderer`. |

`node-pty` is a **native module** and runs **only in main** (it is kept
external from the bundle — see `electron.vite.config.ts`). The renderer is
sandboxed: `contextIsolation` on, `nodeIntegration` off. The CSP in
`index.html` restricts scripts/styles to `'self'`.

Source layout (conventions, already wired into the tsconfigs):

```
src/main      -> Electron main process            (tom)
src/preload   -> contextBridge API surface        (tom)
src/renderer  -> React UI + xterm.js              (bob)
src/renderer-gemstone -> experimental gemstone lab renderer
src/shared    -> contract types (this boundary)   (alice)
```

The default `npm run dev` path loads `index.html` and `src/renderer/`. The experimental gemstone lab path uses `npm run dev:gemstone`, sets `WINDOWPANES_RENDERER=gemstone`, and loads `gemstone.html` plus `src/renderer-gemstone/`. This keeps the stable production renderer entry separate from the gemstone prototype entry.

## 2. Terminal hosting & IPC contract

One `node-pty` process per running pane, keyed by a main-assigned `ptyId`.
The full contract lives in `src/shared/ipc.ts` and is the single source of
truth. Summary:

**Renderer -> main (request/response, `ipcRenderer.invoke`):**

- `terminal:spawn` (`SpawnRequest` -> `SpawnResult`) — launch a `CommandProfile`
  at a given size; returns the `ptyId`.
- `terminal:write` (`WriteRequest`) — write raw stdin bytes.
- `terminal:resize` (`ResizeRequest`) — cols/rows on xterm fit.
- `terminal:kill` (`KillRequest`) — terminate the pty.
- `terminal:restart` (`RestartRequest` -> `SpawnResult`) — kill + respawn the
  same profile/size; returns a new `ptyId`.
- `storage:load` / `storage:save` — see Storage.

**Main -> renderer (push events):**

- `terminal:data` (`TerminalDataEvent`) — output chunk for `xterm.write()`.
- `terminal:exit` (`TerminalExitEvent`) — `exitCode` + optional `signal`.

The renderer consumes this only through `window.terminalApi` (preload). The
Generic Shell built-in uses an empty `command`; main resolves the real shell
per-platform at spawn time (`%COMSPEC%`/PowerShell on Windows, `$SHELL` on
unix). All other profiles launch `command` verbatim via PATH.

## 3. Domain types

Defined in `src/shared`, consumed by both implementers:

- **`CommandProfile`** (`profiles.ts`) — `{ id, name, command, args[], cwd?,
  env? }`. Pure launch metadata. Built-ins: Claude Code (`claude`), Codex CLI
  (`codex`), Droid (`droid`), OpenCode (`opencode`), Reasonix (`reasonix`),
  Pi (`pi`), Hermes (`hermes`), OpenClaw (`openclaw`), Generic Shell.
- **`PaneStatus`** (`layout.ts`) — `blank | assigned | running | error`.
- **`LayoutPreset`** (`layout.ts`) — `single | two-vertical | two-horizontal |
  three-pane | four-grid`, with `PRESET_PANE_COUNT`.
- **`LayoutProfile`** (`layout.ts`) — `{ id, name, preset, workspaceMode,
  layoutLocked, glassMaterial?, panes[], sizes[] }`; panes carry the assigned
  `profileId`. Runtime-only `PaneRuntime` holds live status + `ptyId` and is
  never persisted.
- **`PanePlacement`** (`layout.ts`) - `{ mode, bounds, restoreBounds?, zIndex,
  locked, maximized?, visible, snapTarget }`. Docked panes render through split panels. Canvas panes render
  as internal floating windows with percent-based bounds, stacking, pane-level
  lock, maximize/restore, and visibility metadata. Docked resize updates keep docked bounds in
  sync while existing floating Canvas geometry is preserved.
- **`GlassThemeDefinition`** (`themes.ts`) - named glass material definitions
  for pane surfaces, borders, highlights, glow, accents, text, hover, active,
  and terminal surface tokens. `preferences.glassMaterial` selects a material;
  `follow-system` resolves to Diamond in light OS mode and Onyx in dark OS mode.

## 4. Storage model

A single JSON document in Electron's `userData` dir, accessed via
`storage:load` / `storage:save`. Shape: `PersistedState` (`storage.ts`) —
`{ version, preferences, commandProfiles[], layoutProfiles[], activeLayoutId }`.

Stores **only**: app preferences, user-defined command-profile metadata, and
saved layout profiles. Built-in profiles are merged at runtime and never
written to disk.

Legacy v0.1.x layouts hydrate as `workspaceMode: "docked"` and
`layoutLocked: true`. Missing pane placement data is rebuilt from the docked
split preset and existing pane/profile assignments are retained.

## 5. Canvas workspace model

Canvas is a renderer mode on `LayoutProfile`, not a separate session runtime.
The same `PaneRuntime` records and `TerminalPane` instances are keyed by layout
id, pane id, and live `ptyId`; dragging and resizing update only
`PanePlacement.bounds` and `PanePlacement.zIndex`. They do not change the pane
id, assigned profile, or pty handle.

Canvas geometry is stored as percentages of the workspace surface:

- `bounds.x` / `bounds.y` place the pane within the canvas.
- `bounds.width` / `bounds.height` size the pane with minimum-size clamping.
- `zIndex` is raised on click-to-front.
- `locked` prevents a single pane from moving/resizing/maximizing while terminal
  input remains interactive.
- `maximized` and `restoreBounds` persist Canvas maximize/restore state without
  replacing the pane runtime.
- `visible` supports safe hide/show without deleting the pane assignment.

The layout-level `layoutLocked` flag is retained for old saved data and Docked
compatibility. During Canvas hydration, old locked layouts are migrated into
per-pane locks and the Canvas global lock mode is cleared. The renderer repairs
persisted out-of-bounds geometry during hydration and when a layout enters
Canvas.

Snapping builds on the existing `snapTarget` field and transient
`CanvasSnapGuide` values. The snapping pass adjusts percent bounds near Canvas
edges or neighboring pane alignments without forcing a grid. A docking
expansion can promote a floating pane back into a docked split slot without
replacing the pty/session model.

**Never stored / logged:** terminal transcripts, command output, keystrokes,
or any provider credentials. No transcripts are logged by default.

## 6. Provider-boundary rules (the non-harness boundary)

This app is a terminal host, **not** an agent harness. It must not become an
intermediary between the user and their AI provider. Hard rules:

- **No API keys.** The app never stores, requests, or injects provider API keys.
- **No provider OAuth.** No provider login/auth flows. Each CLI authenticates
  itself, as it would in a normal terminal.
- **No prompt injection.** The app never inserts, prepends, or appends text to
  what the user types or what the CLI receives.
- **No hidden args / wrapping.** Profiles launch `command` + `args` verbatim.
  No flags, wrappers, or shims are added behind the user's back.
- **No auto-send into CLIs.** Input reaches a pty only from explicit user
  keystrokes (or an explicit paste). The app never auto-submits.
- **No proxying provider APIs.** The app makes no network calls to provider
  backends and routes nothing through itself.
- **No hidden MCP tools.** The app exposes no MCP servers/tools to the hosted
  CLIs; it does not advertise capabilities on their behalf.

Net effect: anything a CLI does inside a pane is identical to running it
directly in the user's own terminal.

## 7. Parallel work split

- **alice** — owns `src/shared/*` (this contract). Frozen unless renegotiated.
- **tom** — `src/main` + `src/preload`: pty lifecycle, IPC handlers, storage IO,
  preload bridge — implements against `TerminalApi` / `StorageApi`.
- **bob** — `src/renderer`: layout grid, pane/profile management, xterm hosting —
  consumes `window.terminalApi` / `window.storageApi`.

Because all cross-process types live in `src/shared`, tom and bob can build in
parallel without overlapping edits. Any change to a channel or payload is a
contract change: raise it with alice rather than redefining types locally.
