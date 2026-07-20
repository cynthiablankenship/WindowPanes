export type GemstoneShortcutAction =
  | 'new-pane'
  | 'toggle-selected-lock'
  | 'reset-visible-arrangement'
  | 'toggle-inspector'
  | 'close-popover'

export interface GemstoneShortcutInput {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey?: boolean
  targetIsTerminal?: boolean
  popoverOpen?: boolean
}

export function getGemstoneShortcutAction(input: GemstoneShortcutInput): GemstoneShortcutAction | null {
  if (input.key === 'Escape') {
    return input.popoverOpen ? 'close-popover' : null
  }

  if (
    input.targetIsTerminal ||
    !input.ctrlKey ||
    !input.shiftKey ||
    input.altKey ||
    input.metaKey
  ) {
    return null
  }

  const key = input.key.toLowerCase()

  if (key === 'n') {
    return 'new-pane'
  }

  if (key === 'l') {
    return 'toggle-selected-lock'
  }

  if (key === 'r') {
    return 'reset-visible-arrangement'
  }

  if (key === 'i') {
    return 'toggle-inspector'
  }

  return null
}
