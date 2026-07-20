# Gemstone Background Registry

Background concept generation for the gemstone prototype is paused. The live gemstone renderer uses `src/renderer-gemstone/domain/backgroundRegistry.ts`.

## Daily-Use Registry

Background exploration is paused. The normal daily-use selector now shows only Simple palette variants plus `Original Grid`:

- `simple-glass` / `Simple Glass`: default low-noise live glass background.
- `simple-diamond` / `Simple Diamond`: low-noise diamond/ice palette using the Simple Glass structure.
- `simple-onyx` / `Simple Onyx`: low-noise onyx palette using the Simple Glass structure.
- `simple-amethyst` / `Simple Amethyst`: low-noise amethyst palette using the Simple Glass structure.
- `simple-cobalt` / `Simple Cobalt`: low-noise cobalt palette using the Simple Glass structure.
- `simple-emerald` / `Simple Emerald`: low-noise emerald palette using the Simple Glass structure.
- `simple-ruby` / `Simple Ruby`: low-noise ruby palette using the Simple Glass structure.
- `simple-opal` / `Simple Opal`: low-noise opal palette using the Simple Glass structure.
- `original-grid` / `Original Grid`: permanent restored grid baseline. This option must remain available.

`Simple Glass` is the single default for new gemstone workspaces unless a persisted workspace already has a selected background. The Simple variants share the same visual structure, spacing, softness, and readability behavior; only the palette/material mood changes.

## Experimental / Reference

Experimental entries are hidden from the normal selector under the collapsed `Experimental / Reference` section:

- `dark-glass` / `Dark Glass`: legacy dark glass preset retained for old snapshots and comparison.
- `custom-local-asset` / `Custom Background`: optional local image-backed background slot for future user-owned assets.
- `icy-glass-surface` / `Icy Glass Surface`: experimental pale frosted glass surface.

Do not make any reference preset the default runtime background. Do not promote image-backed work back into daily use without a deliberate new registry decision and source-owned assets.

The stable production renderer lives in `src/renderer/` and does not consume this registry. The gemstone lab renderer lives in `src/renderer-gemstone/`.

To add a future local or custom background, add a registry entry with its `id`, `name`, `shortDescription`, `type`, light/dark `suitability`, `opacity`, `intensity`, optional `softenPx`, `experimental`, and `default` values. For committed local image assets, set `type: 'image'` and provide `assetPath`; the renderer exposes it through `--gemstone-custom-background-image`. Add a matching `data-background="<id>"` CSS block in `src/renderer-gemstone/styles.css`.
