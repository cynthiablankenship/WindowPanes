import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/renderer-gemstone/App.tsx'), 'utf8')

function sourceBlock(start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)

  if (startIndex === -1 || endIndex === -1) {
    return ''
  }

  return source.slice(startIndex, endIndex)
}

describe('gemstone renderer controls', () => {
  it('renders pane style options only when expanded and reopens from an icon-only command control', () => {
    const expandedSelector = sourceBlock(
      '<div className="display-style-selector" aria-label="Pane style selector">',
      '<div className="floating-command-crystal">'
    )
    const commandCrystal = sourceBlock('<div className="floating-command-crystal">', '{isCommandMenuOpen ? (')

    expect(expandedSelector).toContain('className="display-style-selector-expanded"')
    expect(expandedSelector).toContain('role="group" aria-label="Pane style choices"')
    expect(expandedSelector).toContain('TREATMENTS.map')
    expect(expandedSelector).not.toContain('aria-label="Reopen pane style selector"')
    expect(commandCrystal).toContain('!isDisplayStyleExpanded ?')
    expect(commandCrystal).toContain('className="command-icon-button command-pane-style-button"')
    expect(commandCrystal).toContain('aria-label="Reopen pane style selector"')
    expect(commandCrystal).toContain('title="Open pane style selector"')
    expect(commandCrystal).toContain('<span aria-hidden="true" />')
    expect(source).not.toContain('aria-hidden="true">Pane style:')
    expect(commandCrystal).not.toContain('formatTreatment(workspaceTreatment)')
  })

  it('keeps style switching independent from selector expansion state', () => {
    const setter = sourceBlock('function setAllTreatments', 'async function checkProfileAvailability')

    expect(setter).toContain('setPanes')
    expect(setter).not.toContain('setIsDisplayStyleExpanded')
  })

  it('persists background and selector state through the gemstone snapshot', () => {
    const saveEffect = sourceBlock('const snapshot = createGemstoneWorkspaceSnapshot', 'const nextState')
    const hydrateEffect = sourceBlock('setGlobalLocked', 'setIsHydrated(true)')

    expect(saveEffect).toContain('workspaceBackground')
    expect(saveEffect).toContain('isBackgroundSelectorExpanded')
    expect(saveEffect).toContain('isInspectorOpen')
    expect(saveEffect).toContain('savedLayouts')
    expect(saveEffect).toContain('activeSavedLayoutId')
    expect(hydrateEffect).toContain('normalizeGemstoneBackground')
    expect(hydrateEffect).toContain('backgroundSelectorExpanded')
    expect(hydrateEffect).toContain('displayStyleSelectorExpanded')
    expect(hydrateEffect).toContain('inspectorOpen')
    expect(hydrateEffect).toContain('savedLayouts')
  })

  it('renders a background selector from visible workspace controls and the inspector', () => {
    const commandCrystal = sourceBlock('<div className="floating-command-crystal">', '{isCommandMenuOpen ? (')
    const popover = sourceBlock('<section className="background-popover"', '{paneMenu && menuPane && menuModel ? (')
    const inspector = sourceBlock(
      '<aside className={`gem-inspector ${isInspectorOpen ?',
      '{selectedPane ? ('
    )

    expect(commandCrystal).toContain('className="command-icon-button command-background-button"')
    expect(commandCrystal).toContain('aria-label="Background"')
    expect(popover).toContain('aria-label="Background selector"')
    expect(popover).toContain('DAILY_GEMSTONE_BACKGROUND_REGISTRY.map')
    expect(popover).toContain('renderReferenceBackgroundSection()')
    expect(source).toContain('aria-pressed={isSelected}')
    expect(source).toContain('background.shortDescription')
    expect(source).toContain("background.experimental ? 'Experimental' : 'Stable'")
    expect(source).toContain('background.debugOnly ? <small>Reference/debug only</small> : null')
    expect(source).toContain('formatBackgroundSuitability(background.suitability)')
    expect(source).toContain('REFERENCE_GEMSTONE_BACKGROUND_REGISTRY.map(renderBackgroundChoice)')
    expect(source).toContain('<summary>Experimental / Reference</summary>')
    expect(inspector).toContain('className="background-selector"')
    expect(inspector).toContain('isBackgroundSelectorExpanded ?')
    expect(inspector).toContain('DAILY_GEMSTONE_BACKGROUND_REGISTRY.map')
    expect(inspector).toContain('renderReferenceBackgroundSection()')
    expect(inspector).toContain('className="background-compact"')
    expect(inspector).toContain('Background:')
  })

  it('applies background registry variables without starting or killing pane sessions', () => {
    const workspaceStyle = sourceBlock(
      'const workspaceBackgroundStyle = useMemo<WorkspaceBackgroundStyle>',
      'useEffect(() => {'
    )
    const renderBackgroundChoice = sourceBlock('function renderBackgroundChoice', 'return (')
    expect(workspaceStyle).toContain('--gemstone-background-opacity')
    expect(workspaceStyle).toContain('--gemstone-background-intensity')
    expect(workspaceStyle).toContain('--gemstone-background-soften')
    expect(workspaceStyle).toContain('--gemstone-custom-background-image')
    expect(source).toContain('onClick={() => setWorkspaceBackground(background.id)}')
    expect(renderBackgroundChoice).not.toContain('window.terminalApi.kill')
    expect(renderBackgroundChoice).not.toContain('setPanes')
  })

  it('renders only visible pane models and does not create drag previews or clones', () => {
    const visiblePaneDeclaration = sourceBlock(
      'const visiblePanes = useMemo',
      'const hiddenPaneCount'
    )
    const paneRenderLoop = sourceBlock('{visiblePanes.map((pane) => {', '</article>')

    expect(visiblePaneDeclaration).toContain('getRenderableGemPanes(panes)')
    expect(visiblePaneDeclaration).toContain('getVisibleGemPaneStateCount(panes)')
    expect(paneRenderLoop).toContain('data-pane-id={pane.id}')
    expect(paneRenderLoop).toContain('data-pane-visible="true"')
    expect(paneRenderLoop).toContain('data-pane-hidden={pane.hidden === true ?')
    expect(paneRenderLoop).toContain('key={pane.id}')
    expect(paneRenderLoop).toContain('<div className="gem-shadow" aria-hidden="true" />')
    expect(source).not.toContain('drag-preview')
    expect(source).not.toContain('cloneNode')
  })

  it('bridges detached pane config edits back through the workspace state owner', () => {
    expect(source).toContain('DETACHED_PANE_CONFIG_CHANNEL')
    expect(source).toContain("message.type === 'detached-pane-config:request'")
    expect(source).toContain("message.type !== 'detached-pane-config:update'")
    expect(source).toContain('const applied = applyPaneProfileAndAppearance')
    expect(source).toContain('message.paneId,')
    expect(source).toContain('confirmProfileReplacement: false')
    expect(source).toContain("status: isProfileChanging ? (profile ? 'assigned' : 'blank') : candidate.status")
  })

  it('provides an opt-in diagnostic overlay and pane effects-disable toggle', () => {
    expect(source).toContain('getInitialGemstoneDiagnosticFlag')
    expect(source).toContain('getInitialPaneEffectsDisabledFlag')
    expect(source).toContain('data-diagnostics={isDiagnosticsEnabled ?')
    expect(source).toContain('data-pane-effects-disabled={arePaneEffectsDisabled ?')
    expect(source).toContain('className="gem-diagnostics-panel"')
    expect(source).toContain('DOM panes {visiblePanes.length} / visible state {visiblePaneStateCount}')
    expect(source).toContain('Duplicate IDs {duplicatePaneIds.length > 0 ?')
    expect(source).toContain("isDiagnosticShortcut(event, 'd')")
    expect(source).toContain("isDiagnosticShortcut(event, 'e')")
  })

  it('uses transform-based pane movement instead of left/top repainting', () => {
    const paneArticle = sourceBlock('<article', '<div className="gem-shadow"')

    expect(paneArticle).toContain("'--pane-x': `${pane.bounds.x}px`")
    expect(paneArticle).toContain("'--pane-y': `${pane.bounds.y}px`")
    expect(paneArticle).toContain('width: pane.bounds.width')
    expect(paneArticle).toContain('height: pane.bounds.height')
    expect(paneArticle).toContain('zIndex: pane.zIndex')
    expect(paneArticle).not.toContain('left: pane.bounds.x')
    expect(paneArticle).not.toContain('top: pane.bounds.y')
  })

  it('clears pane drag state on release, cancel, lost capture, mouseup, and window blur', () => {
    const interactionEffect = sourceBlock(
      'const handlePointerMove = (event: PointerEvent): void => {',
      'function updatePane'
    )
    const beginInteraction = sourceBlock('function beginInteraction', 'function togglePaneLock')

    expect(interactionEffect).toContain('interaction.pointerId !== event.pointerId')
    expect(interactionEffect).toContain('applyGemPaneBoundsInteraction')
    expect(interactionEffect).toContain("window.addEventListener('pointerup', handlePointerUp)")
    expect(interactionEffect).toContain("window.addEventListener('pointercancel', handlePointerCancel)")
    expect(interactionEffect).toContain("window.addEventListener('lostpointercapture', handlePointerCancel, true)")
    expect(interactionEffect).toContain("window.addEventListener('mouseup', handleMouseUp)")
    expect(interactionEffect).toContain("window.addEventListener('blur', handleWindowBlur)")
    expect(interactionEffect).toContain('releaseInteractionCapture(interaction)')
    expect(interactionEffect).toContain('interactionRef.current = null')
    expect(interactionEffect).toContain('setDraggingPaneId(null)')
    expect(beginInteraction).toContain('captureTarget: event.currentTarget')
    expect(beginInteraction).toContain('setDraggingPaneId(pane.id)')
  })

  it('clears active interaction state before reset and loaded layout application', () => {
    const resetArrangement = sourceBlock('function resetArrangement', 'function bringAllPanesOnscreen')
    const resetDefault = sourceBlock('function resetToDefaultLayout', 'function hidePane')
    const applySnapshot = sourceBlock('function applyWorkspaceSnapshot', 'function resetArrangement')

    expect(resetArrangement).toContain('endInteraction()')
    expect(resetDefault).toContain('endInteraction()')
    expect(applySnapshot).toContain('endInteraction()')
  })

  it('renders saved-layout and recovery controls from the command crystal and inspector', () => {
    const commandMenu = sourceBlock('{isCommandMenuOpen ? (', '{isBackgroundSelectorExpanded ? (')
    const inspector = sourceBlock(
      '<aside className={`gem-inspector ${isInspectorOpen ?',
      '{selectedPane ? ('
    )

    expect(commandMenu).toContain('Save layout')
    expect(commandMenu).toContain('Reset default')
    expect(commandMenu).toContain('Reset visible')
    expect(commandMenu).toContain('Bring onscreen')
    expect(commandMenu).toContain('Stop sessions')
    expect(commandMenu).toContain('Clear stopped')
    expect(inspector).toContain('Saved layouts')
    expect(inspector).toContain('savedLayouts.map')
    expect(inspector).toContain('Rename')
    expect(inspector).toContain('Copy')
    expect(inspector).toContain('Delete')
    expect(inspector).toContain('Recovery')
    expect(inspector).toContain('Bring all panes onscreen')
  })

  it('wires requested shortcuts through the gemstone shortcut guard', () => {
    const shortcutEffect = sourceBlock('const action = getGemstoneShortcutAction', 'window.addEventListener')

    expect(shortcutEffect).toContain('targetIsTerminal: isTerminalKeyboardTarget(event.target)')
    expect(shortcutEffect).toContain('openProfileChooser()')
    expect(shortcutEffect).toContain('togglePaneLock(selectedPane.id)')
    expect(shortcutEffect).toContain('resetArrangement()')
    expect(shortcutEffect).toContain('setIsInspectorOpen((current) => !current)')
    expect(source).toContain("target.closest('.terminal-surface, .xterm')")
  })

  it('keeps setup-managed built-in agents visible before they are installed', () => {
    const newPaneProfiles = sourceBlock('function getNewPaneProfiles', 'function getInspectorProfiles')
    const installedFallback = sourceBlock('function findInstalledAgentProfile', 'function getProfileTitle')

    expect(newPaneProfiles).toContain('profile.builtIn === true')
    expect(newPaneProfiles).not.toContain("availabilityByProfileId[profile.id]?.state === 'installed')")
    expect(installedFallback).toContain("'builtin.claude'")
    expect(installedFallback).toContain("'builtin.droid'")
    expect(installedFallback).toContain("'builtin.opencode'")
    expect(installedFallback).toContain("'builtin.reasonix'")
    expect(installedFallback).toContain("'builtin.pi'")
    expect(installedFallback).toContain("'builtin.hermes'")
    expect(installedFallback).toContain("'builtin.openclaw'")
  })
})
