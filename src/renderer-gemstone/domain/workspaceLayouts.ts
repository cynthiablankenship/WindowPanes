import type {
  GemstoneLayoutData,
  GemstoneSavedLayout,
  GemstoneWorkspaceSnapshot
} from './gemstoneState'

export type SavedLayoutResult =
  | { outcome: 'saved'; snapshot: GemstoneWorkspaceSnapshot; layout: GemstoneSavedLayout }
  | { outcome: 'duplicate-name'; snapshot: GemstoneWorkspaceSnapshot }
  | { outcome: 'invalid-name'; snapshot: GemstoneWorkspaceSnapshot }
  | { outcome: 'not-found'; snapshot: GemstoneWorkspaceSnapshot }

export function saveNamedGemstoneLayout(
  snapshot: GemstoneWorkspaceSnapshot,
  name: string,
  id: string,
  now: string
): SavedLayoutResult {
  const normalizedName = normalizeLayoutName(name)

  if (!normalizedName) {
    return { outcome: 'invalid-name', snapshot }
  }

  if (hasLayoutName(snapshot.savedLayouts ?? [], normalizedName)) {
    return { outcome: 'duplicate-name', snapshot }
  }

  const layout: GemstoneSavedLayout = {
    id,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
    workspace: captureLayoutData(snapshot)
  }

  return {
    outcome: 'saved',
    layout,
    snapshot: {
      ...snapshot,
      savedLayouts: [...(snapshot.savedLayouts ?? []), layout],
      activeSavedLayoutId: id
    }
  }
}

export function loadGemstoneSavedLayout(
  snapshot: GemstoneWorkspaceSnapshot,
  layoutId: string
): SavedLayoutResult {
  const layout = (snapshot.savedLayouts ?? []).find((candidate) => candidate.id === layoutId)

  if (!layout) {
    return { outcome: 'not-found', snapshot }
  }

  return {
    outcome: 'saved',
    layout,
    snapshot: {
      ...layout.workspace,
      savedLayouts: snapshot.savedLayouts ?? [],
      activeSavedLayoutId: layout.id
    }
  }
}

export function renameGemstoneSavedLayout(
  snapshot: GemstoneWorkspaceSnapshot,
  layoutId: string,
  name: string,
  now: string
): SavedLayoutResult {
  const normalizedName = normalizeLayoutName(name)
  const layouts = snapshot.savedLayouts ?? []
  const layout = layouts.find((candidate) => candidate.id === layoutId)

  if (!layout) {
    return { outcome: 'not-found', snapshot }
  }

  if (!normalizedName) {
    return { outcome: 'invalid-name', snapshot }
  }

  if (hasLayoutName(layouts, normalizedName, layoutId)) {
    return { outcome: 'duplicate-name', snapshot }
  }

  const renamed = { ...layout, name: normalizedName, updatedAt: now }

  return {
    outcome: 'saved',
    layout: renamed,
    snapshot: {
      ...snapshot,
      savedLayouts: layouts.map((candidate) => (candidate.id === layoutId ? renamed : candidate))
    }
  }
}

export function deleteGemstoneSavedLayout(
  snapshot: GemstoneWorkspaceSnapshot,
  layoutId: string
): SavedLayoutResult {
  const layouts = snapshot.savedLayouts ?? []
  const layout = layouts.find((candidate) => candidate.id === layoutId)

  if (!layout) {
    return { outcome: 'not-found', snapshot }
  }

  return {
    outcome: 'saved',
    layout,
    snapshot: {
      ...snapshot,
      savedLayouts: layouts.filter((candidate) => candidate.id !== layoutId),
      activeSavedLayoutId: snapshot.activeSavedLayoutId === layoutId ? undefined : snapshot.activeSavedLayoutId
    }
  }
}

export function duplicateGemstoneSavedLayout(
  snapshot: GemstoneWorkspaceSnapshot,
  layoutId: string,
  name: string,
  id: string,
  now: string
): SavedLayoutResult {
  const source = (snapshot.savedLayouts ?? []).find((candidate) => candidate.id === layoutId)
  const normalizedName = normalizeLayoutName(name)

  if (!source) {
    return { outcome: 'not-found', snapshot }
  }

  if (!normalizedName) {
    return { outcome: 'invalid-name', snapshot }
  }

  if (hasLayoutName(snapshot.savedLayouts ?? [], normalizedName)) {
    return { outcome: 'duplicate-name', snapshot }
  }

  const layout: GemstoneSavedLayout = {
    id,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
    workspace: cloneLayoutData(source.workspace)
  }

  return {
    outcome: 'saved',
    layout,
    snapshot: {
      ...snapshot,
      savedLayouts: [...(snapshot.savedLayouts ?? []), layout],
      activeSavedLayoutId: id
    }
  }
}

export function captureLayoutData(snapshot: GemstoneWorkspaceSnapshot): GemstoneLayoutData {
  return {
    schemaVersion: 1,
    selectedPaneId: snapshot.selectedPaneId,
    globalLocked: snapshot.globalLocked,
    displayStyleSelectorExpanded: snapshot.displayStyleSelectorExpanded === true,
    background: snapshot.background,
    backgroundSelectorExpanded: snapshot.backgroundSelectorExpanded === true,
    inspectorOpen: snapshot.inspectorOpen === true,
    panes: snapshot.panes.map((pane) => ({
      ...pane,
      bounds: { ...pane.bounds },
      restoreBounds: pane.restoreBounds ? { ...pane.restoreBounds } : undefined
    }))
  }
}

function cloneLayoutData(layout: GemstoneLayoutData): GemstoneLayoutData {
  return {
    ...layout,
    panes: layout.panes.map((pane) => ({
      ...pane,
      bounds: { ...pane.bounds },
      restoreBounds: pane.restoreBounds ? { ...pane.restoreBounds } : undefined
    }))
  }
}

function normalizeLayoutName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function hasLayoutName(
  layouts: readonly GemstoneSavedLayout[],
  name: string,
  exceptLayoutId?: string
): boolean {
  const normalizedName = normalizeLayoutName(name).toLocaleLowerCase()

  return layouts.some(
    (layout) =>
      layout.id !== exceptLayoutId && normalizeLayoutName(layout.name).toLocaleLowerCase() === normalizedName
  )
}
