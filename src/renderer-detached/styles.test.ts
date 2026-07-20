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
})

describe('detached pane glass', () => {
  it('uses a desktop-glass fill instead of the workspace material fill', () => {
    expect(source).toMatch(
      /\.detached-workspace \.gemstone-frame\s*{[^}]*background:\s*var\(--detached-material-fill\);/s
    )
  })

  it('keeps the detached window root transparent around the clipped pane', () => {
    expect(source).toMatch(/html,\s*body,\s*#root\s*{[^}]*background:\s*transparent !important;/s)
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
