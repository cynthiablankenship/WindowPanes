import { describe, expect, it } from 'vitest'
import type { CommandProfile } from '../../shared'
import type { GemPaneState } from './gemstoneState'
import { assignProfileToGemPane, setGemPaneMaterial, setGemPaneTreatment } from './paneOperations'
import {
  getPaneIconRules,
  getPaneManagementConfirmation,
  getPaneMenuModel,
  placePaneMenu,
  shouldShowBlankPaneProfilePrompt
} from './paneChrome'

const shellProfile: CommandProfile = {
  id: 'builtin.shell',
  name: 'Generic Shell',
  command: '',
  args: [],
  builtIn: true
}

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
    status: 'assigned',
    ptyId: null,
    ...overrides
  }
}

describe('gemstone pane chrome rules', () => {
  it('shows Play for stopped panes and not Stop', () => {
    const rules = getPaneIconRules(createPane({ status: 'assigned', ptyId: null }))

    expect(rules.primary).toBe('play')
    expect(rules.primary).not.toBe('stop')
  })

  it('shows Stop and Restart for running panes and not Play', () => {
    const rules = getPaneIconRules(createPane({ status: 'running', ptyId: 'pty-live' }))

    expect(rules.primary).toBe('stop')
    expect(rules.primary).not.toBe('play')
    expect(rules.showRestart).toBe(true)
  })

  it('reflects lock updates in the visible icon state and menu label', () => {
    const unlocked = createPane({ locked: false })
    const locked = createPane({ locked: true })

    expect(getPaneIconRules(unlocked).lock).toBe('unlocked')
    expect(getPaneMenuModel(unlocked, false).paneState[0].label).toBe('Lock')
    expect(getPaneIconRules(locked).lock).toBe('locked')
    expect(getPaneMenuModel(locked, false).paneState[0].label).toBe('Unlock')
  })

  it('uses the same pane data for menu and inspector appearance changes', () => {
    const panes = [createPane({ material: 'diamond', treatment: 'sharp' })]
    const afterMenuMaterial = setGemPaneMaterial(panes, 'pane-a', 'ruby')
    const afterInspectorTreatment = setGemPaneTreatment(afterMenuMaterial, 'pane-a', 'architectural')
    const pane = afterInspectorTreatment[0]

    expect(pane.material).toBe('ruby')
    expect(pane.treatment).toBe('architectural')
    expect(getPaneMenuModel(pane, false).profileAppearance.map((action) => action.label)).toContain(
      'Change material'
    )
  })

  it('keeps pane and session identity when changing material through menu state', () => {
    const panes = [
      createPane({
        id: 'running',
        status: 'running',
        ptyId: 'pty-live',
        launchedProfileId: 'builtin.shell',
        material: 'diamond'
      })
    ]

    const updated = setGemPaneMaterial(panes, 'running', 'emerald')[0]

    expect(updated).toMatchObject({
      id: 'running',
      material: 'emerald',
      ptyId: 'pty-live',
      launchedProfileId: 'builtin.shell'
    })
  })

  it('shows and removes the blank pane profile prompt based on profile assignment', () => {
    const blank = createPane({
      title: 'Blank Pane',
      profileId: null,
      status: 'blank'
    })

    expect(shouldShowBlankPaneProfilePrompt(blank)).toBe(true)

    const assigned = assignProfileToGemPane([blank], 'pane-a', shellProfile)

    expect(assigned.outcome).toBe('assigned')
    expect(
      assigned.outcome === 'assigned' ? shouldShowBlankPaneProfilePrompt(assigned.panes[0]) : true
    ).toBe(false)
  })

  it('places the menu inside the viewport near edges', () => {
    const position = placePaneMenu(
      { left: 760, top: 560, width: 32, height: 32 },
      { width: 324, height: 420 },
      { width: 800, height: 600 }
    )

    expect(position.left).toBeGreaterThanOrEqual(12)
    expect(position.top).toBeGreaterThanOrEqual(12)
    expect(position.left + 324).toBeLessThanOrEqual(788)
    expect(position.top + 420).toBeLessThanOrEqual(588)
  })

  it('does not mutate pane bounds when building or placing the menu', () => {
    const pane = createPane({ bounds: { x: 120, y: 140, width: 500, height: 320 } })
    const before = { ...pane.bounds }

    void getPaneMenuModel(pane, false)
    void placePaneMenu(
      { left: 120, top: 140, width: 32, height: 32 },
      { width: 324, height: 420 },
      { width: 900, height: 700 }
    )

    expect(pane.bounds).toEqual(before)
  })

  it('requires confirmation before hiding or removing running panes', () => {
    const running = createPane({ status: 'running', ptyId: 'pty-live' })

    expect(getPaneManagementConfirmation(running, 'hide')).toContain('keep running')
    expect(getPaneManagementConfirmation(running, 'remove')).toContain('stop the running terminal')
  })

  it('exposes only implemented requested menu actions with disabled reasons for unavailable session actions', () => {
    const blank = createPane({ title: 'Blank Pane', profileId: null, status: 'blank', ptyId: null })
    const running = createPane({ status: 'running', ptyId: 'pty-live' })
    const blankModel = getPaneMenuModel(blank, false)
    const runningModel = getPaneMenuModel(running, false)

    expect([
      ...runningModel.session,
      ...runningModel.paneState,
      ...runningModel.profileAppearance,
      ...runningModel.management
    ].map((action) => action.id)).toEqual([
      'start',
      'stop',
      'restart',
      'toggle-lock',
      'toggle-maximized',
      'bring-to-front',
      'assign-profile',
      'change-material',
      'change-treatment',
      'flip-gemstone',
      'set-facet-orientation',
      'open-inspector',
      'hide-pane',
      'remove-pane'
    ])
    expect(blankModel.session.find((action) => action.id === 'start')?.disabledReason).toBe(
      'Assign a profile before starting.'
    )
    expect(blankModel.session.find((action) => action.id === 'restart')?.disabledReason).toBe(
      'Assign a profile before restarting.'
    )
    expect(runningModel.session.find((action) => action.id === 'stop')?.disabledReason).toBeUndefined()
  })

  it('disables geometry actions with a clear reason when the pane is locked', () => {
    const lockedModel = getPaneMenuModel(createPane({ locked: true }), false)

    expect(lockedModel.paneState.find((action) => action.id === 'toggle-maximized')?.disabledReason).toBe(
      'Unlock this pane before changing its bounds.'
    )
  })
})
