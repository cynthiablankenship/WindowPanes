import { describe, expect, it } from 'vitest'
import { createGemstoneWorkspaceSnapshot, type GemPaneState } from './gemstoneState'
import {
  deleteGemstoneSavedLayout,
  duplicateGemstoneSavedLayout,
  loadGemstoneSavedLayout,
  renameGemstoneSavedLayout,
  saveNamedGemstoneLayout
} from './workspaceLayouts'

function createPane(overrides: Partial<GemPaneState> = {}): GemPaneState {
  return {
    id: 'pane-a',
    title: 'Pane A',
    profileId: 'builtin.shell',
    material: 'diamond',
    treatment: 'sharp',
    facetOrientation: 'right',
    bounds: { x: 24, y: 30, width: 420, height: 300 },
    zIndex: 1,
    locked: false,
    maximized: false,
    status: 'running',
    ptyId: 'pty-runtime',
    launchedProfileId: 'builtin.shell',
    errorMessage: 'runtime only',
    ...overrides
  }
}

describe('gemstone saved workspace layouts', () => {
  it('creates and loads named layouts with visual properties and no runtime process fields', () => {
    const snapshot = createGemstoneWorkspaceSnapshot(
      [
        createPane({
          id: 'ruby-pane',
          material: 'ruby',
          treatment: 'architectural',
          facetOrientation: 'left',
          locked: true,
          maximized: true,
          restoreBounds: { x: 10, y: 20, width: 400, height: 280 }
        })
      ],
      'ruby-pane',
      true,
      true,
      'original-grid',
      true,
      true
    )

    const saved = saveNamedGemstoneLayout(snapshot, ' Daily lab ', 'layout-one', '2026-06-20T13:00:00.000Z')

    expect(saved.outcome).toBe('saved')
    expect(saved.outcome === 'saved' ? saved.layout.workspace.panes[0] : null).toMatchObject({
      id: 'ruby-pane',
      profileId: 'builtin.shell',
      material: 'ruby',
      treatment: 'architectural',
      facetOrientation: 'left',
      locked: true,
      maximized: true
    })
    expect(JSON.stringify(saved.outcome === 'saved' ? saved.layout.workspace : {})).not.toContain('pty-runtime')

    const loaded = saved.outcome === 'saved' ? loadGemstoneSavedLayout(saved.snapshot, 'layout-one') : saved

    expect(loaded.outcome).toBe('saved')
    expect(loaded.snapshot).toMatchObject({
      selectedPaneId: 'ruby-pane',
      globalLocked: true,
      background: 'original-grid',
      inspectorOpen: true,
      activeSavedLayoutId: 'layout-one'
    })
  })

  it('rejects silent overwrites and supports rename, duplicate, and delete', () => {
    const snapshot = createGemstoneWorkspaceSnapshot([createPane()], 'pane-a', false)
    const saved = saveNamedGemstoneLayout(snapshot, 'Daily Lab', 'layout-one', '2026-06-20T13:00:00.000Z')
    const duplicateName =
      saved.outcome === 'saved'
        ? saveNamedGemstoneLayout(saved.snapshot, ' daily   lab ', 'layout-two', '2026-06-20T13:01:00.000Z')
        : saved

    expect(duplicateName.outcome).toBe('duplicate-name')

    const renamed =
      saved.outcome === 'saved'
        ? renameGemstoneSavedLayout(saved.snapshot, 'layout-one', 'Focus Layout', '2026-06-20T13:02:00.000Z')
        : saved
    const duplicated =
      renamed.outcome === 'saved'
        ? duplicateGemstoneSavedLayout(renamed.snapshot, 'layout-one', 'Focus Copy', 'layout-copy', '2026-06-20T13:03:00.000Z')
        : renamed
    const deleted =
      duplicated.outcome === 'saved' ? deleteGemstoneSavedLayout(duplicated.snapshot, 'layout-one') : duplicated

    expect(renamed.outcome === 'saved' ? renamed.layout.name : '').toBe('Focus Layout')
    expect(duplicated.snapshot.savedLayouts?.map((layout) => layout.name)).toEqual(['Focus Layout', 'Focus Copy'])
    expect(deleted.snapshot.savedLayouts?.map((layout) => layout.id)).toEqual(['layout-copy'])
  })
})
