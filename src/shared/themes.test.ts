import { describe, expect, it } from 'vitest'
import {
  migrateGlassMaterialPreference,
  resolveGlassMaterialPreference,
  getGlassMaterialColorMode
} from './themes'

describe('glass materials', () => {
  it('resolves Follow system to Diamond in light mode and Onyx in dark mode', () => {
    expect(resolveGlassMaterialPreference('follow-system', false)).toBe('diamond')
    expect(resolveGlassMaterialPreference('follow-system', true)).toBe('onyx')
  })

  it('uses a manual material without a separate color mode', () => {
    expect(resolveGlassMaterialPreference('diamond', true)).toBe('diamond')
    expect(getGlassMaterialColorMode('diamond')).toBe('light')
    expect(getGlassMaterialColorMode('onyx')).toBe('dark')
  })

  it('migrates old concrete glass themes and auto settings', () => {
    expect(migrateGlassMaterialPreference(undefined, 'amethyst')).toBe('amethyst')
    expect(migrateGlassMaterialPreference(undefined, 'auto')).toBe('follow-system')
  })
})
