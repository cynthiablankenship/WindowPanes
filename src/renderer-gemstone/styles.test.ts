import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/renderer-gemstone/styles.css'), 'utf8').replace(/\r\n/g, '\n')

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\n\\}`).exec(css)

  return match?.[1] ?? ''
}

describe('gemstone selected pane styling', () => {
  it('does not offset or resize the apparent pane origin when selected', () => {
    const pane = cssBlock('.gem-pane')
    const activePane = cssBlock('.gem-pane.active')
    const activeFrame = cssBlock('.gem-pane.active .gemstone-frame')

    expect(pane).toContain('top: 0')
    expect(pane).toContain('left: 0')
    expect(pane).toContain('translate3d(var(--pane-x, 0), var(--pane-y, 0), 0)')
    expect(pane).toContain('will-change: transform')
    expect(activePane).toContain('translate3d(var(--pane-x, 0), var(--pane-y, 0), 0)')
    expect(activePane).toContain('rotateX(0.9deg) rotateY(-1.8deg)')
    expect(activeFrame).toContain('inset')
    expect(pane).not.toContain('transition')
    expect(activePane).not.toContain('transition')
  })

  it('uses a constrained pane shadow layer that moves with the pane', () => {
    const shadow = cssBlock('\n.gem-shadow')

    expect(shadow).toContain('radial-gradient')
    expect(shadow).toContain('filter: blur(16px)')
    expect(shadow).toContain('opacity: 0.78')
    expect(shadow).toContain('translate3d(18px, 30px, -80px)')
    expect(shadow).toContain('will-change: transform, opacity')
    expect(css).not.toContain('drop-shadow')
  })

  it('has a diagnostic effects-disable class that removes pane shadows, filters, and pseudo effects', () => {
    const effectlessPane = cssBlock('.gemstone-workspace.effects-disabled .gem-pane,\n.gemstone-workspace.effects-disabled .gemstone-frame,\n.gemstone-workspace.effects-disabled .terminal-core,\n.gemstone-workspace.effects-disabled .status-dot,\n.gemstone-workspace.effects-disabled .pane-icon-button')
    const effectlessLayers = cssBlock('.gemstone-workspace.effects-disabled .gem-shadow,\n.gemstone-workspace.effects-disabled .gemstone-frame::before,\n.gemstone-workspace.effects-disabled .gemstone-frame::after,\n.gemstone-workspace.effects-disabled .facet-grid,\n.gemstone-workspace.effects-disabled .edge-rim')

    expect(effectlessPane).toContain('filter: none !important')
    expect(effectlessPane).toContain('box-shadow: none !important')
    expect(effectlessPane).toContain('backdrop-filter: none !important')
    expect(effectlessLayers).toContain('display: none !important')
    expect(effectlessLayers).toContain('filter: none !important')
  })

  it('keeps compact pane controls above chrome and terminal layers as non-drag click targets', () => {
    const controls = cssBlock('.pane-icon-controls')
    const button = cssBlock('.pane-icon-button')
    const chromeAndTerminal = cssBlock('.gem-chrome,\n.gem-actions,\n.terminal-core,\n.gem-content-safe')

    expect(chromeAndTerminal).toContain('z-index: 5')
    expect(controls).toContain('z-index: 14')
    expect(controls).toContain('right: 78px')
    expect(controls).toContain('pointer-events: none')
    expect(button).toContain('touch-action: manipulation')
  })

  it('keeps icon-only command controls available without relying on an exposed active option button', () => {
    const commandIcon = cssBlock('.command-icon-button')
    const paneStyleIcon = cssBlock('.command-pane-style-button span')
    const backgroundPopover = cssBlock('.background-popover')
    const paneMenu = cssBlock('.pane-action-menu')

    expect(commandIcon).toContain('display: inline-grid')
    expect(paneStyleIcon).toContain('clip-path')
    expect(backgroundPopover).toContain('bottom: 94px')
    expect(paneMenu).toContain('z-index: 120')
  })

  it('defines registry-backed glass backgrounds plus a restored original grid', () => {
    const workspace = cssBlock('.gemstone-workspace')
    const atmosphere = cssBlock('.gemstone-atmosphere')
    const originalGrid = cssBlock('.gemstone-workspace[data-background="original-grid"]')
    const originalGridAtmosphere = cssBlock('.gemstone-workspace[data-background="original-grid"] .gemstone-atmosphere')
    const darkGlass = cssBlock('.gemstone-workspace[data-background="dark-glass"]')
    const customLocalAsset = cssBlock('.gemstone-workspace[data-background="custom-local-asset"]')
    const icyGlassSurface = cssBlock('.gemstone-workspace[data-background="icy-glass-surface"]')
    const icyGlassShadow = cssBlock('.gemstone-workspace[data-background="icy-glass-surface"] .gem-shadow')

    expect(workspace).not.toContain('94px 94px')
    expect(atmosphere).toContain('var(--atmosphere-refraction)')
    expect(atmosphere).toContain('filter: blur(var(--gemstone-background-soften, var(--atmosphere-blur)))')
    expect(atmosphere).toContain('opacity: var(--gemstone-background-opacity, var(--atmosphere-opacity))')
    expect(originalGrid).toContain('linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px)')
    expect(originalGrid).toContain('linear-gradient(142deg, #05070a, #101923 48%, #040609)')
    expect(originalGrid).toContain('94px 94px')
    expect(originalGridAtmosphere).toContain('linear-gradient(115deg, transparent 18%')
    expect(originalGridAtmosphere).toContain('mask-image: radial-gradient(circle at 50% 52%, black 0 55%, transparent 78%)')
    expect(darkGlass).not.toContain('94px 94px')
    expect(darkGlass).not.toContain('#101923')
    expect(customLocalAsset).toContain('var(--gemstone-custom-background-image')
    expect(css).toContain('[data-background="simple-glass"]')
    expect(css).toContain('[data-background="dark-glass"]')
    expect(css).toContain('[data-background="custom-local-asset"]')
    expect(css).toContain('[data-background="original-grid"]')
    expect(css).toContain('[data-background="icy-glass-surface"]')
    expect(icyGlassSurface).toContain('linear-gradient(145deg, #f8fdff 0%, #dcecf2 44%, #9fc0cd 100%)')
    expect(icyGlassSurface).toContain('soft-light')
    expect(icyGlassSurface).not.toContain('94px 94px')
    expect(icyGlassShadow).toContain('rgba(21, 45, 55, 0.22)')
    expect(icyGlassShadow).toContain('blur(14px)')
    expect(css).not.toContain('[data-background="crystal-mist"]')
    expect(css).not.toContain('[data-background="opal-glass"]')
  })

  it('shows background selector metadata without icon-only swatch labels', () => {
    const preset = cssBlock('.background-preset')
    const name = cssBlock('.background-preset-name')
    const description = cssBlock('.background-preset-description')
    const meta = cssBlock('.background-preset-meta')

    expect(preset).toContain('display: grid')
    expect(preset).toContain('min-height: 84px')
    expect(name).toContain('font-weight: 800')
    expect(description).toContain('-webkit-line-clamp: 2')
    expect(meta).toContain('flex-wrap: wrap')
  })
})
