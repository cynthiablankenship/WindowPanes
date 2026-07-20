import type { GemPaneState } from './gemstoneState'

export function getVisibleGemPaneStateCount(panes: readonly GemPaneState[]): number {
  return panes.filter((pane) => pane.hidden !== true).length
}

export function getDuplicateGemPaneIds(panes: readonly GemPaneState[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const pane of panes) {
    if (seen.has(pane.id)) {
      duplicates.add(pane.id)
      continue
    }

    seen.add(pane.id)
  }

  return [...duplicates].sort()
}

export function getRenderableGemPanes(panes: readonly GemPaneState[]): GemPaneState[] {
  const renderedIds = new Set<string>()
  const renderablePanes: GemPaneState[] = []

  for (const pane of panes) {
    if (pane.hidden === true || renderedIds.has(pane.id)) {
      continue
    }

    renderedIds.add(pane.id)
    renderablePanes.push(pane)
  }

  return renderablePanes
}
