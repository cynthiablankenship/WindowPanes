import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const rendererSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

describe('detached pane window regions', () => {
  it('keeps the unlocked titlebar draggable', () => {
    expect(source).toMatch(/\.detached-titlebar\s*{[^}]*-webkit-app-region:\s*drag;/s)
  })

  it('disables every draggable region when the pane is locked', () => {
    expect(source).toMatch(
      /body\.detached-locked,\s*body\.detached-locked \*\s*{[^}]*-webkit-app-region:\s*no-drag;/s
    )
    expect(rendererSource).toContain("document.body.classList.toggle('detached-locked', locked)")
  })

  it('provides large custom resize hit zones for the frameless detached window', () => {
    expect(rendererSource).toContain('DETACHED_RESIZE_MODES')
    expect(rendererSource).toContain('data-detached-resize')
    expect(rendererSource).toContain('resizeDetachedWindow')
    expect(source).toContain('.detached-window-resize-handle')
    expect(source).toContain('width: 44px')
    expect(source).toContain('height: 44px')
  })
})

describe('detached pane glass', () => {
  it('uses a clipped frosted material fill for detached panes', () => {
    expect(source).toMatch(/\.detached-workspace \.gemstone-frame\s*{[^}]*--detached-material-fill:/s)
    expect(source).toMatch(/\.detached-workspace \.gemstone-frame\s*{[^}]*background:\s*var\(--detached-material-fill\);/s)
    expect(source).toMatch(/\.detached-workspace \.gemstone-frame\s*{[^}]*backdrop-filter:\s*blur\(24px\) saturate\(1\.28\);/s)
  })

  it('keeps the detached window root transparent around the clipped pane', () => {
    expect(source).toMatch(/html,\s*body,\s*#root\s*{[^}]*background:\s*transparent !important;/s)
  })

  it('keeps the detached shadow clipped and soft instead of painting a black window backdrop', () => {
    expect(source).toMatch(/\.detached-workspace \.gem-shadow\s*{[^}]*opacity:\s*0\.52;/s)
    expect(source).toMatch(/\.detached-workspace \.gem-shadow\s*{[^}]*filter:\s*blur\(22px\);/s)
    expect(source).not.toMatch(/\.detached-workspace \.gem-shadow\s*{[^}]*display:\s*none;/s)
  })
})

describe('detached pane editor', () => {
  it('renders a detached appearance editor that can submit profile and style changes', () => {
    expect(rendererSource).toContain('DETACHED_PANE_CONFIG_CHANNEL')
    expect(rendererSource).toContain('data-edit')
    expect(rendererSource).toContain('detached-editor')
    expect(rendererSource).toContain("type: 'detached-pane-config:update'")
  })

  it('keeps the detached editor usable without becoming a drag region', () => {
    expect(source).toMatch(/\.detached-workspace \.detached-editor[\s\S]*-webkit-app-region:\s*no-drag;/)
  })
})
