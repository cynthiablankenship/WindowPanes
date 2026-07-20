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
})
