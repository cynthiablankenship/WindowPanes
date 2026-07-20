# Gemstone Lab

The gemstone lab is an experimental renderer on the `gui-gemstone-prototype` branch. It is kept separate from the stable WindowPanes renderer so the prototype can be tested without replacing the production UI.

## Launch Commands

Launch the stable app:

```powershell
npm run dev
```

This loads `index.html` and `src/renderer/main.tsx`.

Launch the gemstone lab:

```powershell
npm run dev:gemstone
```

This sets `WINDOWPANES_RENDERER=gemstone`, starts the normal Electron/Vite development server, and loads `gemstone.html` with `src/renderer-gemstone/main.tsx`.

## Daily Use

Use `npm run dev:gemstone` for the experimental gemstone renderer. Use `npm run dev` when you want the stable production app on `master` behavior. The gemstone renderer is intentionally isolated under `src/renderer-gemstone/`; stabilization work should not edit `src/renderer/`.

The command crystal in the lower-right corner is the main workspace control. It can create panes, open background and pane-style controls, start all configured panes, save the current workspace as a named gemstone layout, reset to the default gemstone layout, and open recovery actions. The inspector exposes the same layout and recovery workflows with more room for saved-layout management.

Keyboard shortcuts in the gemstone renderer:

- `Ctrl+Shift+N`: create a new pane.
- `Ctrl+Shift+L`: lock or unlock the selected pane.
- `Ctrl+Shift+R`: reset the visible pane arrangement.
- `Ctrl+Shift+I`: open or close the inspector.
- `Esc`: close open gemstone menus and popovers.

Terminal input remains primary while the xterm surface is focused, so workspace shortcuts do not consume terminal keystrokes there.

## Layout Persistence and Saved Layouts

The gemstone renderer persists its live workspace under `gemstoneWorkspace` in app storage. The persisted snapshot includes pane IDs, profile assignments, material, treatment/style, facet orientation, bounds, restored bounds, z-index, lock state, maximized state, visibility, selected background, pane-style selector state, background selector state, inspector open state, and the saved gemstone layouts collection.

Runtime terminal state is not persisted. Restarting the gemstone renderer restores visual workspace state and profile assignments without relaunching terminal processes just because visual settings were restored.

Saved gemstone layouts are separate from production `layoutProfiles`. A saved gemstone layout captures visual pane properties and profile assignments. The inspector supports:

- Save current workspace as a named layout.
- Load a saved layout.
- Rename a saved layout.
- Copy a saved layout.
- Delete a saved layout with confirmation.
- Reset to the default gemstone layout.

Duplicate layout names are rejected instead of silently overwriting an existing layout.

## Pane Materials and Styles

Pane appearance is durable per pane:

- Material: `diamond`, `onyx`, `opal`, `amethyst`, `cobalt`, `emerald`, or `ruby`.
- Treatment/style: `sharp`, `polished`, or `architectural`.
- Facet orientation: `right`, `left`, or `symmetric`.

The pane menu and inspector edit the same pane state. The global pane-style selector applies one treatment to all panes but does not remove each pane's material or profile assignment.

Blank panes keep their material, treatment, orientation, bounds, and lock state while waiting for a profile. Stopped panes show a small Play action and keep their visual configuration.

## Recovery

Use the command crystal or inspector Recovery section when the workspace gets hard to manage:

- Reset visible arrangement: repositions visible panes into the default visible pattern.
- Bring all panes onscreen: unhides panes and moves them fully back into the canvas.
- Unlock all panes: clears global and per-pane locks.
- Stop all sessions: asks for confirmation, then stops running or starting terminal sessions.
- Clear stopped panes: asks for confirmation, then removes stopped, failed, assigned, or blank panes while leaving running sessions.

Loading a saved layout keeps matching live sessions when the pane ID and profile assignment still match. Unmatched live sessions require confirmation before being stopped.

## Renderer Locations

- Stable production renderer: `src/renderer/`
- Live gemstone renderer: `src/renderer-gemstone/`
- Shared Electron main/preload/storage/PTY contracts: `src/main/`, `src/preload/`, and `src/shared/`

The Electron main process selects the renderer entry from `WINDOWPANES_RENDERER`. Any value other than `gemstone` loads the stable app entry. The gemstone renderer stores its lab snapshot under `gemstoneWorkspace` in the same persisted state document, leaving production layouts and production renderer files separate.

## Live Backgrounds

Live gemstone background options are registered in `src/renderer-gemstone/domain/backgroundRegistry.ts` and styled in `src/renderer-gemstone/styles.css`.

The normal daily-use selector shows these options, in order:

- `Simple Glass`: default low-noise glass background.
- `Simple Diamond`: low-noise diamond/ice palette using the Simple Glass structure.
- `Simple Onyx`: low-noise onyx palette using the Simple Glass structure.
- `Simple Amethyst`: low-noise amethyst palette using the Simple Glass structure.
- `Simple Cobalt`: low-noise cobalt palette using the Simple Glass structure.
- `Simple Emerald`: low-noise emerald palette using the Simple Glass structure.
- `Simple Ruby`: low-noise ruby palette using the Simple Glass structure.
- `Simple Opal`: low-noise opal palette using the Simple Glass structure.
- `Original Grid`: restored structured grid baseline. This must remain available.

Background exploration is paused. The public tree keeps only source-owned live CSS backgrounds and an empty custom-background slot for future user-owned assets. Experimental options are hidden from the normal selector under the collapsed `Experimental / Reference` section: `Dark Glass`, `Custom Background`, and `Icy Glass Surface`.

The Simple variants share the same visual structure, spacing, softness, and readability behavior; only the palette/material mood changes. `Simple Glass` is the default unless an existing persisted workspace says otherwise. Do not promote new visual experiments into daily use without a deliberate registry change.

## Pane Movement Ghost Check

Use this check after changing pane movement, pane shadows, or image-based backgrounds:

1. Run `npm run dev:gemstone`.
2. Select `Simple Glass`, move the lower-right pane, and confirm the old location shows only the background.
3. Move the same pane repeatedly, release outside the pane, drag quickly toward window edges, then move another pane.
4. Repeat on `Original Grid`, `Simple Diamond`, and `Simple Onyx`.
5. Confirm no duplicate pane, old-position shadow, faded hidden pane, stale resize/drag state, or pseudo-element residue remains, and terminal sessions do not restart.

## Experimental Status

The gemstone renderer is working but remains experimental. The stabilization boundary is:

- Preserve the stable production renderer and its launch path.
- Treat `master` as the stable production app; gemstone readiness work belongs on the gemstone branch.
- Preserve the live gemstone renderer behavior: pane movement, resizing, locking, boundary recovery, pane creation, blank-pane profile choice, profile assignment, material changes, facet orientation/flip, menu actions, independent PTY sessions, and background persistence.
- Keep visual exploration paused. Do not create new background concepts during stabilization passes.
