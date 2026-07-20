import { describe, expect, it } from 'vitest'
import { getGemstoneShortcutAction } from './shortcuts'

describe('gemstone keyboard shortcuts', () => {
  it('maps requested workspace shortcuts when terminal input is not focused', () => {
    expect(getGemstoneShortcutAction({ key: 'N', ctrlKey: true, shiftKey: true, altKey: false })).toBe(
      'new-pane'
    )
    expect(getGemstoneShortcutAction({ key: 'l', ctrlKey: true, shiftKey: true, altKey: false })).toBe(
      'toggle-selected-lock'
    )
    expect(getGemstoneShortcutAction({ key: 'r', ctrlKey: true, shiftKey: true, altKey: false })).toBe(
      'reset-visible-arrangement'
    )
    expect(getGemstoneShortcutAction({ key: 'i', ctrlKey: true, shiftKey: true, altKey: false })).toBe(
      'toggle-inspector'
    )
  })

  it('preserves terminal input for Ctrl+Shift shortcuts', () => {
    expect(
      getGemstoneShortcutAction({
        key: 'N',
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        targetIsTerminal: true
      })
    ).toBeNull()
  })

  it('uses Esc only to close open popovers and menus', () => {
    expect(getGemstoneShortcutAction({ key: 'Escape', ctrlKey: false, shiftKey: false, altKey: false })).toBeNull()
    expect(
      getGemstoneShortcutAction({
        key: 'Escape',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        targetIsTerminal: true,
        popoverOpen: true
      })
    ).toBe('close-popover')
  })
})
