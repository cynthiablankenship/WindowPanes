import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped} \\{([\\s\\S]*?)\\n\\}`).exec(css)

  expect(match, `Expected to find ${selector}`).not.toBeNull()

  return match?.[1] ?? ''
}

describe('renderer material styles', () => {
  it('uses Glass Material tokens for profile list rows', () => {
    const profileRow = cssBlock('.profile-row')
    const protectedProfile = cssBlock('.protected-profile')

    expect(profileRow).toContain('var(--theme-pane-highlight)')
    expect(profileRow).toContain('var(--theme-pane-surface)')
    expect(profileRow).toContain('var(--border-faint)')
    expect(protectedProfile).toContain('var(--accent-soft)')
    expect(protectedProfile).toContain('var(--theme-pane-surface-strong)')
    expect(protectedProfile).not.toContain('rgba(13, 24, 35')
  })

  it('uses tokenized profile status badge colors', () => {
    const installed = cssBlock('.profile-badge-installed')
    const missing = /\.profile-badge-missing,\r?\n\.profile-badge-install-failed \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    const installing = cssBlock('.profile-badge-installing')
    const unknown = cssBlock('.profile-badge-unknown')

    expect(installed).toContain('var(--success)')
    expect(missing).toBeTruthy()
    expect(missing).toContain('var(--danger)')
    expect(installing).toContain('var(--warning)')
    expect(unknown).toContain('var(--accent)')
  })
})
