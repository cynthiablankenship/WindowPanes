import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  BUILT_IN_PROFILES,
  DEFAULT_PERSISTED_STATE,
  MANUAL_INSTALL_MESSAGE,
  confirmSetupInstallExecution,
  getInstallCommandForPlatform,
  isSetupManagedBuiltInProfile,
  type CommandAvailabilityResult,
  type CommandProfile,
  type PaneStatus,
  type StorageApi,
  type TerminalExitEvent
} from '../shared'
import { TerminalPane } from '../renderer/components/TerminalPane'
import { getAvailableCommandProfiles } from '../renderer/domain/commandProfiles'
import {
  clampPaneBounds,
  type CanvasSize,
  type PixelBounds,
  type ResizeHandle
} from './domain/geometry'
import {
  FACET_ORIENTATIONS,
  DAILY_GEMSTONE_BACKGROUND_REGISTRY,
  GEMSTONE_BACKGROUND_REGISTRY,
  MATERIALS,
  REFERENCE_GEMSTONE_BACKGROUND_REGISTRY,
  TREATMENTS,
  createGemstoneWorkspaceSnapshot,
  getDefaultGemstoneBackground,
  getGemstoneBackgroundDefinition,
  getGemstoneWorkspaceSnapshot,
  hydrateGemstonePanes,
  mergeGemstoneWorkspaceSnapshot,
  normalizeGemstoneBackground,
  type FacetOrientation,
  type GemstoneBackground,
  type GemstoneSavedLayout,
  type GemMaterial,
  type GemPaneState,
  type GemTreatment,
  type PersistedStateWithGemstoneWorkspace
} from './domain/gemstoneState'
import {
  applyGemPaneBoundsInteraction,
  bringAllGemPanesOnscreen,
  bringGemPaneToFront,
  clearStoppedGemPanes,
  flipGemPaneFacetOrientation,
  getPtyIdsToStopForLoadedLayout,
  hasActiveGemPaneSession,
  markGemPaneSessionStarted,
  markGemPaneSessionStarting,
  markGemPaneSessionStopped,
  mergeLoadedGemstoneLayout,
  removeGemPane,
  resetVisibleGemPaneArrangement,
  setGemPaneHidden,
  setGemPaneFacetOrientation,
  setGemPaneMaterial,
  setGemPaneTreatment,
  toggleGemPaneLock,
  unlockAllGemPanes
} from './domain/paneOperations'
import {
  getPaneIconRules,
  getPaneManagementConfirmation,
  getPaneMenuModel,
  getProfileReplacementConfirmation,
  placePaneMenu,
  shouldShowBlankPaneProfilePrompt,
  type PaneMenuAction,
  type PaneMenuActionId,
  type PaneMenuModel
} from './domain/paneChrome'
import {
  getDuplicateGemPaneIds,
  getRenderableGemPanes,
  getVisibleGemPaneStateCount
} from './domain/paneDiagnostics'
import { getGemstoneShortcutAction } from './domain/shortcuts'
import {
  deleteGemstoneSavedLayout,
  duplicateGemstoneSavedLayout,
  loadGemstoneSavedLayout,
  renameGemstoneSavedLayout,
  saveNamedGemstoneLayout,
  type SavedLayoutResult
} from './domain/workspaceLayouts'

type WorkspaceBackgroundStyle = CSSProperties & {
  '--gemstone-background-opacity': string
  '--gemstone-background-intensity': string
  '--gemstone-background-soften': string
  '--gemstone-custom-background-image'?: string
}

type PaneBoundsStyle = CSSProperties & {
  '--pane-x': string
  '--pane-y': string
}

interface NewPaneDraft {
  profileId: string
  material: GemMaterial
  treatment: GemTreatment
  facetOrientation: FacetOrientation
}

interface PointerInteraction {
  pointerId: number
  paneId: string
  mode: 'drag' | ResizeHandle
  startX: number
  startY: number
  startBounds: PixelBounds
  captureTarget: HTMLElement
}

interface PaneMenuState {
  paneId: string
  left: number
  top: number
}

type ProfileChooserMode = { kind: 'create' } | { kind: 'assign'; paneId: string }

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1280, height: 820 }
const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const PANE_MENU_SIZE = { width: 324, height: 560 }
const DEFAULT_NEW_PANE_DRAFT: NewPaneDraft = {
  profileId: '',
  material: 'diamond',
  treatment: 'sharp',
  facetOrientation: 'right'
}

export function GemstoneApp(): JSX.Element {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const paneMenuRef = useRef<HTMLDivElement | null>(null)
  const interactionRef = useRef<PointerInteraction | null>(null)
  const panesRef = useRef<GemPaneState[]>([])
  const storageStateRef = useRef<PersistedStateWithGemstoneWorkspace>(DEFAULT_PERSISTED_STATE)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE)
  const [customProfiles, setCustomProfiles] = useState<CommandProfile[]>([])
  const [panes, setPanes] = useState<GemPaneState[]>(() => createInitialPanes(DEFAULT_CANVAS_SIZE))
  const [selectedPaneId, setSelectedPaneId] = useState('gem-shell')
  const [newPaneDraft, setNewPaneDraft] = useState<NewPaneDraft>(DEFAULT_NEW_PANE_DRAFT)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false)
  const [isProfileChooserOpen, setIsProfileChooserOpen] = useState(false)
  const [profileChooserMode, setProfileChooserMode] = useState<ProfileChooserMode>({ kind: 'create' })
  const [paneMenu, setPaneMenu] = useState<PaneMenuState | null>(null)
  const [globalLocked, setGlobalLocked] = useState(false)
  const [isDisplayStyleExpanded, setIsDisplayStyleExpanded] = useState(false)
  const [workspaceBackground, setWorkspaceBackground] = useState<GemstoneBackground>(() =>
    getDefaultGemstoneBackground(getPrefersDarkWorkspace())
  )
  const [isBackgroundSelectorExpanded, setIsBackgroundSelectorExpanded] = useState(false)
  const [savedLayouts, setSavedLayouts] = useState<GemstoneSavedLayout[]>([])
  const [activeSavedLayoutId, setActiveSavedLayoutId] = useState<string | undefined>(undefined)
  const [availabilityByProfileId, setAvailabilityByProfileId] = useState<Record<string, CommandAvailabilityResult>>({})
  const [isDiagnosticsEnabled, setIsDiagnosticsEnabled] = useState(() => getInitialGemstoneDiagnosticFlag())
  const [arePaneEffectsDisabled, setArePaneEffectsDisabled] = useState(() => getInitialPaneEffectsDisabledFlag())
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null)

  const availableProfiles = useMemo(() => getAvailableCommandProfiles(customProfiles), [customProfiles])
  const visiblePanes = useMemo(() => getRenderableGemPanes(panes), [panes])
  const visiblePaneStateCount = useMemo(() => getVisibleGemPaneStateCount(panes), [panes])
  const duplicatePaneIds = useMemo(() => getDuplicateGemPaneIds(panes), [panes])
  const hiddenPaneCount = panes.length - visiblePaneStateCount
  const selectedPane = visiblePanes.find((pane) => pane.id === selectedPaneId) ?? visiblePanes[0] ?? panes[0]
  const menuPane = paneMenu ? panes.find((pane) => pane.id === paneMenu.paneId) : undefined
  const menuModel = menuPane ? getPaneMenuModel(menuPane, globalLocked) : null
  const workspaceTreatment = getWorkspaceTreatment(panes)
  const activeProfileById = useMemo(
    () => new Map(availableProfiles.map((profile) => [profile.id, profile])),
    [availableProfiles]
  )
  const newPaneProfiles = useMemo(
    () => getNewPaneProfiles(availableProfiles, availabilityByProfileId),
    [availabilityByProfileId, availableProfiles]
  )
  const inspectorProfiles = useMemo(
    () => getInspectorProfiles(newPaneProfiles, availableProfiles, selectedPane?.profileId ?? null),
    [availableProfiles, newPaneProfiles, selectedPane?.profileId]
  )
  const isSelectedPaneProfileLocked = selectedPane ? hasActiveGemPaneSession(selectedPane) : false
  const selectedBackgroundDefinition = getGemstoneBackgroundDefinition(workspaceBackground)
  const workspaceClassName = [
    'gemstone-workspace',
    isDiagnosticsEnabled ? 'diagnostic' : '',
    arePaneEffectsDisabled ? 'effects-disabled' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const workspaceBackgroundStyle = useMemo<WorkspaceBackgroundStyle>(() => {
    const style: WorkspaceBackgroundStyle = {
      '--gemstone-background-opacity': String(selectedBackgroundDefinition.opacity),
      '--gemstone-background-intensity': String(selectedBackgroundDefinition.intensity),
      '--gemstone-background-soften': `${selectedBackgroundDefinition.softenPx ?? 0}px`
    }

    if (selectedBackgroundDefinition.assetPath) {
      style['--gemstone-custom-background-image'] = `url("${selectedBackgroundDefinition.assetPath.replace(/"/g, '\\"')}")`
    }

    return style
  }, [selectedBackgroundDefinition])

  useEffect(() => {
    panesRef.current = panes
  }, [panes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isDiagnosticShortcut(event, 'd')) {
        event.preventDefault()
        event.stopPropagation()
        setIsDiagnosticsEnabled((current) => !current)
        return
      }

      if (isDiagnosticShortcut(event, 'e')) {
        event.preventDefault()
        event.stopPropagation()
        setArePaneEffectsDisabled((current) => !current)
        return
      }

      const action = getGemstoneShortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        targetIsTerminal: isTerminalKeyboardTarget(event.target),
        popoverOpen:
          Boolean(paneMenu) ||
          isCommandMenuOpen ||
          isProfileChooserOpen ||
          isBackgroundSelectorExpanded ||
          isDisplayStyleExpanded
      })

      if (!action) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (action === 'new-pane') {
        openProfileChooser()
        return
      }

      if (action === 'toggle-selected-lock' && selectedPane) {
        togglePaneLock(selectedPane.id)
        return
      }

      if (action === 'reset-visible-arrangement') {
        resetArrangement()
        return
      }

      if (action === 'toggle-inspector') {
        setIsInspectorOpen((current) => !current)
        return
      }

      closeTransientSurfaces()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  })

  useEffect(() => {
    if (!paneMenu) {
      return
    }

    const closeOnOutsidePointer = (event: MouseEvent): void => {
      if (paneMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setPaneMenu(null)
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPaneMenu(null)
      }
    }

    window.addEventListener('mousedown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [paneMenu])

  useEffect(() => {
    let isMounted = true

    getStorageApi()
      .load()
      .then((state) => {
        if (!isMounted) {
          return
        }

        const persistedState: PersistedStateWithGemstoneWorkspace = {
          ...DEFAULT_PERSISTED_STATE,
          ...state,
          preferences: {
            ...DEFAULT_PERSISTED_STATE.preferences,
            ...state.preferences
          },
          commandProfiles: state.commandProfiles ?? [],
          layoutProfiles: state.layoutProfiles ?? []
        }
        const gemstoneSnapshot = getGemstoneWorkspaceSnapshot(persistedState)
        const hydratedPanes = hydrateGemstonePanes(
          gemstoneSnapshot,
          createInitialPanes(DEFAULT_CANVAS_SIZE),
          DEFAULT_CANVAS_SIZE
        )
        const hydratedSelectedPaneId =
          gemstoneSnapshot?.selectedPaneId && hydratedPanes.some((pane) => pane.id === gemstoneSnapshot.selectedPaneId)
            ? gemstoneSnapshot.selectedPaneId
            : hydratedPanes[0]?.id ?? 'gem-shell'

        storageStateRef.current = persistedState
        setCustomProfiles(persistedState.commandProfiles)
        setPanes(hydratedPanes)
        setSelectedPaneId(hydratedSelectedPaneId)
        setGlobalLocked(gemstoneSnapshot?.globalLocked ?? false)
        setIsDisplayStyleExpanded(gemstoneSnapshot?.displayStyleSelectorExpanded ?? false)
        setWorkspaceBackground(
          normalizeGemstoneBackground(
            gemstoneSnapshot?.background,
            getDefaultGemstoneBackground(getPrefersDarkWorkspace())
          )
        )
        setIsBackgroundSelectorExpanded(gemstoneSnapshot?.backgroundSelectorExpanded === true)
        setIsInspectorOpen(gemstoneSnapshot?.inspectorOpen === true)
        setSavedLayouts(gemstoneSnapshot?.savedLayouts ?? [])
        setActiveSavedLayoutId(gemstoneSnapshot?.activeSavedLayoutId)
        setIsHydrated(true)
      })
      .catch(() => {
        if (isMounted) {
          setCustomProfiles(DEFAULT_PERSISTED_STATE.commandProfiles)
          setIsHydrated(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    const snapshot = createGemstoneWorkspaceSnapshot(
      panes,
      selectedPaneId,
      globalLocked,
      isDisplayStyleExpanded,
      workspaceBackground,
      isBackgroundSelectorExpanded,
      isInspectorOpen,
      savedLayouts,
      activeSavedLayoutId
    )
    const nextState = mergeGemstoneWorkspaceSnapshot(
      {
        ...storageStateRef.current,
        commandProfiles: customProfiles
      },
      snapshot
    )

    storageStateRef.current = nextState
    const timeoutId = window.setTimeout(() => {
      void getStorageApi().save(nextState)
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [
    customProfiles,
    globalLocked,
    isBackgroundSelectorExpanded,
    isDisplayStyleExpanded,
    isInspectorOpen,
    isHydrated,
    panes,
    savedLayouts,
    selectedPaneId,
    activeSavedLayoutId,
    workspaceBackground
  ])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const syncSize = (): void => {
      const nextSize = {
        width: Math.max(1, canvas.clientWidth),
        height: Math.max(1, canvas.clientHeight)
      }

      setCanvasSize(nextSize)
      setPanes((current) =>
        current.map((pane) => {
          if (!pane.maximized || pane.locked) {
            return pane
          }

          return {
            ...pane,
            bounds: getMaximizedBounds(nextSize)
          }
        })
      )
    }

    const resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(canvas)
    syncSize()

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    return window.terminalApi.onExit((event) => {
      const setupProfileId = panesRef.current
        .find((pane) => pane.ptyId === event.ptyId && pane.launchedProfileId?.endsWith('.setup'))
        ?.launchedProfileId?.replace(/\.setup$/, '')

      setPanes((current) => current.map((pane) => getPaneAfterExit(pane, event)))

      if (setupProfileId) {
        const setupProfile = activeProfileById.get(setupProfileId)

        if (setupProfile) {
          void checkProfileAvailability(setupProfile)
        }
      }
    })
  }, [activeProfileById])

  useEffect(() => {
    return window.terminalApi.onDetachedWindowClosed((event) => {
      const pane = panesRef.current.find((candidate) => candidate.ptyId === event.ptyId)

      if (!pane) {
        return
      }

      setPanes((current) => setGemPaneHidden(current, pane.id, false))
      setSelectedPaneId(pane.id)
    })
  }, [])

  useEffect(() => {
    const profilesToCheck = availableProfiles.filter(isSetupManagedBuiltInProfile)

    for (const profile of profilesToCheck) {
      if (availabilityByProfileId[profile.id]) {
        continue
      }

      void window.terminalApi
        .checkCommand({ profile })
        .then((availability) => {
          setAvailabilityByProfileId((current) => ({ ...current, [profile.id]: availability }))
        })
        .catch(() => undefined)
    }
  }, [availabilityByProfileId, availableProfiles])

  useEffect(() => {
    const installedAgent = findInstalledAgentProfile(availabilityByProfileId)

    if (!installedAgent || installedAgent === 'builtin.codex') {
      return
    }

    setPanes((current) =>
      current.map((pane) =>
        pane.id === 'gem-agent' && pane.profileId === 'builtin.codex'
          ? { ...pane, profileId: installedAgent, title: getProfileTitle(installedAgent) }
          : pane
      )
    )
  }, [availabilityByProfileId])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const interaction = interactionRef.current

      if (!interaction || interaction.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY

      setPanes((current) =>
        applyGemPaneBoundsInteraction(
          current,
          interaction.paneId,
          interaction.mode,
          interaction.startBounds,
          deltaX,
          deltaY,
          canvasSize
        )
      )
    }

    const handlePointerUp = (event: PointerEvent): void => {
      endInteraction(event.pointerId)
    }

    const handlePointerCancel = (event: PointerEvent): void => {
      endInteraction(event.pointerId)
    }

    const handleMouseUp = (): void => {
      endInteraction()
    }

    const handleWindowBlur = (): void => {
      endInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('lostpointercapture', handlePointerCancel, true)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('lostpointercapture', handlePointerCancel, true)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [canvasSize])

  function endInteraction(pointerId?: number): void {
    const interaction = interactionRef.current

    if (!interaction || (pointerId !== undefined && interaction.pointerId !== pointerId)) {
      return
    }

    releaseInteractionCapture(interaction)
    interactionRef.current = null
    setDraggingPaneId(null)
  }

  function releaseInteractionCapture(interaction: PointerInteraction): void {
    if (!interaction.captureTarget.hasPointerCapture(interaction.pointerId)) {
      return
    }

    try {
      interaction.captureTarget.releasePointerCapture(interaction.pointerId)
    } catch {
      // Pointer capture can already be released by the browser after cancellation.
    }
  }

  function updatePane(paneId: string, updater: (pane: GemPaneState) => GemPaneState): void {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? updater(pane) : pane)))
  }

  function bringPaneToFront(paneId: string): void {
    setSelectedPaneId(paneId)
    setPanes((current) => bringGemPaneToFront(current, paneId))
  }

  function beginInteraction(
    event: ReactPointerEvent<HTMLElement>,
    pane: GemPaneState,
    mode: 'drag' | ResizeHandle
  ): void {
    if (isPaneControlTarget(event.target)) {
      return
    }

    if (globalLocked || pane.locked || pane.maximized) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    bringPaneToFront(pane.id)
    setDraggingPaneId(pane.id)
    interactionRef.current = {
      pointerId: event.pointerId,
      paneId: pane.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBounds: pane.bounds,
      captureTarget: event.currentTarget
    }
  }

  function togglePaneLock(paneId: string): void {
    if (interactionRef.current?.paneId === paneId) {
      endInteraction()
    }

    setPanes((current) => toggleGemPaneLock(current, paneId))
  }

  function stopPaneControlPointerDown(event: ReactPointerEvent<HTMLElement>, paneId?: string): void {
    event.stopPropagation()

    if (paneId) {
      bringPaneToFront(paneId)
    }
  }

  function openPaneMenu(
    event: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>,
    pane: GemPaneState
  ): void {
    event.preventDefault()
    event.stopPropagation()
    bringPaneToFront(pane.id)
    setIsCommandMenuOpen(false)
    setIsProfileChooserOpen(false)

    const anchor = event.currentTarget.getBoundingClientRect()
    const position = placePaneMenu(
      {
        left: anchor.left,
        top: anchor.top,
        width: anchor.width,
        height: anchor.height
      },
      PANE_MENU_SIZE,
      { width: window.innerWidth, height: window.innerHeight }
    )

    setPaneMenu({ paneId: pane.id, ...position })
  }

  function handlePaneMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    event.preventDefault()
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    )
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + buttons.length) % buttons.length

    buttons[nextIndex]?.focus()
  }

  function togglePaneMaximized(paneId: string): void {
    updatePane(paneId, (pane) => {
      if (globalLocked || pane.locked) {
        return pane
      }

      if (pane.maximized) {
        return {
          ...pane,
          bounds: clampPaneBounds(pane.restoreBounds ?? createInitialPaneBounds(canvasSize)[0], canvasSize),
          restoreBounds: undefined,
          maximized: false
        }
      }

      return {
        ...pane,
        bounds: getMaximizedBounds(canvasSize),
        restoreBounds: pane.bounds,
        zIndex: Math.max(...panesRef.current.map((candidate) => candidate.zIndex), 1) + 1,
        maximized: true
      }
    })
  }

  function createCurrentWorkspaceSnapshot(): ReturnType<typeof createGemstoneWorkspaceSnapshot> {
    return createGemstoneWorkspaceSnapshot(
      panesRef.current,
      selectedPaneId,
      globalLocked,
      isDisplayStyleExpanded,
      workspaceBackground,
      isBackgroundSelectorExpanded,
      isInspectorOpen,
      savedLayouts,
      activeSavedLayoutId
    )
  }

  function applyWorkspaceSnapshot(snapshot: ReturnType<typeof createGemstoneWorkspaceSnapshot>): void {
    const hydratedPanes = hydrateGemstonePanes(snapshot, createInitialPanes(canvasSize), canvasSize)
    const ptyIdsToStop = getPtyIdsToStopForLoadedLayout(panesRef.current, hydratedPanes)

    if (
      ptyIdsToStop.length > 0 &&
      !window.confirm(`Loading this layout will stop ${ptyIdsToStop.length} unmatched terminal session(s). Continue?`)
    ) {
      return
    }

    for (const ptyId of ptyIdsToStop) {
      window.terminalApi.kill({ ptyId })
    }

    endInteraction()
    const nextPanes = mergeLoadedGemstoneLayout(panesRef.current, hydratedPanes)
    setPanes(nextPanes)
    setSelectedPaneId(
      snapshot.selectedPaneId && nextPanes.some((pane) => pane.id === snapshot.selectedPaneId)
        ? snapshot.selectedPaneId
        : nextPanes[0]?.id ?? ''
    )
    setGlobalLocked(snapshot.globalLocked)
    setIsDisplayStyleExpanded(snapshot.displayStyleSelectorExpanded === true)
    setWorkspaceBackground(
      normalizeGemstoneBackground(snapshot.background, getDefaultGemstoneBackground(getPrefersDarkWorkspace()))
    )
    setIsBackgroundSelectorExpanded(snapshot.backgroundSelectorExpanded === true)
    setIsInspectorOpen(snapshot.inspectorOpen === true)
    setSavedLayouts(snapshot.savedLayouts ?? [])
    setActiveSavedLayoutId(snapshot.activeSavedLayoutId)
    setPaneMenu(null)
    setIsCommandMenuOpen(false)
    setIsProfileChooserOpen(false)
  }

  function resetArrangement(): void {
    const nextBounds = createInitialPaneBounds(canvasSize)

    endInteraction()
    setGlobalLocked(false)
    setPanes((current) => resetVisibleGemPaneArrangement(current, nextBounds))
    closeTransientSurfaces()
  }

  function bringAllPanesOnscreen(): void {
    setPanes((current) => bringAllGemPanesOnscreen(current, canvasSize))
    closeTransientSurfaces()
  }

  function unlockAllPanes(): void {
    setGlobalLocked(false)
    setPanes((current) => unlockAllGemPanes(current))
    closeTransientSurfaces()
  }

  function stopAllSessions(): void {
    const activePanes = panesRef.current.filter(hasActiveGemPaneSession)

    if (activePanes.length === 0) {
      return
    }

    if (!window.confirm(`Stop ${activePanes.length} running or starting terminal session(s)?`)) {
      return
    }

    for (const pane of activePanes) {
      if (pane.ptyId) {
        window.terminalApi.kill({ ptyId: pane.ptyId })
      }
    }

    setPanes((current) =>
      current.map((pane) => ({
        ...pane,
        status: pane.profileId ? 'assigned' : 'blank',
        ptyId: null,
        launchedProfileId: undefined,
        errorMessage: undefined
      }))
    )
    closeTransientSurfaces()
  }

  function clearStoppedPanes(): void {
    const stoppedCount = panesRef.current.filter((pane) => !hasActiveGemPaneSession(pane)).length

    if (stoppedCount === 0) {
      return
    }

    if (!window.confirm(`Clear ${stoppedCount} stopped or blank pane(s)? Running sessions will remain.`)) {
      return
    }

    setPanes((current) => clearStoppedGemPanes(current))
    closeTransientSurfaces()
  }

  function resetToDefaultLayout(): void {
    if (!window.confirm('Reset the gemstone workspace to the default layout? Matching live sessions are kept.')) {
      return
    }

    endInteraction()
    applyWorkspaceSnapshot(
      createGemstoneWorkspaceSnapshot(
        createInitialPanes(canvasSize),
        'gem-shell',
        false,
        false,
        getDefaultGemstoneBackground(getPrefersDarkWorkspace()),
        false,
        isInspectorOpen,
        savedLayouts,
        undefined
      )
    )
  }

  function hidePane(paneId: string): void {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)

    if (!pane) {
      return
    }

    const confirmation = getPaneManagementConfirmation(pane, 'hide')

    if (confirmation && !window.confirm(confirmation)) {
      return
    }

    setPanes((current) => setGemPaneHidden(current, paneId, true))
    setSelectedPaneId(getNextVisiblePaneId(panesRef.current, paneId))
    setPaneMenu(null)
  }

  function removePane(paneId: string): void {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)

    if (!pane) {
      return
    }

    const confirmation = getPaneManagementConfirmation(pane, 'remove')

    if (confirmation && !window.confirm(confirmation)) {
      return
    }

    if (pane.ptyId) {
      window.terminalApi.kill({ ptyId: pane.ptyId })
    }

    setPanes((current) => removeGemPane(current, paneId))
    setSelectedPaneId(getNextVisiblePaneId(panesRef.current, paneId))
    setPaneMenu(null)
  }

  function showHiddenPanes(): void {
    setPanes((current) => current.map((pane) => ({ ...pane, hidden: false })))
  }

  function closeTransientSurfaces(): void {
    setPaneMenu(null)
    setIsCommandMenuOpen(false)
    setIsProfileChooserOpen(false)
    setIsBackgroundSelectorExpanded(false)
    setIsDisplayStyleExpanded(false)
  }

  function handleSavedLayoutResult(result: SavedLayoutResult, failureMessage: string): boolean {
    if (result.outcome === 'saved') {
      setSavedLayouts(result.snapshot.savedLayouts ?? [])
      setActiveSavedLayoutId(result.snapshot.activeSavedLayoutId)
      return true
    }

    if (result.outcome === 'duplicate-name') {
      window.alert('A saved gemstone layout with that name already exists.')
      return false
    }

    if (result.outcome === 'invalid-name') {
      window.alert('Enter a layout name before saving.')
      return false
    }

    window.alert(failureMessage)
    return false
  }

  function saveCurrentLayout(): void {
    const name = window.prompt('Save current gemstone workspace as:')

    if (name === null) {
      return
    }

    const result = saveNamedGemstoneLayout(createCurrentWorkspaceSnapshot(), name, createSavedLayoutId(), getNowIso())

    handleSavedLayoutResult(result, 'Could not save this layout.')
  }

  function loadSavedLayout(layoutId: string): void {
    const result = loadGemstoneSavedLayout(createCurrentWorkspaceSnapshot(), layoutId)

    if (result.outcome !== 'saved') {
      handleSavedLayoutResult(result, 'Could not find that saved layout.')
      return
    }

    applyWorkspaceSnapshot(result.snapshot)
  }

  function renameSavedLayout(layout: GemstoneSavedLayout): void {
    const name = window.prompt('Rename gemstone layout:', layout.name)

    if (name === null) {
      return
    }

    const result = renameGemstoneSavedLayout(createCurrentWorkspaceSnapshot(), layout.id, name, getNowIso())

    handleSavedLayoutResult(result, 'Could not rename that layout.')
  }

  function duplicateSavedLayout(layout: GemstoneSavedLayout): void {
    const name = window.prompt('Copy gemstone layout as:', `${layout.name} Copy`)

    if (name === null) {
      return
    }

    const result = duplicateGemstoneSavedLayout(
      createCurrentWorkspaceSnapshot(),
      layout.id,
      name,
      createSavedLayoutId(),
      getNowIso()
    )

    handleSavedLayoutResult(result, 'Could not copy that layout.')
  }

  function deleteSavedLayout(layout: GemstoneSavedLayout): void {
    if (!window.confirm(`Delete saved gemstone layout "${layout.name}"?`)) {
      return
    }

    const result = deleteGemstoneSavedLayout(createCurrentWorkspaceSnapshot(), layout.id)

    handleSavedLayoutResult(result, 'Could not delete that layout.')
  }

  function setPaneProfile(paneId: string, profileId: string | null): void {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)

    if (!pane) {
      return
    }

    void applyPaneProfileAndAppearance(paneId, {
      profileId: profileId ?? '',
      material: pane.material,
      treatment: pane.treatment,
      facetOrientation: pane.facetOrientation
    })
  }

  function applyPaneProfileAndAppearance(paneId: string, draft: NewPaneDraft): boolean {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)
    const profileId = draft.profileId || null
    const profile = profileId ? activeProfileById.get(profileId) : null

    if (!pane || (profileId && !profile)) {
      return false
    }

    const isProfileChanging = pane.profileId !== profileId
    const isReplacingActiveProfile = isProfileChanging && hasActiveGemPaneSession(pane)
    const confirmation = isReplacingActiveProfile ? getProfileReplacementConfirmation(pane, draft.material) : null

    if (confirmation && !window.confirm(confirmation)) {
      return false
    }

    if (isReplacingActiveProfile && pane.ptyId) {
      window.terminalApi.kill({ ptyId: pane.ptyId })
    }

    const shouldStart = (pane.status === 'blank' || isReplacingActiveProfile) && Boolean(profile)

    setPanes((current) =>
      current.map((candidate) => {
        if (candidate.id !== paneId) {
          return candidate
        }

        return {
          ...candidate,
          profileId,
          title: profile?.name ?? 'Blank Pane',
          material: draft.material,
          treatment: draft.treatment,
          facetOrientation: draft.facetOrientation,
          status: profile ? 'assigned' : 'blank',
          ptyId: isReplacingActiveProfile ? null : candidate.ptyId,
          launchedProfileId: isReplacingActiveProfile ? undefined : candidate.launchedProfileId,
          errorMessage: undefined
        }
      })
    )

    if (shouldStart && profile) {
      void startPane(paneId, profile)
    }

    return true
  }

  function setPaneMaterial(paneId: string, material: GemMaterial): void {
    setPanes((current) => setGemPaneMaterial(current, paneId, material))
  }

  function setPaneTreatment(paneId: string, treatment: GemTreatment): void {
    setPanes((current) => setGemPaneTreatment(current, paneId, treatment))
  }

  function setPaneFacetOrientation(paneId: string, facetOrientation: FacetOrientation): void {
    setPanes((current) => setGemPaneFacetOrientation(current, paneId, facetOrientation))
  }

  function flipPaneGemstone(paneId: string): void {
    setPanes((current) => flipGemPaneFacetOrientation(current, paneId))
  }

  function setAllTreatments(treatment: GemTreatment): void {
    setPanes((current) => current.map((pane) => ({ ...pane, treatment })))
  }

  async function checkProfileAvailability(profile: CommandProfile): Promise<CommandAvailabilityResult | null> {
    if (!isSetupManagedBuiltInProfile(profile)) {
      return null
    }

    try {
      const availability = await window.terminalApi.checkCommand({ profile })
      setAvailabilityByProfileId((current) => ({ ...current, [profile.id]: availability }))
      return availability
    } catch {
      return null
    }
  }

  async function ensureProfileLaunchable(paneId: string, profile: CommandProfile): Promise<boolean> {
    if (!isSetupManagedBuiltInProfile(profile)) {
      return true
    }

    const knownAvailability = availabilityByProfileId[profile.id]
    const availability =
      knownAvailability?.state === 'installed' ? knownAvailability : await checkProfileAvailability(profile)

    if (availability?.state === 'installed') {
      return true
    }

    updatePane(paneId, (current) => ({
      ...current,
      status: 'error',
      ptyId: null,
      errorMessage: formatMissingProfileSetupMessage(profile, availability)
    }))
    return false
  }

  async function startPane(paneId: string, profileOverride?: CommandProfile): Promise<void> {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)
    const profile = profileOverride ?? (pane?.profileId ? activeProfileById.get(pane.profileId) : undefined)

    if (!pane || !profile) {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: 'No command profile is assigned.'
      }))
      return
    }

    if (!(await ensureProfileLaunchable(paneId, profile))) {
      return
    }

    try {
      setPanes((current) => markGemPaneSessionStarting(current, paneId))
      const result = await window.terminalApi.spawn({
        paneId,
        profile,
        cols: 100,
        rows: 30
      })

      setPanes((current) => markGemPaneSessionStarted(current, paneId, result.ptyId, profile.id))
    } catch (error: unknown) {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        ptyId: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  async function startProfileSetup(paneId: string, profileId: string | null): Promise<void> {
    const profile = profileId ? activeProfileById.get(profileId) : undefined

    if (!profile || !isSetupManagedBuiltInProfile(profile)) {
      return
    }

    const availability = availabilityByProfileId[profile.id] ?? (await checkProfileAvailability(profile))
    const platform = availability?.platform ?? 'unknown'
    const installCommand = getInstallCommandForPlatform(profile, platform)

    if (!installCommand || installCommand.trust !== 'verified') {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: MANUAL_INSTALL_MESSAGE
      }))
      return
    }

    if (!confirmSetupInstallExecution(profile, platform, installCommand, window.confirm)) {
      return
    }

    try {
      setPanes((current) => markGemPaneSessionStarting(current, paneId))
      const result = await window.terminalApi.spawnSetup({
        paneId,
        profile,
        cols: 100,
        rows: 30
      })

      setPanes((current) => markGemPaneSessionStarted(current, paneId, result.ptyId, `${profile.id}.setup`))
    } catch (error: unknown) {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        ptyId: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  async function restartPane(paneId: string): Promise<void> {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)
    const profile = pane?.profileId ? activeProfileById.get(pane.profileId) : undefined

    if (!pane?.ptyId || !profile) {
      await startPane(paneId)
      return
    }

    if (!(await ensureProfileLaunchable(paneId, profile))) {
      return
    }

    try {
      setPanes((current) => markGemPaneSessionStarting(current, paneId))
      const result = await window.terminalApi.restart({ ptyId: pane.ptyId, profile })

      setPanes((current) => markGemPaneSessionStarted(current, paneId, result.ptyId, profile.id))
    } catch (error: unknown) {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  function stopPane(paneId: string): void {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)

    if (pane?.ptyId) {
      window.terminalApi.kill({ ptyId: pane.ptyId })
    }

    setPanes((current) => markGemPaneSessionStopped(current, paneId))
  }

  async function detachPane(paneId: string): Promise<void> {
    const pane = panesRef.current.find((candidate) => candidate.id === paneId)
    const profile = pane?.profileId ? activeProfileById.get(pane.profileId) : undefined

    if (!pane?.ptyId) {
      return
    }

    try {
      await window.terminalApi.detachPane({
        ptyId: pane.ptyId,
        title: pane.title,
        subtitle: profile ? formatCommand(profile) : 'Detached desktop pane',
        material: pane.material,
        treatment: pane.treatment,
        facetOrientation: pane.facetOrientation,
        width: pane.bounds.width,
        height: pane.bounds.height
      })
      setPanes((current) => setGemPaneHidden(current, paneId, true))
      setSelectedPaneId(getNextVisiblePaneId(panesRef.current, paneId))
    } catch (error: unknown) {
      updatePane(paneId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  function startAll(): void {
    for (const pane of panesRef.current) {
      if (!pane.hidden && pane.profileId && pane.status !== 'running' && pane.status !== 'starting') {
        void startPane(pane.id)
      }
    }
  }

  function openProfileChooser(paneId?: string): void {
    const pane = paneId ? panesRef.current.find((candidate) => candidate.id === paneId) : selectedPane

    setIsCommandMenuOpen(false)
    setPaneMenu(null)
    setProfileChooserMode(paneId ? { kind: 'assign', paneId } : { kind: 'create' })
    setNewPaneDraft({
      profileId: paneId ? pane?.profileId ?? '' : '',
      material: pane?.material ?? DEFAULT_NEW_PANE_DRAFT.material,
      treatment: pane?.treatment ?? DEFAULT_NEW_PANE_DRAFT.treatment,
      facetOrientation: pane?.facetOrientation ?? DEFAULT_NEW_PANE_DRAFT.facetOrientation
    })
    setIsProfileChooserOpen(true)
  }

  function updateNewPaneDraft(updater: (draft: NewPaneDraft) => NewPaneDraft): void {
    setNewPaneDraft((current) => updater(current))
  }

  function submitProfileChooser(): void {
    if (profileChooserMode.kind === 'assign') {
      if (applyPaneProfileAndAppearance(profileChooserMode.paneId, newPaneDraft)) {
        setIsProfileChooserOpen(false)
      }
      return
    }

    const newPaneId = createPaneId(panesRef.current)
    const profileId = newPaneDraft.profileId || null

    setPanes((current) => {
      const nextPane = createNewPane(newPaneId, profileId, newPaneDraft, current, canvasSize, activeProfileById)

      return [...current, nextPane]
    })
    setSelectedPaneId(newPaneId)
    setIsProfileChooserOpen(false)
  }

  function renderPaneMenuAction(
    action: PaneMenuAction,
    onClick: () => void
  ): JSX.Element {
    return (
      <button
        aria-disabled={action.disabledReason ? 'true' : undefined}
        disabled={Boolean(action.disabledReason)}
        key={action.id}
        role="menuitem"
        title={action.disabledReason ?? action.label}
        type="button"
        onClick={onClick}
      >
        <span>{action.label}</span>
        {action.disabledReason ? <small>{action.disabledReason}</small> : null}
      </button>
    )
  }

  function getMenuAction(model: PaneMenuModel, actionId: PaneMenuActionId): PaneMenuAction {
    const action = [...model.session, ...model.paneState, ...model.profileAppearance, ...model.management].find(
      (candidate) => candidate.id === actionId
    )

    if (!action) {
      throw new Error(`Missing pane menu action: ${actionId}`)
    }

    return action
  }

  function renderBackgroundChoice(background: (typeof GEMSTONE_BACKGROUND_REGISTRY)[number]): JSX.Element {
    const isSelected = workspaceBackground === background.id

    return (
      <button
        aria-pressed={isSelected}
        className={`background-preset background-preset-${background.id} ${isSelected ? 'selected' : ''}`}
        key={background.id}
        title={`${background.name}: ${background.shortDescription}`}
        type="button"
        onClick={() => setWorkspaceBackground(background.id)}
      >
        <span className="background-preset-name">{background.name}</span>
        <span className="background-preset-description">{background.shortDescription}</span>
        <span className="background-preset-meta">
          <small>{formatBackgroundSuitability(background.suitability)}</small>
          <small>{background.experimental ? 'Experimental' : 'Stable'}</small>
          {background.debugOnly ? <small>Reference/debug only</small> : null}
          {background.default ? <small>Default</small> : null}
        </span>
      </button>
    )
  }

  function renderReferenceBackgroundSection(): JSX.Element | null {
    if (REFERENCE_GEMSTONE_BACKGROUND_REGISTRY.length === 0) {
      return null
    }

    return (
      <details className="reference-backgrounds">
        <summary>Experimental / Reference</summary>
        <div className="background-preset-grid" role="group" aria-label="Experimental and reference background choices">
          {REFERENCE_GEMSTONE_BACKGROUND_REGISTRY.map(renderBackgroundChoice)}
        </div>
      </details>
    )
  }

  return (
    <main
      className={workspaceClassName}
      data-background={workspaceBackground}
      data-background-suitability={selectedBackgroundDefinition.suitability}
      data-background-type={selectedBackgroundDefinition.type}
      data-diagnostics={isDiagnosticsEnabled ? 'true' : 'false'}
      data-pane-effects-disabled={arePaneEffectsDisabled ? 'true' : 'false'}
      data-global-locked={globalLocked ? 'true' : 'false'}
      style={workspaceBackgroundStyle}
    >
      <section className="gemstone-canvas" ref={canvasRef} aria-label="Live gemstone terminal workspace">
        <div className="gemstone-atmosphere" aria-hidden="true" />
        {isDiagnosticsEnabled ? (
          <div className="gem-diagnostics-panel" data-pane-control="true">
            <strong>Gemstone diagnostics</strong>
            <span>
              DOM panes {visiblePanes.length} / visible state {visiblePaneStateCount} / state entries {panes.length}
            </span>
            <span>Hidden {panes.length - visiblePaneStateCount}</span>
            <span>Duplicate IDs {duplicatePaneIds.length > 0 ? duplicatePaneIds.join(', ') : 'none'}</span>
            <button type="button" onClick={() => setArePaneEffectsDisabled((current) => !current)}>
              {arePaneEffectsDisabled ? 'Enable pane effects' : 'Disable pane effects'}
            </button>
          </div>
        ) : null}
        {visiblePanes.length === 0 ? (
          <div className="canvas-empty-state">
            <strong>No gemstone panes are visible</strong>
            <span>Create a pane to start a terminal session.</span>
            <button type="button" onClick={() => openProfileChooser()}>
              + Pane
            </button>
          </div>
        ) : null}
        {visiblePanes.map((pane) => {
          const profile = pane.profileId ? activeProfileById.get(pane.profileId) : undefined
          const isGeometryLocked = globalLocked || pane.locked
          const attentionStatus = getPaneAttentionStatus(pane)
          const iconRules = getPaneIconRules(pane)
          const primarySessionLabel =
            iconRules.primary === 'stop' ? `Stop ${pane.title}` : pane.profileId ? `Start ${pane.title}` : `Choose profile for ${pane.title}`

          return (
            <article
              className={`gem-pane material-${pane.material} treatment-${pane.treatment} orientation-${
                pane.facetOrientation
              } status-${pane.status} ${pane.id === selectedPaneId ? 'active' : ''} ${
                isGeometryLocked ? 'locked' : ''
              }`}
              data-pane-id={pane.id}
              data-pane-visible="true"
              data-pane-hidden={pane.hidden === true ? 'true' : 'false'}
              data-pane-selected={pane.id === selectedPaneId ? 'true' : 'false'}
              data-pane-dragging={pane.id === draggingPaneId ? 'true' : 'false'}
              data-pane-locked={pane.locked ? 'true' : 'false'}
              data-pane-status={pane.status}
              key={pane.id}
              style={
                {
                  '--pane-x': `${pane.bounds.x}px`,
                  '--pane-y': `${pane.bounds.y}px`,
                  width: pane.bounds.width,
                  height: pane.bounds.height,
                  zIndex: pane.zIndex
                } satisfies PaneBoundsStyle
              }
              onPointerDown={() => bringPaneToFront(pane.id)}
              onFocus={() => bringPaneToFront(pane.id)}
              tabIndex={0}
            >
              {isDiagnosticsEnabled ? (
                <div className="gem-pane-diagnostic-label" data-pane-control="true">
                  <strong>{pane.id}</strong>
                  <span>
                    visible selected:{pane.id === selectedPaneId ? 'yes' : 'no'} dragging:
                    {pane.id === draggingPaneId ? 'yes' : 'no'} locked:{pane.locked ? 'yes' : 'no'} status:{pane.status}
                  </span>
                  <span>
                    x:{pane.bounds.x} y:{pane.bounds.y} w:{pane.bounds.width} h:{pane.bounds.height} z:{pane.zIndex}
                  </span>
                </div>
              ) : null}
              <div className="gem-shadow" aria-hidden="true" />
              <div className="gemstone-frame">
                <div className="facet-grid" aria-hidden="true" />
                <div className="edge-rim" aria-hidden="true" />
                <div className="gem-content-safe">
                  <header
                    className="gem-chrome"
                    onPointerDown={(event) => beginInteraction(event, pane, 'drag')}
                  >
                    <div>
                      <strong>{pane.title}</strong>
                      <span className="pane-command-subtitle">{profile ? formatCommand(profile) : 'No profile'}</span>
                    </div>
                    <div className="pane-chip-row">
                      <span
                        aria-label={formatStatus(pane.status)}
                        className={`status-dot status-dot-${getStatusTone(pane)}`}
                        title={formatStatus(pane.status)}
                      />
                      {attentionStatus ? <span className="status-chip attention-chip">{attentionStatus}</span> : null}
                      {pane.locked ? (
                        <span className="pane-lock-indicator" aria-label="Pane locked" title="Pane locked">
                          🔒
                        </span>
                      ) : null}
                    </div>
                  </header>
                  <div className="terminal-core">
                    {pane.ptyId ? (
                      <TerminalPane ptyId={pane.ptyId} />
                    ) : shouldShowBlankPaneProfilePrompt(pane) ? (
                      <div className="terminal-empty blank-pane-prompt">
                        <strong>Blank pane</strong>
                        <button
                          data-pane-control="true"
                          type="button"
                          onPointerDown={(event) => stopPaneControlPointerDown(event, pane.id)}
                          onClick={() => openProfileChooser(pane.id)}
                        >
                          Choose profile
                        </button>
                      </div>
                    ) : (
                      <div className={`terminal-empty ${pane.status === 'assigned' ? 'stopped-pane-prompt' : ''}`}>
                        <strong>{getPaneBodyTitle(pane)}</strong>
                        {pane.errorMessage ? <pre>{pane.errorMessage}</pre> : <span>{formatCommand(profile)}</span>}
                        {pane.profileId ? (
                          <button
                            data-pane-control="true"
                            type="button"
                            onPointerDown={(event) => stopPaneControlPointerDown(event, pane.id)}
                            onClick={() => void startPane(pane.id)}
                          >
                            Play
                          </button>
                        ) : null}
                        {shouldShowSetupAction(pane, profile, availabilityByProfileId[pane.profileId ?? '']) ? (
                          <button
                            data-pane-control="true"
                            type="button"
                            onPointerDown={(event) => stopPaneControlPointerDown(event, pane.id)}
                            onClick={() => void startProfileSetup(pane.id, pane.profileId)}
                          >
                            Install / setup
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div
                    className="pane-icon-controls"
                    aria-label={`${pane.title} pane controls`}
                    data-pane-control="true"
                    onPointerDown={(event) => stopPaneControlPointerDown(event, pane.id)}
                  >
                    <button
                      aria-label={primarySessionLabel}
                      className="pane-icon-button primary-session-button"
                      data-pane-control="true"
                      title={primarySessionLabel}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (iconRules.primary === 'stop') {
                          stopPane(pane.id)
                          return
                        }

                        if (!pane.profileId) {
                          openProfileChooser(pane.id)
                          return
                        }

                        void startPane(pane.id)
                      }}
                    >
                      {iconRules.primary === 'stop' ? '■' : '▶'}
                    </button>
                    {iconRules.showRestart ? (
                      <button
                        aria-label={`Restart ${pane.title}`}
                        className="pane-icon-button"
                        data-pane-control="true"
                        title={`Restart ${pane.title}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void restartPane(pane.id)
                        }}
                      >
                        ↻
                      </button>
                    ) : null}
                    {pane.ptyId ? (
                      <button
                        aria-label={`Detach ${pane.title}`}
                        className="pane-icon-button"
                        data-pane-control="true"
                        title={`Detach ${pane.title}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void detachPane(pane.id)
                        }}
                      >
                        ⧉
                      </button>
                    ) : null}
                    <button
                      aria-label={iconRules.lock === 'locked' ? `Unlock ${pane.title}` : `Lock ${pane.title}`}
                      className="pane-icon-button"
                      data-pane-control="true"
                      title={iconRules.lock === 'locked' ? `Unlock ${pane.title}` : `Lock ${pane.title}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        togglePaneLock(pane.id)
                      }}
                    >
                      {iconRules.lock === 'locked' ? '🔒' : '🔓'}
                    </button>
                    <button
                      aria-label={`Open ${pane.title} menu`}
                      className="pane-icon-button"
                      data-pane-control="true"
                      title={`Open ${pane.title} menu`}
                      type="button"
                      onClick={(event) => openPaneMenu(event, pane)}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              </div>
              {RESIZE_HANDLES.map((handle) => (
                <button
                  aria-label={`Resize ${pane.title} ${handle}`}
                  className={`resize-handle resize-${handle}`}
                  disabled={isGeometryLocked || pane.maximized}
                  key={handle}
                  type="button"
                  onPointerDown={(event) => beginInteraction(event, pane, handle)}
                />
              ))}
            </article>
          )
        })}
      </section>

      {isDisplayStyleExpanded ? (
        <div className="display-style-selector" aria-label="Pane style selector">
          <div className="display-style-selector-expanded">
            <div className="display-style-copy">
              <strong>Pane style</strong>
              <span>Applies to all panes. Per-pane style remains in each pane menu and inspector.</span>
            </div>
            <div className="treatment-switch" role="group" aria-label="Pane style choices">
              {TREATMENTS.map((treatment) => (
                <button
                  className={workspaceTreatment === treatment ? 'selected' : ''}
                  key={treatment}
                  type="button"
                  onClick={() => setAllTreatments(treatment)}
                >
                  {formatTreatment(treatment)}
                </button>
              ))}
            </div>
            <button
              aria-label="Collapse pane style selector"
              className="display-style-collapse"
              title="Collapse pane style selector"
              type="button"
              onClick={() => setIsDisplayStyleExpanded(false)}
            >
              Collapse
            </button>
          </div>
        </div>
      ) : null}

      <div className="floating-command-crystal">
        <button className="command-add-pane" type="button" onClick={() => openProfileChooser()}>
          + Pane
        </button>
        <button
          aria-label="Background"
          className="command-icon-button command-background-button"
          title={`Background: ${formatBackground(workspaceBackground)}`}
          type="button"
          onClick={() => {
            setIsCommandMenuOpen(false)
            setIsBackgroundSelectorExpanded((current) => !current)
          }}
        >
          <span aria-hidden="true" />
        </button>
        {!isDisplayStyleExpanded ? (
          <button
            aria-label="Reopen pane style selector"
            className="command-icon-button command-pane-style-button"
            title="Open pane style selector"
            type="button"
            onClick={() => {
              setIsCommandMenuOpen(false)
              setIsDisplayStyleExpanded(true)
            }}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        <button
          aria-label="Open command crystal"
          className="command-crystal"
          type="button"
          onClick={() => {
            setIsProfileChooserOpen(false)
            setIsCommandMenuOpen((current) => !current)
          }}
        >
          <span />
        </button>
      </div>
      {isCommandMenuOpen ? (
        <div className="command-menu">
          <button type="button" onClick={() => openProfileChooser()}>
            + Pane
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCommandMenuOpen(false)
              setIsBackgroundSelectorExpanded(true)
            }}
          >
            Background
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCommandMenuOpen(false)
              setIsDisplayStyleExpanded(true)
            }}
          >
            Pane style
          </button>
          <button type="button" onClick={startAll}>
            Start all
          </button>
          <button type="button" onClick={saveCurrentLayout}>
            Save layout
          </button>
          <button type="button" onClick={resetToDefaultLayout}>
            Reset default
          </button>
          <button type="button" onClick={() => setGlobalLocked((current) => !current)}>
            {globalLocked ? 'Unlock all' : 'Lock all'}
          </button>
          <button type="button" onClick={resetArrangement}>
            Reset visible
          </button>
          <button type="button" onClick={bringAllPanesOnscreen}>
            Bring onscreen
          </button>
          <button type="button" onClick={unlockAllPanes}>
            Unlock panes
          </button>
          <button type="button" onClick={stopAllSessions}>
            Stop sessions
          </button>
          <button type="button" onClick={clearStoppedPanes}>
            Clear stopped
          </button>
          <button type="button" onClick={() => setIsInspectorOpen(true)}>
            Inspector
          </button>
          {hiddenPaneCount > 0 ? (
            <button type="button" onClick={showHiddenPanes}>
              Show hidden ({hiddenPaneCount})
            </button>
          ) : null}
        </div>
      ) : null}
      {isBackgroundSelectorExpanded ? (
        <section className="background-popover" aria-label="Background selector">
          <header>
            <strong>Background</strong>
            <button
              aria-label="Collapse background selector"
              type="button"
              onClick={() => setIsBackgroundSelectorExpanded(false)}
            >
              Close
            </button>
          </header>
          <div className="background-preset-grid" role="group" aria-label="Background choices">
            {DAILY_GEMSTONE_BACKGROUND_REGISTRY.map(renderBackgroundChoice)}
          </div>
          {renderReferenceBackgroundSection()}
        </section>
      ) : null}

      {paneMenu && menuPane && menuModel ? (
        <div
          aria-label={`${menuPane.title} pane actions`}
          className="pane-action-menu"
          onKeyDown={handlePaneMenuKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
          ref={paneMenuRef}
          role="menu"
          style={{ left: paneMenu.left, top: paneMenu.top }}
        >
          <section>
            <h2>Session</h2>
            {renderPaneMenuAction(getMenuAction(menuModel, 'start'), () => {
              setPaneMenu(null)
              void startPane(menuPane.id)
            })}
            {renderPaneMenuAction(getMenuAction(menuModel, 'stop'), () => {
              setPaneMenu(null)
              stopPane(menuPane.id)
            })}
            {renderPaneMenuAction(getMenuAction(menuModel, 'restart'), () => {
              setPaneMenu(null)
              void restartPane(menuPane.id)
            })}
          </section>
          <section>
            <h2>Pane state</h2>
            {renderPaneMenuAction(getMenuAction(menuModel, 'toggle-lock'), () => togglePaneLock(menuPane.id))}
            {renderPaneMenuAction(getMenuAction(menuModel, 'toggle-maximized'), () => {
              setPaneMenu(null)
              togglePaneMaximized(menuPane.id)
            })}
            {renderPaneMenuAction(getMenuAction(menuModel, 'bring-to-front'), () => bringPaneToFront(menuPane.id))}
          </section>
          <section>
            <h2>Profile and appearance</h2>
            {renderPaneMenuAction(getMenuAction(menuModel, 'assign-profile'), () => openProfileChooser(menuPane.id))}
            <div className="pane-menu-group" role="group" aria-label="Change material">
              <span>Change material</span>
              <div className="material-swatch-grid">
                {MATERIALS.map((material) => (
                  <button
                    aria-label={`Set material to ${formatMaterial(material)}`}
                    className={`material-swatch material-swatch-${material} ${
                      menuPane.material === material ? 'selected' : ''
                    }`}
                    key={material}
                    title={formatMaterial(material)}
                    type="button"
                    onClick={() => setPaneMaterial(menuPane.id, material)}
                  >
                    <span>{formatMaterial(material)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pane-menu-group" role="group" aria-label="Change treatment">
              <span>Change treatment</span>
              <div className="segmented-menu-row">
                {TREATMENTS.map((treatment) => (
                  <button
                    className={menuPane.treatment === treatment ? 'selected' : ''}
                    key={treatment}
                    type="button"
                    onClick={() => setPaneTreatment(menuPane.id, treatment)}
                  >
                    {formatTreatment(treatment)}
                  </button>
                ))}
              </div>
            </div>
            {renderPaneMenuAction(getMenuAction(menuModel, 'flip-gemstone'), () => flipPaneGemstone(menuPane.id))}
            <div className="pane-menu-group" role="group" aria-label="Select facet orientation">
              <span>Select facet orientation</span>
              <div className="segmented-menu-row">
                {FACET_ORIENTATIONS.map((orientation) => (
                  <button
                    className={menuPane.facetOrientation === orientation ? 'selected' : ''}
                    key={orientation}
                    type="button"
                    onClick={() => setPaneFacetOrientation(menuPane.id, orientation)}
                  >
                    {formatFacetOrientation(orientation)}
                  </button>
                ))}
              </div>
            </div>
            {renderPaneMenuAction(getMenuAction(menuModel, 'open-inspector'), () => {
              setSelectedPaneId(menuPane.id)
              setIsInspectorOpen(true)
              setPaneMenu(null)
            })}
          </section>
          <section>
            <h2>Pane management</h2>
            {renderPaneMenuAction(getMenuAction(menuModel, 'hide-pane'), () => hidePane(menuPane.id))}
            {renderPaneMenuAction(getMenuAction(menuModel, 'remove-pane'), () => removePane(menuPane.id))}
          </section>
        </div>
      ) : null}

      {isProfileChooserOpen ? (
        <div className="profile-chooser" role="dialog" aria-label="Choose pane profile">
          <header>
            <strong>{profileChooserMode.kind === 'assign' ? 'Choose profile' : 'New pane'}</strong>
            <button type="button" onClick={() => setIsProfileChooserOpen(false)}>
              Close
            </button>
          </header>
          <div className="new-pane-form">
            <label>
              <span>Profile</span>
              <select
                value={newPaneDraft.profileId}
                onChange={(event) =>
                  updateNewPaneDraft((draft) => ({ ...draft, profileId: event.target.value }))
                }
              >
                <option value="">Blank</option>
                {newPaneProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {getProfileOptionLabel(profile, availabilityByProfileId[profile.id])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Material</span>
              <select
                value={newPaneDraft.material}
                onChange={(event) =>
                  updateNewPaneDraft((draft) => ({ ...draft, material: event.target.value as GemMaterial }))
                }
              >
                {MATERIALS.map((material) => (
                  <option key={material} value={material}>
                    {formatMaterial(material)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Treatment</span>
              <select
                value={newPaneDraft.treatment}
                onChange={(event) =>
                  updateNewPaneDraft((draft) => ({ ...draft, treatment: event.target.value as GemTreatment }))
                }
              >
                {TREATMENTS.map((treatment) => (
                  <option key={treatment} value={treatment}>
                    {formatTreatment(treatment)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Facet orientation</span>
              <select
                value={newPaneDraft.facetOrientation}
                onChange={(event) =>
                  updateNewPaneDraft((draft) => ({
                    ...draft,
                    facetOrientation: event.target.value as FacetOrientation
                  }))
                }
              >
                {FACET_ORIENTATIONS.map((orientation) => (
                  <option key={orientation} value={orientation}>
                    {formatFacetOrientation(orientation)}
                  </option>
                ))}
              </select>
            </label>
            <button className="create-pane-button" type="button" onClick={submitProfileChooser}>
              {profileChooserMode.kind === 'assign' ? 'Apply to pane' : 'Create pane'}
            </button>
          </div>
        </div>
      ) : null}

      <aside className={`gem-inspector ${isInspectorOpen ? 'open' : ''}`} aria-hidden={!isInspectorOpen}>
        <button className="close-inspector" type="button" onClick={() => setIsInspectorOpen(false)}>
          Close
        </button>
        <button className="inspector-add-pane" type="button" onClick={() => openProfileChooser()}>
          + Pane
        </button>
        <section className="background-selector" aria-label="Background selector">
          {isBackgroundSelectorExpanded ? (
            <>
              <header>
                <strong>Background</strong>
                <button
                  aria-label="Collapse background selector"
                  type="button"
                  onClick={() => setIsBackgroundSelectorExpanded(false)}
                >
                  Collapse
                </button>
              </header>
              <div className="background-preset-grid" role="group" aria-label="Background choices">
                {DAILY_GEMSTONE_BACKGROUND_REGISTRY.map(renderBackgroundChoice)}
              </div>
              {renderReferenceBackgroundSection()}
            </>
          ) : (
            <button
              aria-label="Reopen background selector"
              className="background-compact"
              title={`Background: ${formatBackground(workspaceBackground)}`}
              type="button"
              onClick={() => setIsBackgroundSelectorExpanded(true)}
            >
              <span>Background:</span>
              <strong>{formatBackground(workspaceBackground)}</strong>
            </button>
          )}
        </section>
        <section className="inspector-section saved-layouts-section" aria-label="Saved gemstone layouts">
          <header>
            <strong>Saved layouts</strong>
            <button type="button" onClick={saveCurrentLayout}>
              Save
            </button>
          </header>
          {savedLayouts.length > 0 ? (
            <div className="saved-layout-list">
              {savedLayouts.map((layout) => (
                <div className="saved-layout-row" key={layout.id}>
                  <div>
                    <strong>{layout.name}</strong>
                    <span>{layout.id === activeSavedLayoutId ? 'Active layout' : 'Saved layout'}</span>
                  </div>
                  <div className="saved-layout-actions">
                    <button type="button" onClick={() => loadSavedLayout(layout.id)}>
                      Load
                    </button>
                    <button type="button" onClick={() => renameSavedLayout(layout)}>
                      Rename
                    </button>
                    <button type="button" onClick={() => duplicateSavedLayout(layout)}>
                      Copy
                    </button>
                    <button type="button" onClick={() => deleteSavedLayout(layout)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="inspector-note">No saved gemstone layouts yet.</p>
          )}
          <button type="button" onClick={resetToDefaultLayout}>
            Reset default layout
          </button>
        </section>
        <section className="inspector-section recovery-section" aria-label="Gemstone recovery actions">
          <header>
            <strong>Recovery</strong>
          </header>
          <div className="recovery-action-grid">
            <button type="button" onClick={resetArrangement}>
              Reset visible arrangement
            </button>
            <button type="button" onClick={bringAllPanesOnscreen}>
              Bring all panes onscreen
            </button>
            <button type="button" onClick={unlockAllPanes}>
              Unlock all panes
            </button>
            <button type="button" onClick={stopAllSessions}>
              Stop all sessions
            </button>
            <button type="button" onClick={clearStoppedPanes}>
              Clear stopped panes
            </button>
          </div>
        </section>
        {selectedPane ? (
          <>
            <h1>{selectedPane.title}</h1>
            <p className="inspector-pane-id">Editing pane {selectedPane.id}</p>
            <label>
              <span>Profile</span>
              <select
                value={selectedPane.profileId ?? ''}
                onChange={(event) => setPaneProfile(selectedPane.id, event.target.value || null)}
              >
                <option value="">Blank</option>
                {inspectorProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {getProfileOptionLabel(profile, availabilityByProfileId[profile.id])}
                  </option>
                ))}
              </select>
              {isSelectedPaneProfileLocked ? (
                <small>Changing this active pane's profile requires confirmation and stops the current session.</small>
              ) : null}
            </label>
            <button type="button" onClick={() => openProfileChooser(selectedPane.id)}>
              Choose profile...
            </button>
            <label>
              <span>Material</span>
              <select
                value={selectedPane.material}
                onChange={(event) => setPaneMaterial(selectedPane.id, event.target.value as GemMaterial)}
              >
                {MATERIALS.map((material) => (
                  <option key={material} value={material}>
                    {formatMaterial(material)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Treatment</span>
              <select
                value={selectedPane.treatment}
                onChange={(event) => setPaneTreatment(selectedPane.id, event.target.value as GemTreatment)}
              >
                {TREATMENTS.map((treatment) => (
                  <option key={treatment} value={treatment}>
                    {formatTreatment(treatment)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Facet orientation</span>
              <select
                value={selectedPane.facetOrientation}
                onChange={(event) =>
                  setPaneFacetOrientation(selectedPane.id, event.target.value as FacetOrientation)
                }
              >
                {FACET_ORIENTATIONS.map((orientation) => (
                  <option key={orientation} value={orientation}>
                    {formatFacetOrientation(orientation)}
                  </option>
                ))}
              </select>
            </label>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{formatStatus(selectedPane.status)}</dd>
              </div>
              <div>
                <dt>Bounds</dt>
                <dd>
                  {selectedPane.bounds.x}, {selectedPane.bounds.y}, {selectedPane.bounds.width} x{' '}
                  {selectedPane.bounds.height}
                </dd>
              </div>
              <div>
                <dt>Lock state</dt>
                <dd>{selectedPane.locked ? 'Locked' : 'Unlocked'}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </aside>
    </main>
  )
}

function getStatusTone(pane: GemPaneState): 'green' | 'gray' | 'amber' | 'red' {
  if (pane.status === 'running') {
    return 'green'
  }

  if (pane.status === 'starting') {
    return 'amber'
  }

  if (pane.status === 'error') {
    return 'red'
  }

  return 'gray'
}

function getPaneAttentionStatus(pane: GemPaneState): string | null {
  if (pane.status === 'starting') {
    return 'Starting...'
  }

  if (pane.status !== 'error') {
    return null
  }

  if (pane.errorMessage?.includes('Command not found') || pane.errorMessage?.includes('not found')) {
    return 'CLI missing'
  }

  if (pane.errorMessage?.includes('Exited unexpectedly')) {
    return 'Exited unexpectedly'
  }

  return 'Failed'
}

function getNewPaneProfiles(
  profiles: CommandProfile[],
  availabilityByProfileId: Record<string, CommandAvailabilityResult>
): CommandProfile[] {
  return profiles.filter(
    (profile) =>
      !profile.setup ||
      profile.builtIn === true ||
      availabilityByProfileId[profile.id]?.state === 'installed'
  )
}

function getInspectorProfiles(
  assignableProfiles: readonly CommandProfile[],
  allProfiles: readonly CommandProfile[],
  selectedProfileId: string | null
): CommandProfile[] {
  const profiles = [...assignableProfiles]

  if (!selectedProfileId || profiles.some((profile) => profile.id === selectedProfileId)) {
    return profiles
  }

  const selectedProfile = allProfiles.find((profile) => profile.id === selectedProfileId)

  return selectedProfile ? [selectedProfile, ...profiles] : profiles
}

function getNextVisiblePaneId(panes: readonly GemPaneState[], excludedPaneId: string): string {
  return panes.find((pane) => pane.id !== excludedPaneId && !pane.hidden)?.id ?? ''
}

function getWorkspaceTreatment(panes: readonly GemPaneState[]): GemTreatment | 'mixed' {
  const firstTreatment = panes[0]?.treatment

  if (!firstTreatment) {
    return DEFAULT_NEW_PANE_DRAFT.treatment
  }

  return panes.every((pane) => pane.treatment === firstTreatment) ? firstTreatment : 'mixed'
}

function isPaneControlTarget(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[data-pane-control="true"]') !== null
}

function getInitialGemstoneDiagnosticFlag(): boolean {
  return getBooleanSearchParam('gemDiagnostics') || getBooleanSearchParam('gemstoneDiagnostics')
}

function getInitialPaneEffectsDisabledFlag(): boolean {
  return getBooleanSearchParam('gemNoEffects') || getBooleanSearchParam('gemstoneNoEffects')
}

function getBooleanSearchParam(name: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const value = new URLSearchParams(window.location.search).get(name)
  return value === '' || value === '1' || value === 'true'
}

function isDiagnosticShortcut(event: KeyboardEvent, key: string): boolean {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key.toLowerCase() === key
  )
}

function createPaneId(existingPanes: GemPaneState[]): string {
  let index = existingPanes.length + 1
  let paneId = `gem-pane-${index}`
  const existingIds = new Set(existingPanes.map((pane) => pane.id))

  while (existingIds.has(paneId)) {
    index += 1
    paneId = `gem-pane-${index}`
  }

  return paneId
}

function createNewPane(
  id: string,
  profileId: string | null,
  draft: Pick<NewPaneDraft, 'material' | 'treatment' | 'facetOrientation'>,
  existingPanes: GemPaneState[],
  canvasSize: CanvasSize,
  profileById: Map<string, CommandProfile>
): GemPaneState {
  const frontPane = [...existingPanes].sort((a, b) => b.zIndex - a.zIndex)[0]
  const fallbackWidth = Math.min(600, Math.max(360, Math.round(canvasSize.width * 0.44)))
  const fallbackHeight = Math.min(420, Math.max(270, Math.round(canvasSize.height * 0.44)))
  const offset = 30 + (existingPanes.length % 5) * 18
  const bounds = clampPaneBounds(
    {
      x: (frontPane?.bounds.x ?? Math.round(canvasSize.width * 0.12)) + offset,
      y: (frontPane?.bounds.y ?? Math.round(canvasSize.height * 0.16)) + offset,
      width: frontPane ? Math.min(frontPane.bounds.width, fallbackWidth) : fallbackWidth,
      height: frontPane ? Math.min(frontPane.bounds.height, fallbackHeight) : fallbackHeight
    },
    canvasSize
  )
  const selectedProfile = profileId ? profileById.get(profileId) : undefined

  return {
    id,
    title: selectedProfile?.name ?? getProfileTitle(profileId),
    profileId,
    material: draft.material,
    treatment: draft.treatment,
    facetOrientation: draft.facetOrientation,
    bounds,
    zIndex: Math.max(0, ...existingPanes.map((pane) => pane.zIndex)) + 1,
    locked: false,
    maximized: false,
    status: profileId ? 'assigned' : 'blank',
    ptyId: null
  }
}

function createInitialPanes(canvasSize: CanvasSize): GemPaneState[] {
  const bounds = createInitialPaneBounds(canvasSize)

  return [
    {
      id: 'gem-shell',
      title: 'Generic Shell',
      profileId: 'builtin.shell',
      material: 'diamond',
      treatment: 'sharp',
      facetOrientation: 'right',
      bounds: bounds[0],
      zIndex: 1,
      locked: false,
      maximized: false,
      status: 'assigned',
      ptyId: null
    },
    {
      id: 'gem-droid',
      title: 'Droid',
      profileId: 'builtin.droid',
      material: 'amethyst',
      treatment: 'sharp',
      facetOrientation: 'left',
      bounds: bounds[1],
      zIndex: 2,
      locked: false,
      maximized: false,
      status: 'assigned',
      ptyId: null
    },
    {
      id: 'gem-agent',
      title: 'Codex CLI',
      profileId: 'builtin.codex',
      material: 'onyx',
      treatment: 'sharp',
      facetOrientation: 'symmetric',
      bounds: bounds[2],
      zIndex: 3,
      locked: false,
      maximized: false,
      status: 'assigned',
      ptyId: null
    }
  ]
}

function createInitialPaneBounds(canvasSize: CanvasSize): PixelBounds[] {
  const width = canvasSize.width
  const height = canvasSize.height

  return [
    clampPaneBounds(
      {
        x: Math.round(width * 0.05),
        y: Math.round(height * 0.1),
        width: Math.round(width * 0.48),
        height: Math.round(height * 0.58)
      },
      canvasSize
    ),
    clampPaneBounds(
      {
        x: Math.round(width * 0.38),
        y: Math.round(height * 0.18),
        width: Math.round(width * 0.5),
        height: Math.round(height * 0.52)
      },
      canvasSize
    ),
    clampPaneBounds(
      {
        x: Math.round(width * 0.18),
        y: Math.round(height * 0.5),
        width: Math.round(width * 0.46),
        height: Math.round(height * 0.38)
      },
      canvasSize
    )
  ]
}

function getMaximizedBounds(canvasSize: CanvasSize): PixelBounds {
  return clampPaneBounds(
    {
      x: 34,
      y: 78,
      width: canvasSize.width - 68,
      height: canvasSize.height - 124
    },
    canvasSize
  )
}

function getPaneAfterExit(pane: GemPaneState, event: TerminalExitEvent): GemPaneState {
  if (pane.ptyId !== event.ptyId) {
    return pane
  }

  return {
    ...pane,
    status: event.exitCode === 0 ? (pane.profileId ? 'assigned' : 'blank') : 'error',
    ptyId: null,
    launchedProfileId: undefined,
    errorMessage: event.exitCode === 0 ? undefined : `Exited unexpectedly with code ${event.exitCode}.`
  }
}

function findInstalledAgentProfile(availabilityByProfileId: Record<string, CommandAvailabilityResult>): string | null {
  for (const profileId of [
    'builtin.codex',
    'builtin.claude',
    'builtin.droid',
    'builtin.opencode',
    'builtin.reasonix',
    'builtin.pi',
    'builtin.hermes',
    'builtin.openclaw'
  ]) {
    if (availabilityByProfileId[profileId]?.state === 'installed') {
      return profileId
    }
  }

  return null
}

function getProfileTitle(profileId: string | null): string {
  if (!profileId) {
    return 'Blank Pane'
  }

  return BUILT_IN_PROFILES.find((profile) => profile.id === profileId)?.name ?? 'Custom Profile'
}

function formatStatus(status: PaneStatus): string {
  if (status === 'blank') {
    return 'Blank'
  }

  if (status === 'assigned') {
    return 'Ready'
  }

  if (status === 'starting') {
    return 'Starting...'
  }

  if (status === 'running') {
    return 'Running'
  }

  return 'Error'
}

function getPaneBodyTitle(pane: GemPaneState): string {
  if (pane.status === 'error') {
    return 'Launch failed'
  }

  if (pane.status === 'assigned') {
    return 'Stopped'
  }

  return 'Ready'
}

function shouldShowSetupAction(
  pane: GemPaneState,
  profile: CommandProfile | undefined,
  availability: CommandAvailabilityResult | undefined
): boolean {
  return (
    pane.status === 'error' &&
    Boolean(profile?.setup) &&
    availability?.state !== 'installed' &&
    pane.errorMessage?.includes('not installed') === true
  )
}

function formatMissingProfileSetupMessage(
  profile: CommandProfile,
  availability: CommandAvailabilityResult | null
): string {
  const executable = profile.setup?.executableName ?? profile.command
  const platform = availability?.platform ? ` on ${availability.platform}` : ''

  return `${profile.name} is not installed or is not on PATH${platform}. Expected executable: ${executable}. Use Install / setup or choose another installed profile.`
}

function formatCommand(profile?: CommandProfile): string {
  if (!profile) {
    return 'Choose a profile'
  }

  return [profile.command || 'Default shell', ...profile.args].filter(Boolean).join(' ')
}

function getProfileOptionLabel(profile: CommandProfile, availability?: CommandAvailabilityResult): string {
  if (!profile.setup) {
    return profile.name
  }

  return `${profile.name} (${availability?.state ?? 'checking'})`
}

function formatMaterial(material: GemMaterial): string {
  return material.charAt(0).toUpperCase() + material.slice(1)
}

function formatTreatment(treatment: GemTreatment): string {
  if (treatment === 'sharp') {
    return 'Sharp slabs'
  }

  if (treatment === 'polished') {
    return 'Polished windows'
  }

  return 'Architectural panes'
}

function formatFacetOrientation(orientation: FacetOrientation): string {
  if (orientation === 'left') {
    return 'Left'
  }

  if (orientation === 'symmetric') {
    return 'Symmetric'
  }

  return 'Right'
}

function formatBackground(background: GemstoneBackground): string {
  if (background === 'original-grid') {
    return 'Original Grid'
  }

  return getGemstoneBackgroundDefinition(background).name
}

function formatBackgroundSuitability(suitability: (typeof GEMSTONE_BACKGROUND_REGISTRY)[number]['suitability']): string {
  if (suitability === 'light') {
    return 'Light'
  }

  if (suitability === 'dark') {
    return 'Dark'
  }

  return 'Light / Dark'
}

function getPrefersDarkWorkspace(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

function isTerminalKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.terminal-surface, .xterm') !== null
}

function createSavedLayoutId(): string {
  return `gem-layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getNowIso(): string {
  return new Date().toISOString()
}

function getStorageApi(): StorageApi {
  return window.storageApi ?? {
    async load() {
      return DEFAULT_PERSISTED_STATE
    },
    async save() {
      return undefined
    }
  }
}
