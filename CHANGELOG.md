# Changelog

## 0.2.1

Direct-manipulation Canvas panes and curated glass materials.

### Added

- Unlocked Canvas panes can be dragged directly by their title strip and resized directly from edges and corners without entering an Edit Layout mode.
- Per-pane lock controls persist with each pane; locked panes remain terminal-interactive but cannot be structurally moved, resized, or maximized.
- Workspace-level `Lock all` and `Unlock all` controls for Canvas panes.
- Click-to-front z-order persistence, title-bar double-click maximize/restore, compact maximize/restore control, and saved restore geometry.
- Gentle magnetic snapping to Canvas edges and nearby pane alignments with transient guide lines.
- Glass Material selector with Diamond, Onyx, Opal, Amethyst, Cobalt, Emerald, Ruby, and Follow system.
- Migration from v0.2.0 global Canvas lock state and legacy Color mode / Glass theme settings.

### Changed

- Bumped the app and package version to 0.2.1.
- Updated expected release artifact names to `WindowPanes-Setup-0.2.1.exe` and `WindowPanes-0.2.1-x86_64.AppImage`.
- Refined floating pane chrome with a thinner translucent title strip, compact lock/maximize/hide controls, and subtler locked-state treatment.
- Canvas geometry, z-order, lock, material, maximize, and restore metadata remain persisted separately from terminal runtime state.

## 0.2.0

Canvas floating glass workspace prototype.

### Added

- Canvas workspace mode alongside the stable Docked fallback.
- Movable, independently resizable overlapping floating panes with click-to-front z-order.
- Prominent layout lock/edit state, pane-level lock controls, safe hide/show, Tile panes, and Reset arrangement actions.
- Percent-based Canvas geometry persistence for pane id, profile assignment, bounds, z-order, lock, and visibility.
- Per-layout workspace mode, layout lock state, and glass theme persistence.
- Migration path that hydrates v0.1.x layouts into locked Docked mode without discarding profile assignments.
- Tests for Canvas geometry, z-order, lock behavior, legacy Docked migration, profile preservation, out-of-bounds repair, and Docked/Canvas persistence.

### Changed

- Bumped the app and package version to 0.2.0.
- Updated expected release artifact names to `WindowPanes-Setup-0.2.0.exe` and `WindowPanes-0.2.0-x86_64.AppImage`.
- Refined the glass material treatment for Canvas with a spacious workspace background, layered highlights, active illumination, and muted locked state.

## 0.1.2

Docking-first floating pane foundation and glass/gem themes.

### Added

- Future-compatible pane placement metadata for docked/floating mode, saved bounds, z-order, lock state, and snap targets while keeping this release docked.
- Diamond, Onyx, Opal, Amethyst, Emerald, Ruby, and Cobalt glass theme definitions with pane surface, border, highlight, glow, accent, text, hover, and active tokens.
- Appearance selector for light/dark mode and glass theme selection. Auto resolves to Diamond in light mode and Onyx in dark mode.

### Changed

- Restyled workspace panes with translucent glass surfaces, layered highlights, glow, and theme-driven stage/sidebar treatments.
- Bumped the app and package version to 0.1.2.
- Updated expected release artifact names to `WindowPanes-Setup-0.1.2.exe` and `WindowPanes-0.1.2-x86_64.AppImage`.

## 0.1.1

Visual polish pass for WindowPanes.

### Changed

- Bumped the app and package version to 0.1.1.
- Updated expected release artifact names to `WindowPanes-Setup-0.1.1.exe` and `WindowPanes-0.1.1-x86_64.AppImage`.
- Refined the dark app shell, sidebar, pane cards, and workspace framing for a calmer local AI CLI command center feel.
- Improved compact status badge styling for running, ready, installed, missing, installing, failed, and no-profile states.
- Restyled missing CLI setup panels and in-app confirmation dialogs while preserving the explicit install approval flow.

## 0.1.0

Initial local release polish for WindowPanes.

### Added

- MVP terminal panes for running local shells and CLI tools in a desktop workspace.
- Built-in command profiles for Generic Shell, Claude Code, Codex CLI, Droid, OpenCode, Reasonix, Pi, Hermes, and OpenClaw.
- Custom command profiles for user-defined local commands.
- Layout management with saved layouts, layout renaming, save-copy flow, deletion, profile assignments, and split sizes.
- Windows packaging with an unpacked app folder and NSIS installer.
- First-pass Linux packaging with an unpacked app folder and AppImage target.

### Known Limitations

- Packaging is Windows-first in v0.1, with Linux AppImage as the first Linux target.
- Linux packaging should be validated on Linux before release because WindowPanes uses the native `node-pty` dependency.
- macOS packaging is not implemented yet.
- Provider CLIs must be installed and authenticated separately outside WindowPanes.
