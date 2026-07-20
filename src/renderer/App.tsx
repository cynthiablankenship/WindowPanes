import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle
} from 'react-resizable-panels'
import {
  DEFAULT_PERSISTED_STATE,
  GLASS_THEMES,
  MANUAL_INSTALL_MESSAGE,
  PRESET_PANE_COUNT,
  getGlassMaterialColorMode,
  migrateGlassMaterialPreference,
  resolveGlassMaterialPreference,
  createSetupConfirmationDetails,
  formatInstallPlatform,
  getInstallCommandForPlatform,
  getSetupInstallActionState,
  isSetupManagedBuiltInProfile,
  type CommandAvailabilityResult,
  type CommandAvailabilityState,
  type CommandProfile,
  type GlassMaterialPreference,
  type GemThemeId,
  type InstallCommandMetadata,
  type LayoutPreset,
  type LayoutProfile,
  type PaneBounds,
  type PaneRuntime,
  type PersistedState,
  type StorageApi
} from '../shared'
import {
  createEmptyCommandProfileDraft,
  createCustomCommandProfile,
  deleteCustomCommandProfile,
  findCommandProfile,
  getAvailableCommandProfiles,
  isCommandPathLikeProfileName,
  type CommandProfileDraft
} from './domain/commandProfiles'
import {
  LAYOUT_PRESET_LABELS,
  applyCanvasPaneSnap,
  applyLayoutPreset,
  assignProfileToPane,
  copyActiveLayoutProfile,
  createDefaultLayoutProfile,
  createPaneRuntimes,
  getLayoutRenameError,
  getLayoutSplitSizes,
  getCanvasSnapResult,
  makePaneSessionKey,
  markExitedPaneSession,
  normalizeLayoutProfile,
  removeProfileAssignments,
  renameLayoutProfile,
  bringPaneToFront,
  moveCanvasPane,
  repairCanvasLayoutBounds,
  resetCanvasArrangement,
  resizeCanvasPane,
  setLayoutGlassMaterial,
  setLayoutWorkspaceMode,
  setAllCanvasPanesLocked,
  setPaneLocked,
  setPaneVisibility,
  tileCanvasPanes,
  toggleCanvasPaneMaximized,
  updateLayoutSplitSizes,
  updateLayoutSizes,
  type CanvasResizeHandle,
  type CanvasSnapGuide,
  type LayoutSplitAxis,
  type PaneRuntimeSessionsByKey
} from './domain/layoutProfiles'
import { hydratePersistedState, saveWorkspaceState, type WorkspaceState } from './domain/persistence'
import { TerminalPane } from './components/TerminalPane'

const PRESETS = Object.keys(PRESET_PANE_COUNT) as LayoutPreset[]
const MIN_PANE_SIZE_PERCENT = 15
const APP_VERSION = '0.2.1'

const fallbackStorage = createMemoryStorage()

type SetupProfileState = CommandAvailabilityState

interface SetupProfileStatus {
  state: SetupProfileState
  availability?: CommandAvailabilityResult
  message?: string
  output?: string
}

interface InstallingSession {
  profileId: string
}

interface PendingInstallConfirmation {
  layoutId: string
  paneId: string
  profile: CommandProfile
  platform: string
  installCommand: InstallCommandMetadata
}

type PendingDeleteConfirmation =
  | {
      kind: 'layout'
      layoutId: string
      layoutName: string
    }
  | {
      kind: 'profile'
      profileId: string
      profileName: string
    }
  | {
      kind: 'custom-profiles'
    }

export function App(): JSX.Element | null {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    hydratePersistedState(DEFAULT_PERSISTED_STATE)
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark())
  const [runningSessionsByPaneKey, setRunningSessionsByPaneKey] = useState<PaneRuntimeSessionsByKey>({})
  const layoutProfilesRef = useRef(workspace.layoutProfiles)
  const [isHydrated, setIsHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Not saved')
  const [profileDraft, setProfileDraft] = useState<CommandProfileDraft>(() => createEmptyCommandProfileDraft())
  const [envText, setEnvText] = useState('')
  const [profileFormError, setProfileFormError] = useState('')
  const [layoutNameDraft, setLayoutNameDraft] = useState('')
  const [layoutFormError, setLayoutFormError] = useState('')
  const [allowPathLikeProfileName, setAllowPathLikeProfileName] = useState(false)
  const [setupStatusesByProfileId, setSetupStatusesByProfileId] = useState<Record<string, SetupProfileStatus>>({})
  const [installingSessionsByPtyId, setInstallingSessionsByPtyId] = useState<Record<string, InstallingSession>>({})
  const [pendingInstallConfirmation, setPendingInstallConfirmation] =
    useState<PendingInstallConfirmation | null>(null)
  const [pendingDeleteConfirmation, setPendingDeleteConfirmation] =
    useState<PendingDeleteConfirmation | null>(null)
  const columnPanelGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const secondaryColumnPanelGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const rowPanelGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const activeLayoutRef = useRef<LayoutProfile | null>(null)
  const availableProfilesRef = useRef<CommandProfile[]>([])
  const installingSessionsRef = useRef(installingSessionsByPtyId)
  const [canvasSnapGuides, setCanvasSnapGuides] = useState<CanvasSnapGuide[]>([])

  const storageApi = getStorageApi()
  const activeLayout = useMemo(
    () =>
      workspace.layoutProfiles.find((layout) => layout.id === workspace.activeLayoutId) ??
      workspace.layoutProfiles[0],
    [workspace]
  )
  const availableProfiles = useMemo(
    () => getAvailableCommandProfiles(workspace.commandProfiles),
    [workspace.commandProfiles]
  )
  const builtInProfiles = useMemo(
    () => availableProfiles.filter((profile) => profile.builtIn),
    [availableProfiles]
  )
  const customProfiles = useMemo(
    () => availableProfiles.filter((profile) => !profile.builtIn),
    [availableProfiles]
  )
  const paneRuntimes = useMemo(
    () => createPaneRuntimes(activeLayout ?? createDefaultLayoutProfile(), runningSessionsByPaneKey),
    [activeLayout, runningSessionsByPaneKey]
  )
  const paneRuntimesById = useMemo(
    () => new Map(paneRuntimes.map((pane) => [pane.config.id, pane])),
    [paneRuntimes]
  )
  const columnSizes = activeLayout ? getLayoutSplitSizes(activeLayout, 'columns') : []
  const rowSizes = activeLayout ? getLayoutSplitSizes(activeLayout, 'rows') : []
  const activeGlassMaterialPreference = migrateGlassMaterialPreference(
    activeLayout?.glassMaterial ?? workspace.preferences.glassMaterial,
    activeLayout?.glassTheme ?? workspace.preferences.glassTheme
  )
  const resolvedGlassTheme = resolveGlassMaterialPreference(activeGlassMaterialPreference, systemPrefersDark)
  const resolvedColorMode = getGlassMaterialColorMode(resolvedGlassTheme)
  const workspaceMode = activeLayout?.workspaceMode ?? 'docked'
  const hiddenPaneCount = activeLayout?.panes.filter((pane) => pane.placement?.visible === false).length ?? 0
  const allVisibleCanvasPanesLocked =
    workspaceMode === 'canvas' &&
    activeLayout?.panes
      .filter((pane) => pane.placement?.visible !== false)
      .every((pane) => pane.placement?.locked === true) === true

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')

    if (!mediaQuery) {
      return
    }

    const handleChange = (): void => {
      setSystemPrefersDark(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.colorMode = resolvedColorMode
    document.documentElement.dataset.glassTheme = resolvedGlassTheme
  }, [resolvedColorMode, resolvedGlassTheme])

  useEffect(() => {
    layoutProfilesRef.current = workspace.layoutProfiles
  }, [workspace.layoutProfiles])

  useEffect(() => {
    activeLayoutRef.current = activeLayout ?? null
  }, [activeLayout])

  useEffect(() => {
    availableProfilesRef.current = availableProfiles
  }, [availableProfiles])

  useEffect(() => {
    syncPanelGroupLayout(columnPanelGroupRef.current, columnSizes)
    syncPanelGroupLayout(secondaryColumnPanelGroupRef.current, columnSizes)
    syncPanelGroupLayout(rowPanelGroupRef.current, rowSizes)
  }, [activeLayout?.id, activeLayout?.preset, columnSizes, rowSizes])

  useEffect(() => {
    installingSessionsRef.current = installingSessionsByPtyId
  }, [installingSessionsByPtyId])

  useEffect(() => {
    if (!activeLayout) {
      return
    }

    setLayoutNameDraft(activeLayout.name)
    setLayoutFormError('')
  }, [activeLayout?.id, activeLayout?.name])

  useEffect(() => {
    if (!activeLayout || activeLayout.workspaceMode !== 'canvas') {
      return
    }

    updateActiveLayout(repairCanvasLayoutBounds)
  }, [activeLayout?.id, activeLayout?.workspaceMode])

  useEffect(() => {
    return window.terminalApi.onExit((event) => {
      const installingSession = installingSessionsRef.current[event.ptyId]

      if (installingSession) {
        setInstallingSessionsByPtyId((current) => {
          const rest = { ...current }
          delete rest[event.ptyId]
          return rest
        })
        void recheckProfileAfterSetup(installingSession.profileId, event.exitCode)
      }

      setRunningSessionsByPaneKey((current) =>
        markExitedPaneSession(current, layoutProfilesRef.current, event.ptyId)
      )
    })
  }, [])

  useEffect(() => {
    return window.terminalApi.onData((event) => {
      const installingSession = installingSessionsRef.current[event.ptyId]

      if (!installingSession) {
        return
      }

      setSetupStatusesByProfileId((current) => {
        const status = current[installingSession.profileId]
        const output = `${status?.output ?? ''}${event.data}`

        return {
          ...current,
          [installingSession.profileId]: {
            ...status,
            state: status?.state ?? 'installing',
            output: output.slice(-12000)
          }
        }
      })
    })
  }, [])

  useEffect(() => {
    for (const profile of builtInProfiles) {
      if (!isSetupManagedBuiltInProfile(profile)) {
        continue
      }

      const status = setupStatusesByProfileId[profile.id]?.state ?? 'unknown'

      if (status === 'unknown') {
        void checkProfileStatus(profile)
      }
    }
  }, [builtInProfiles, setupStatusesByProfileId])

  useEffect(() => {
    let isMounted = true

    storageApi
      .load()
      .then((state) => {
        if (!isMounted) {
          return
        }

        const hydrated = hydratePersistedState(state)

        setWorkspace(hydrated)
        setSaveStatus('Loaded')
      })
      .catch((error: unknown) => {
        setSaveStatus(error instanceof Error ? error.message : 'Failed to load workspace')
      })
      .finally(() => {
        if (isMounted) {
          setIsHydrated(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [storageApi])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    setSaveStatus('Saving...')
    saveWorkspaceState(storageApi, workspace)
      .then(() => setSaveStatus('Saved'))
      .catch((error: unknown) => {
        setSaveStatus(error instanceof Error ? error.message : 'Failed to save workspace')
      })
  }, [isHydrated, storageApi, workspace])

  function updateActiveLayout(updater: (layout: LayoutProfile) => LayoutProfile): void {
    setWorkspace((current) => {
      const layoutProfiles = current.layoutProfiles.map((layout) =>
        layout.id === current.activeLayoutId ? normalizeLayoutProfile(updater(layout)) : layout
      )

      return {
        ...current,
        layoutProfiles
      }
    })
  }

  function selectLayout(layoutId: string): void {
    setWorkspace((current) => ({ ...current, activeLayoutId: layoutId }))
  }

  function selectGlassMaterial(glassMaterial: GlassMaterialPreference): void {
    setWorkspace((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        glassMaterial,
        theme: undefined,
        glassTheme: undefined
      },
      layoutProfiles: current.layoutProfiles.map((layout) =>
        layout.id === current.activeLayoutId ? setLayoutGlassMaterial(layout, glassMaterial) : layout
      )
    }))
  }

  function selectWorkspaceMode(mode: 'docked' | 'canvas'): void {
    updateActiveLayout((layout) => setLayoutWorkspaceMode(layout, mode))
  }

  function lockAllCanvasPanes(locked: boolean): void {
    updateActiveLayout((layout) => setAllCanvasPanesLocked(layout, locked))
  }

  function showPane(paneId: string): void {
    updateActiveLayout((layout) => setPaneVisibility(layout, paneId, true))
  }

  function hidePane(paneId: string): void {
    updateActiveLayout((layout) => setPaneVisibility(layout, paneId, false))
  }

  function togglePaneLocked(paneId: string, locked: boolean): void {
    updateActiveLayout((layout) => setPaneLocked(layout, paneId, locked))
  }

  function bringPaneForward(paneId: string): void {
    updateActiveLayout((layout) => bringPaneToFront(layout, paneId))
  }

  function togglePaneMaximized(paneId: string): void {
    updateActiveLayout((layout) => toggleCanvasPaneMaximized(layout, paneId))
  }

  function resetCanvas(): void {
    updateActiveLayout(resetCanvasArrangement)
  }

  function tileCanvas(): void {
    updateActiveLayout(tileCanvasPanes)
  }

  function saveLayoutCopy(): void {
    setWorkspace((current) => ({
      ...current,
      ...copyActiveLayoutProfile(current.layoutProfiles, current.activeLayoutId)
    }))
    setLayoutFormError('')
  }

  function submitLayoutRename(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const validationError = getLayoutRenameError(
      workspace.layoutProfiles,
      workspace.activeLayoutId,
      layoutNameDraft
    )

    if (validationError) {
      setLayoutFormError(validationError)
      return
    }

    setWorkspace((current) => ({
      ...current,
      ...renameLayoutProfile(current.layoutProfiles, current.activeLayoutId, layoutNameDraft)
    }))
    setLayoutFormError('')
  }

  function deleteActiveLayout(): void {
    if (workspace.layoutProfiles.length === 1) {
      return
    }

    setPendingDeleteConfirmation({
      kind: 'layout',
      layoutId: activeLayout.id,
      layoutName: activeLayout.name
    })
  }

  function confirmDeleteActiveLayout(layoutId: string): void {
    setWorkspace((current) => {
      if (current.layoutProfiles.length === 1) {
        return current
      }

      const layoutProfiles = current.layoutProfiles.filter((layout) => layout.id !== layoutId)
      const activeLayoutId =
        current.activeLayoutId === layoutId ? layoutProfiles[0]?.id ?? current.activeLayoutId : current.activeLayoutId

      return { ...current, layoutProfiles, activeLayoutId }
    })
  }

  function assignPane(paneId: string, profileId: string): void {
    const nextProfileId = profileId || null
    updateActiveLayout((layout) => assignProfileToPane(layout, paneId, nextProfileId))
  }

  function updatePaneStatus(
    layoutId: string,
    paneId: string,
    status: PaneRuntime['status'],
    ptyId: string | null,
    errorMessage?: string,
    launchedProfileId?: string
  ): void {
    setRunningSessionsByPaneKey((current) => ({
      ...current,
      [makePaneSessionKey(layoutId, paneId)]: { status, ptyId, errorMessage, launchedProfileId }
    }))
  }

  async function checkProfileStatus(profile: CommandProfile): Promise<CommandAvailabilityResult | null> {
    if (!isSetupManagedBuiltInProfile(profile)) {
      return null
    }

    try {
      const availability = await window.terminalApi.checkCommand({ profile })
      setSetupStatusesByProfileId((current) => ({
        ...current,
        [profile.id]: {
          state: availability.state,
          availability,
          message: availability.state === 'installed' ? undefined : current[profile.id]?.message
        }
      }))
      return availability
    } catch (error: unknown) {
      setSetupStatusesByProfileId((current) => ({
        ...current,
        [profile.id]: {
          state: 'unknown',
          message: getErrorMessage(error)
        }
      }))
      return null
    }
  }

  async function recheckProfileAfterSetup(profileId: string, exitCode: number): Promise<void> {
    const profile = findCommandProfile(availableProfilesRef.current, profileId)

    if (!profile) {
      return
    }

    const availability = await checkProfileStatus(profile)

    if (availability?.state === 'installed') {
      return
    }

    setSetupStatusesByProfileId((current) => ({
      ...current,
      [profile.id]: {
        state: 'install-failed',
        availability: availability ?? current[profile.id]?.availability,
        message:
          exitCode === 0
            ? `${profile.name} setup finished, but ${profile.setup?.executableName ?? profile.command} is still not available on PATH.`
            : `${profile.name} setup exited with code ${exitCode}. Output is visible in the setup pane until you close it.`
      }
    }))
  }

  async function startPane(pane: PaneRuntime, options: { launchAnyway?: boolean } = {}): Promise<void> {
    const profile = findCommandProfile(availableProfiles, pane.config.profileId)

    if (!profile || !activeLayout) {
      if (activeLayout) {
        updatePaneStatus(activeLayout.id, pane.config.id, 'error', null)
      }
      return
    }

    if (!options.launchAnyway && isSetupManagedBuiltInProfile(profile)) {
      const currentState = setupStatusesByProfileId[profile.id]?.state ?? 'unknown'
      const availability =
        currentState === 'unknown' || currentState === 'install-failed'
          ? await checkProfileStatus(profile)
          : setupStatusesByProfileId[profile.id]?.availability
      const nextState = availability?.state ?? currentState

      if (nextState !== 'installed') {
        updatePaneStatus(activeLayout.id, pane.config.id, 'assigned', null)
        return
      }
    }

    const layoutId = activeLayout.id

    try {
      const result = await window.terminalApi.spawn({
        paneId: pane.config.id,
        profile,
        cols: 100,
        rows: 30
      })
      updatePaneStatus(layoutId, pane.config.id, 'running', result.ptyId, undefined, profile.id)
    } catch (error: unknown) {
      updatePaneStatus(layoutId, pane.config.id, 'error', null, getErrorMessage(error))
    }
  }

  async function startSetupInPane(pane: PaneRuntime, profile: CommandProfile): Promise<void> {
    if (!activeLayout || !isSetupManagedBuiltInProfile(profile)) {
      return
    }

    const availability =
      setupStatusesByProfileId[profile.id]?.availability ?? (await checkProfileStatus(profile))
    const platform = availability?.platform ?? 'unknown'
    const installCommand = getInstallCommandForPlatform(profile, platform)

    if (!installCommand || installCommand.trust !== 'verified') {
      setSetupStatusesByProfileId((current) => ({
        ...current,
        [profile.id]: {
          ...current[profile.id],
          state: current[profile.id]?.state ?? 'missing',
          message: MANUAL_INSTALL_MESSAGE
        }
      }))
      return
    }

    setPendingInstallConfirmation({
      layoutId: activeLayout.id,
      paneId: pane.config.id,
      profile,
      platform,
      installCommand
    })
  }

  async function runConfirmedSetupInstall(request: PendingInstallConfirmation): Promise<void> {
    setPendingInstallConfirmation(null)

    try {
      setSetupStatusesByProfileId((current) => ({
        ...current,
        [request.profile.id]: {
          ...current[request.profile.id],
          state: 'installing',
          message: undefined,
          output: ''
        }
      }))

      const result = await window.terminalApi.spawnSetup({
        paneId: request.paneId,
        profile: request.profile,
        cols: 100,
        rows: 30
      })

      setInstallingSessionsByPtyId((current) => ({
        ...current,
        [result.ptyId]: { profileId: request.profile.id }
      }))
      updatePaneStatus(request.layoutId, request.paneId, 'running', result.ptyId, undefined, request.profile.id)
    } catch (error: unknown) {
      setSetupStatusesByProfileId((current) => ({
        ...current,
        [request.profile.id]: {
          ...current[request.profile.id],
          state: 'install-failed',
          message: getErrorMessage(error)
        }
      }))
      updatePaneStatus(request.layoutId, request.paneId, 'error', null, getErrorMessage(error))
    }
  }

  async function copyInstallCommand(profile: CommandProfile): Promise<void> {
    const availability =
      setupStatusesByProfileId[profile.id]?.availability ?? (await checkProfileStatus(profile))
    const installCommand = availability ? getInstallCommandForPlatform(profile, availability.platform) : null

    if (!installCommand || installCommand.trust !== 'verified') {
      return
    }

    await navigator.clipboard.writeText(installCommand.command)
    setSetupStatusesByProfileId((current) => ({
      ...current,
      [profile.id]: {
        ...current[profile.id],
        message: 'Install command copied.'
      }
    }))
  }

  function useCustomExecutablePath(profile: CommandProfile): void {
    setProfileDraft({
      name: `${profile.name} custom path`,
      command: profile.setup?.executableName ?? profile.command,
      args: '',
      cwd: '',
      env: {}
    })
    setProfileFormError('')
  }

  function stopPane(pane: PaneRuntime): void {
    if (!activeLayout) {
      return
    }

    if (pane.ptyId) {
      window.terminalApi.kill({ ptyId: pane.ptyId })
    }

    updatePaneStatus(activeLayout.id, pane.config.id, pane.config.profileId ? 'assigned' : 'blank', null)
  }

  async function restartPane(pane: PaneRuntime): Promise<void> {
    if (!activeLayout) {
      return
    }

    if (!pane.ptyId) {
      await startPane(pane)
      return
    }

    const profile = findCommandProfile(availableProfiles, pane.config.profileId)

    if (!profile) {
      updatePaneStatus(activeLayout.id, pane.config.id, 'error', null, 'No profile assigned')
      return
    }

    const layoutId = activeLayout.id

    try {
      const result = await window.terminalApi.restart({ ptyId: pane.ptyId, profile })
      updatePaneStatus(layoutId, pane.config.id, 'running', result.ptyId, undefined, profile.id)
    } catch (error: unknown) {
      updatePaneStatus(layoutId, pane.config.id, 'error', null, getErrorMessage(error))
    }
  }

  function clearPane(paneId: string): void {
    updateActiveLayout((layout) => assignProfileToPane(layout, paneId, null))
  }

  function deleteProfile(profileId: string): void {
    const profile = customProfiles.find((candidate) => candidate.id === profileId)

    if (!profile) {
      return
    }

    setPendingDeleteConfirmation({
      kind: 'profile',
      profileId,
      profileName: profile.name
    })
  }

  function confirmDeleteProfile(profileId: string): void {
    setWorkspace((current) => {
      const commandProfiles = deleteCustomCommandProfile(current.commandProfiles, profileId)

      if (commandProfiles.length === current.commandProfiles.length) {
        return current
      }

      return {
        ...current,
        preferences:
          current.preferences.defaultProfileId === profileId
            ? clearDefaultProfilePreference(current.preferences)
            : current.preferences,
        commandProfiles,
        layoutProfiles: current.layoutProfiles.map((layout) => removeProfileAssignments(layout, [profileId]))
      }
    })
  }

  function resetCustomProfiles(): void {
    if (customProfiles.length === 0) {
      return
    }

    setPendingDeleteConfirmation({ kind: 'custom-profiles' })
  }

  function confirmResetCustomProfiles(): void {
    setWorkspace((current) => {
      const customProfileIds = current.commandProfiles
        .filter((profile) => !profile.builtIn)
        .map((profile) => profile.id)

      if (customProfileIds.length === 0) {
        return current
      }

      return {
        ...current,
        preferences:
          current.preferences.defaultProfileId &&
          customProfileIds.includes(current.preferences.defaultProfileId)
            ? clearDefaultProfilePreference(current.preferences)
            : current.preferences,
        commandProfiles: [],
        layoutProfiles: current.layoutProfiles.map((layout) => removeProfileAssignments(layout, customProfileIds))
      }
    })
  }

  function confirmPendingDelete(): void {
    const request = pendingDeleteConfirmation

    if (!request) {
      return
    }

    setPendingDeleteConfirmation(null)

    if (request.kind === 'layout') {
      confirmDeleteActiveLayout(request.layoutId)
      return
    }

    if (request.kind === 'profile') {
      confirmDeleteProfile(request.profileId)
      return
    }

    confirmResetCustomProfiles()
  }

  function updateActiveLayoutSplitSizes(axis: LayoutSplitAxis, sizes: number[]): void {
    setWorkspace((current) => {
      let changed = false
      const layoutProfiles = current.layoutProfiles.map((layout) => {
        if (layout.id !== current.activeLayoutId) {
          return layout
        }

        const nextLayout = normalizeLayoutProfile(updateLayoutSplitSizes(layout, axis, sizes))
        if (areNumberArraysEqual(nextLayout.sizes, layout.sizes)) {
          return layout
        }

        changed = true
        return nextLayout
      })

      return changed ? { ...current, layoutProfiles } : current
    })
  }

  function beginCanvasInteraction(
    event: ReactPointerEvent<HTMLElement>,
    pane: PaneRuntime,
    interaction: { kind: 'move' } | { kind: 'resize'; handle: CanvasResizeHandle }
  ): void {
    if (workspaceMode !== 'canvas' || pane.config.placement?.locked || pane.config.placement?.maximized) {
      return
    }

    if (event.button !== 0) {
      return
    }

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    bringPaneForward(pane.config.id)

    const rect = canvas.getBoundingClientRect()
    let lastX = event.clientX
    let lastY = event.clientY
    let snapBypassed = event.altKey
    let hasMoved = false

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      const delta = {
        x: ((moveEvent.clientX - lastX) / Math.max(rect.width, 1)) * 100,
        y: ((moveEvent.clientY - lastY) / Math.max(rect.height, 1)) * 100
      }
      hasMoved = hasMoved || Math.abs(delta.x) > 0.01 || Math.abs(delta.y) > 0.01
      lastX = moveEvent.clientX
      lastY = moveEvent.clientY

      const layout = activeLayoutRef.current
      const previewBounds = layout ? getCanvasInteractionPreviewBounds(layout, pane.config.id, delta, interaction) : null
      snapBypassed = moveEvent.altKey
      setCanvasSnapGuides(
        previewBounds && !snapBypassed ? getCanvasSnapResult(layout!, pane.config.id, previewBounds).guides : []
      )

      updateActiveLayout((layout) =>
        interaction.kind === 'move'
          ? moveCanvasPane(layout, pane.config.id, delta)
          : resizeCanvasPane(layout, pane.config.id, delta, interaction.handle)
      )
    }

    const handlePointerUp = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      setCanvasSnapGuides([])
      snapBypassed = snapBypassed || upEvent.altKey

      if (hasMoved && !snapBypassed && upEvent.type !== 'pointercancel') {
        updateActiveLayout((layout) => applyCanvasPaneSnap(layout, pane.config.id))
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    window.addEventListener('pointercancel', handlePointerUp, { once: true })
  }

  function submitProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const name = profileDraft.name.trim()
    const command = profileDraft.command.trim()
    const hasPathLikeName = isCommandPathLikeProfileName(name)

    if (!name) {
      setProfileFormError('Profile name is required.')
      return
    }

    if (!command) {
      setProfileFormError('Command is required.')
      return
    }

    if (hasPathLikeName && !allowPathLikeProfileName) {
      setProfileFormError('This profile name looks like a command path. Confirm before adding it.')
      return
    }

    const profile = createCustomCommandProfile({
      ...profileDraft,
      env: parseEnv(envText)
    })

    setWorkspace((current) => ({
      ...current,
      commandProfiles: [...current.commandProfiles, profile]
    }))
    setProfileDraft(createEmptyCommandProfileDraft())
    setEnvText('')
    setAllowPathLikeProfileName(false)
    setProfileFormError('')
  }

  if (!activeLayout) {
    return null
  }

  function renderPanePanel(paneId: string, options: { canvas?: boolean } = {}): JSX.Element | null {
    const pane = paneRuntimesById.get(paneId)

    if (!pane) {
      return null
    }

    const assignedProfile = findCommandProfile(availableProfiles, pane.config.profileId)
    const launchedProfile = findCommandProfile(availableProfiles, pane.launchedProfileId ?? null)
    const assignedSetupStatus = assignedProfile ? setupStatusesByProfileId[assignedProfile.id] : undefined
    const assignedSetupState = assignedProfile ? getSetupState(assignedProfile, setupStatusesByProfileId) : 'unknown'
    const runningProfileName = launchedProfile?.name ?? assignedProfile?.name
    const hasProfileChanged =
      pane.status === 'running' &&
      Boolean(pane.launchedProfileId && pane.config.profileId && pane.launchedProfileId !== pane.config.profileId)
    const statusLabel = formatPaneStatus(pane.status)
    const paneName = formatPaneName(pane.config.id)
    const isCanvasPane = options.canvas === true
    const paneLocked = pane.config.placement?.locked ?? false
    const paneMaximized = pane.config.placement?.maximized ?? false
    const paneVisibleCount = activeLayout.panes.filter((paneConfig) => paneConfig.placement?.visible !== false).length
    const canEditPaneGeometry = isCanvasPane && !paneLocked && !paneMaximized

    return (
      <article
        key={pane.config.id}
        className={`pane-panel status-${pane.status}${isCanvasPane ? ' pane-panel-floating' : ''}${canEditPaneGeometry ? ' is-editable' : ' is-locked'}`}
        data-pane-id={pane.config.id}
        data-pane-mode={pane.config.placement?.mode ?? 'docked'}
      >
        <header className={isCanvasPane ? 'floating-pane-chrome' : undefined}>
          <div
            className={`pane-title-block${isCanvasPane ? ' floating-drag-region' : ''}`}
            onPointerDown={
              isCanvasPane ? (event) => beginCanvasInteraction(event, pane, { kind: 'move' }) : undefined
            }
            onDoubleClick={isCanvasPane && !paneLocked ? () => togglePaneMaximized(pane.config.id) : undefined}
            title={
              isCanvasPane
                ? paneLocked
                  ? 'Unlock pane to move or resize it.'
                  : paneMaximized
                    ? 'Double-click to restore this pane.'
                    : 'Drag to move this pane. Double-click to maximize.'
                : undefined
            }
          >
            <div className="pane-title-row">
              <strong>{paneName}</strong>
              <span className={`status-pill status-pill-${pane.status}`}>{statusLabel}</span>
              {isCanvasPane ? (
                <span className={`pane-lock-indicator ${paneLocked ? 'locked' : 'editable'}`}>
                  {paneLocked ? 'Locked' : paneMaximized ? 'Max' : 'Free'}
                </span>
              ) : null}
            </div>
            <div className="pane-state-lines">
              <span>Assigned profile: {assignedProfile?.name ?? 'None'}</span>
              {assignedProfile?.setup ? (
                <span className="pane-cli-status-line">
                  CLI status:{' '}
                  <span className={`profile-badge ${getProfileStatusClass(assignedSetupState)}`}>
                    {formatSetupState(assignedSetupState)}
                  </span>
                </span>
              ) : null}
              <span>{getPaneSessionLine(pane.status, assignedProfile?.name, runningProfileName)}</span>
              {hasProfileChanged && assignedProfile ? (
                <span className="pane-profile-changed">
                  Profile changed. Restart will launch {assignedProfile.name}.
                </span>
              ) : null}
            </div>
          </div>
          {isCanvasPane ? (
            <div className="floating-pane-controls" aria-label={`${paneName} canvas controls`}>
              <button
                type="button"
                className="quiet-action icon-text-action"
                onClick={() => togglePaneLocked(pane.config.id, !paneLocked)}
                aria-label={paneLocked ? 'Unlock pane' : 'Lock pane'}
                title={paneLocked ? 'Unlock pane' : 'Lock pane'}
              >
                {paneLocked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="quiet-action icon-text-action"
                onClick={() => togglePaneMaximized(pane.config.id)}
                disabled={paneLocked}
                aria-label={paneMaximized ? 'Restore pane' : 'Maximize pane'}
                title={paneMaximized ? 'Restore pane' : 'Maximize pane'}
              >
                {paneMaximized ? 'Restore' : 'Max'}
              </button>
              <button
                type="button"
                className="quiet-action icon-text-action"
                onClick={() => hidePane(pane.config.id)}
                disabled={pane.status === 'running' || paneVisibleCount <= 1}
                title={
                  pane.status === 'running'
                    ? 'Stop the running session before hiding this pane.'
                    : 'Hide this pane from the canvas.'
                }
              >
                Hide
              </button>
            </div>
          ) : null}
          <label className="pane-profile-select">
            <span>Assigned profile</span>
            <small>Start and Restart use this selection.</small>
            <select
              value={pane.config.profileId ?? ''}
              onChange={(event) => assignPane(pane.config.id, event.target.value)}
            >
              <option value="">Blank</option>
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {formatProfileOption(profile, setupStatusesByProfileId)}
                </option>
              ))}
            </select>
          </label>
        </header>
        {pane.status === 'running' && pane.ptyId ? (
          <TerminalPane ptyId={pane.ptyId} />
        ) : (
          <div className={`pane-body ${pane.status === 'error' ? 'pane-body-error' : ''}`}>
            <span>{getPaneBodyTitle(pane.status)}</span>
            {pane.status !== 'error' ? (
              assignedProfile?.setup && assignedSetupState !== 'installed' ? (
                <SetupPanel
                  profile={assignedProfile}
                  status={assignedSetupStatus}
                  onInstall={() => void startSetupInPane(pane, assignedProfile)}
                  onCopy={() => void copyInstallCommand(assignedProfile)}
                  onLaunchAnyway={() => void startPane(pane, { launchAnyway: true })}
                  onUseCustomPath={() => useCustomExecutablePath(assignedProfile)}
                />
              ) : (
                <small className="pane-command-line">
                  {assignedProfile
                    ? `Click Start to launch ${assignedProfile.name}.`
                    : 'Choose a command profile from the dropdown, then click Start.'}
                </small>
              )
            ) : null}
            {pane.status === 'error' ? (
              <div className="launch-error-block">
                <p>{getLaunchErrorSummary(pane.errorMessage, assignedProfile?.name)}</p>
                <details>
                  <summary>Command, args, PATH, and raw error</summary>
                  <pre>{pane.errorMessage ?? 'Command not found or failed to start'}</pre>
                </details>
              </div>
            ) : null}
          </div>
        )}
        <footer>
          <div className="pane-active-command">
            <span>{pane.status === 'running' ? 'Restart launches' : 'Start launches'}</span>
            <strong>{assignedProfile ? formatProfileCommand(assignedProfile) : 'No profile assigned'}</strong>
          </div>
          <div className="pane-actions">
            {pane.status === 'running' ? (
              <>
                <button
                  type="button"
                  onClick={() => stopPane(pane)}
                  title="Stop the running session in this pane."
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => void restartPane(pane)}
                  title={
                    assignedProfile
                      ? `Restart launches ${assignedProfile.name}.`
                      : 'Restart needs an assigned profile.'
                  }
                >
                  Restart
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void startPane(pane)}
                  disabled={!pane.config.profileId}
                  title={
                    assignedProfile
                      ? `Start launches ${assignedProfile.name}.`
                      : 'Choose a command profile before starting.'
                  }
                >
                  Start
                </button>
                <button
                  type="button"
                  className="quiet-action"
                  onClick={() => clearPane(pane.config.id)}
                  disabled={!pane.config.profileId}
                  title="Remove the assigned profile from this pane."
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </footer>
      </article>
    )
  }

  function renderPaneInPanel(paneId: string, size: number, order: number): JSX.Element {
    return (
      <Panel
        id={`${activeLayout.id}.${paneId}`}
        order={order}
        defaultSize={size}
        minSize={MIN_PANE_SIZE_PERCENT}
        className="pane-resizable-panel"
      >
        {renderPanePanel(paneId)}
      </Panel>
    )
  }

  function renderResizeHandle(axis: LayoutSplitAxis, id: string, label: string): JSX.Element {
    return (
      <PanelResizeHandle
        id={`${activeLayout.id}.${id}`}
        className={`pane-resize-handle pane-resize-handle-${axis}`}
        aria-label={label}
        title={label}
        hitAreaMargins={{ coarse: 12, fine: 8 }}
      />
    )
  }

  function renderCanvasResizeHandles(pane: PaneRuntime): JSX.Element | null {
    if (pane.config.placement?.locked || pane.config.placement?.maximized) {
      return null
    }

    const handles: CanvasResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

    return (
      <>
        {handles.map((handle) => (
          <button
            key={handle}
            type="button"
            className={`canvas-resize-handle canvas-resize-${handle}`}
            aria-label={`Resize ${formatPaneName(pane.config.id)} from ${handle}`}
            title="Resize pane"
            onPointerDown={(event) => beginCanvasInteraction(event, pane, { kind: 'resize', handle })}
          />
        ))}
      </>
    )
  }

  function renderCanvasLayout(): JSX.Element {
    const visiblePanes = paneRuntimes
      .filter((pane) => pane.config.placement?.visible !== false)
      .sort((left, right) => (left.config.placement?.zIndex ?? 1) - (right.config.placement?.zIndex ?? 1))

    return (
      <div
        className={`canvas-workspace ${allVisibleCanvasPanesLocked ? 'canvas-locked' : 'canvas-direct'}`}
        ref={canvasRef}
        aria-label="Floating canvas workspace"
      >
        <div className="canvas-depth-field" aria-hidden="true" />
        <div className="canvas-mode-ribbon">
          {allVisibleCanvasPanesLocked ? 'All panes locked' : 'Direct manipulation'}
        </div>
        {canvasSnapGuides.map((guide, index) => (
          <div
            key={`${guide.axis}-${guide.position}-${index}`}
            className={`canvas-snap-guide canvas-snap-guide-${guide.axis}`}
            style={guide.axis === 'x' ? { left: `${guide.position}%` } : { top: `${guide.position}%` }}
            aria-hidden="true"
          />
        ))}
        {visiblePanes.map((pane) => {
          const bounds = pane.config.placement?.bounds ?? { x: 0, y: 0, width: 100, height: 100 }
          const zIndex = pane.config.placement?.zIndex ?? 1
          const paneLocked = pane.config.placement?.locked === true
          const paneMaximized = pane.config.placement?.maximized === true

          return (
            <div
              key={pane.config.id}
              className={`floating-pane-window${paneLocked ? ' locked' : ' editable'}${paneMaximized ? ' maximized' : ''}`}
              style={{
                left: `${bounds.x}%`,
                top: `${bounds.y}%`,
                width: `${bounds.width}%`,
                height: `${bounds.height}%`,
                zIndex
              }}
              onPointerDown={() => bringPaneForward(pane.config.id)}
            >
              {renderPanePanel(pane.config.id, { canvas: true })}
              {renderCanvasResizeHandles(pane)}
            </div>
          )
        })}
      </div>
    )
  }

  function renderPaneLayout(): JSX.Element {
    if (workspaceMode === 'canvas') {
      return renderCanvasLayout()
    }

    if (activeLayout.preset === 'single') {
      return <div className="pane-single-layout">{renderPanePanel('pane-1')}</div>
    }

    if (activeLayout.preset === 'two-vertical') {
      return (
        <PanelGroup
          ref={columnPanelGroupRef}
          id={`${activeLayout.id}.columns`}
          direction="horizontal"
          className="pane-panel-group pane-layout"
          onLayout={(sizes) => updateActiveLayoutSplitSizes('columns', sizes)}
        >
          {renderPaneInPanel('pane-1', columnSizes[0] ?? 50, 1)}
          {renderResizeHandle('columns', 'columns', 'Resize vertical pane split')}
          {renderPaneInPanel('pane-2', columnSizes[1] ?? 50, 2)}
        </PanelGroup>
      )
    }

    if (activeLayout.preset === 'two-horizontal') {
      return (
        <PanelGroup
          ref={rowPanelGroupRef}
          id={`${activeLayout.id}.rows`}
          direction="vertical"
          className="pane-panel-group pane-layout"
          onLayout={(sizes) => updateActiveLayoutSplitSizes('rows', sizes)}
        >
          {renderPaneInPanel('pane-1', rowSizes[0] ?? 50, 1)}
          {renderResizeHandle('rows', 'rows', 'Resize horizontal pane split')}
          {renderPaneInPanel('pane-2', rowSizes[1] ?? 50, 2)}
        </PanelGroup>
      )
    }

    if (activeLayout.preset === 'three-pane') {
      return (
        <PanelGroup
          ref={columnPanelGroupRef}
          id={`${activeLayout.id}.columns`}
          direction="horizontal"
          className="pane-panel-group pane-layout"
          onLayout={(sizes) => updateActiveLayoutSplitSizes('columns', sizes)}
        >
          {renderPaneInPanel('pane-1', columnSizes[0] ?? 50, 1)}
          {renderResizeHandle('columns', 'columns', 'Resize main pane split')}
          <Panel
            id={`${activeLayout.id}.right-stack`}
            order={2}
            defaultSize={columnSizes[1] ?? 50}
            minSize={MIN_PANE_SIZE_PERCENT}
            className="pane-resizable-panel"
          >
            <PanelGroup
              ref={rowPanelGroupRef}
              id={`${activeLayout.id}.rows`}
              direction="vertical"
              className="pane-panel-group"
              onLayout={(sizes) => updateActiveLayoutSplitSizes('rows', sizes)}
            >
              {renderPaneInPanel('pane-2', rowSizes[0] ?? 50, 1)}
              {renderResizeHandle('rows', 'right-rows', 'Resize right pane split')}
              {renderPaneInPanel('pane-3', rowSizes[1] ?? 50, 2)}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      )
    }

    return (
      <PanelGroup
        ref={rowPanelGroupRef}
        id={`${activeLayout.id}.rows`}
        direction="vertical"
        className="pane-panel-group pane-layout"
        onLayout={(sizes) => updateActiveLayoutSplitSizes('rows', sizes)}
      >
        <Panel
          id={`${activeLayout.id}.top-row`}
          order={1}
          defaultSize={rowSizes[0] ?? 50}
          minSize={MIN_PANE_SIZE_PERCENT}
          className="pane-resizable-panel"
        >
          <PanelGroup
            ref={columnPanelGroupRef}
            id={`${activeLayout.id}.top-columns`}
            direction="horizontal"
            className="pane-panel-group"
            onLayout={(sizes) => updateActiveLayoutSplitSizes('columns', sizes)}
          >
            {renderPaneInPanel('pane-1', columnSizes[0] ?? 50, 1)}
            {renderResizeHandle('columns', 'top-columns', 'Resize top vertical grid split')}
            {renderPaneInPanel('pane-2', columnSizes[1] ?? 50, 2)}
          </PanelGroup>
        </Panel>
        {renderResizeHandle('rows', 'rows', 'Resize horizontal grid split')}
        <Panel
          id={`${activeLayout.id}.bottom-row`}
          order={2}
          defaultSize={rowSizes[1] ?? 50}
          minSize={MIN_PANE_SIZE_PERCENT}
          className="pane-resizable-panel"
        >
          <PanelGroup
            ref={secondaryColumnPanelGroupRef}
            id={`${activeLayout.id}.bottom-columns`}
            direction="horizontal"
            className="pane-panel-group"
            onLayout={(sizes) => updateActiveLayoutSplitSizes('columns', sizes)}
          >
            {renderPaneInPanel('pane-3', columnSizes[0] ?? 50, 1)}
            {renderResizeHandle('columns', 'bottom-columns', 'Resize bottom vertical grid split')}
            {renderPaneInPanel('pane-4', columnSizes[1] ?? 50, 2)}
          </PanelGroup>
        </Panel>
      </PanelGroup>
    )
  }

  return (
    <main
      className="workspace-shell"
      data-color-mode={resolvedColorMode}
      data-glass-theme={resolvedGlassTheme}
    >
      <aside className="sidebar" aria-label="Workspace controls">
        <section className="sidebar-masthead" aria-label="WindowPanes">
          <div>
            <span className="brand-kicker">Local command center</span>
            <h1>WindowPanes</h1>
          </div>
          <span className="version-badge">v{APP_VERSION}</span>
        </section>
        <section className="control-section">
          <div className="section-heading">
            <div>
              <h2>Appearance</h2>
              <p>Glass material</p>
            </div>
          </div>
          <label>
            <span>Glass Material</span>
            <small>Follow system uses Diamond in light mode and Onyx in dark mode.</small>
            <select
              value={activeGlassMaterialPreference}
              onChange={(event) => selectGlassMaterial(event.target.value as GlassMaterialPreference)}
            >
              <option value="follow-system">Follow system</option>
              {GLASS_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <div className="theme-preview" aria-label="Selected glass theme preview">
            <span className="theme-preview-gem" />
            <div>
              <strong>{getGlassThemeName(resolvedGlassTheme)}</strong>
              <small>{activeGlassMaterialPreference === 'follow-system' ? 'Following OS appearance' : 'Curated pane material'}</small>
            </div>
          </div>
        </section>
        <section className="control-section">
          <div className="section-heading">
            <div>
              <h2>Layouts</h2>
              <p>Saved workspaces and pane assignments</p>
            </div>
            <span className="save-status">{saveStatus}</span>
          </div>
          <div className="active-layout-card">
            <span>Active layout</span>
            <strong>{activeLayout.name}</strong>
            <small>This is the layout currently shown in the workspace.</small>
            <small>Preset: {LAYOUT_PRESET_LABELS[activeLayout.preset]}</small>
            <small>Workspace: {workspaceMode === 'canvas' ? 'Canvas' : 'Docked'}</small>
          </div>
          <div className="workspace-mode-control" aria-label="Workspace mode">
            <button
              type="button"
              className={workspaceMode === 'docked' ? 'selected' : ''}
              onClick={() => selectWorkspaceMode('docked')}
            >
              Docked
            </button>
            <button
              type="button"
              className={workspaceMode === 'canvas' ? 'selected' : ''}
              onClick={() => selectWorkspaceMode('canvas')}
            >
              Canvas
            </button>
          </div>
          {workspaceMode === 'canvas' ? (
            <div className="canvas-arrangement-actions">
              <button type="button" onClick={() => lockAllCanvasPanes(true)}>
                Lock all
              </button>
              <button type="button" onClick={() => lockAllCanvasPanes(false)}>
                Unlock all
              </button>
              <button type="button" onClick={tileCanvas}>
                Tile panes
              </button>
              <button type="button" onClick={resetCanvas}>
                Reset arrangement
              </button>
              {hiddenPaneCount > 0 ? (
                <div className="hidden-pane-list">
                  {activeLayout.panes
                    .filter((pane) => pane.placement?.visible === false)
                    .map((pane) => (
                      <button key={pane.id} type="button" className="quiet-action" onClick={() => showPane(pane.id)}>
                        Show {formatPaneName(pane.id)}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <label>
            <span>Switch layout</span>
            <small>Choose a saved layout to display.</small>
            <select value={workspace.activeLayoutId} onChange={(event) => selectLayout(event.target.value)}>
              {workspace.layoutProfiles.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
          </label>
          <form className="layout-rename-form" onSubmit={submitLayoutRename}>
            <label>
              <span>Rename active layout</span>
              <small>Changes the name of the current layout only.</small>
              <input
                value={layoutNameDraft}
                onChange={(event) => {
                  setLayoutNameDraft(event.target.value)
                  setLayoutFormError('')
                }}
              />
            </label>
            {layoutFormError ? (
              <p className="form-message" role="alert">
                {layoutFormError}
              </p>
            ) : null}
            <button type="submit" className="secondary-action">
              Rename
            </button>
          </form>
          <div className="button-row">
            <button type="button" onClick={saveLayoutCopy} title="Create a new layout based on the current one.">
              Save copy
            </button>
            <button
              type="button"
              className="danger-action quiet-action"
              onClick={deleteActiveLayout}
              disabled={workspace.layoutProfiles.length === 1}
              title="Deletes the saved layout, not command profiles."
            >
              Delete layout
            </button>
          </div>
          <p className="section-note">
            Save copy creates a new layout based on the current one. Delete layout removes only the saved layout.
          </p>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <div>
              <h2>Presets</h2>
              <p>Choose the pane arrangement</p>
            </div>
          </div>
          <div className="preset-grid">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={activeLayout.preset === preset ? 'selected' : ''}
                onClick={() => updateActiveLayout((layout) => applyLayoutPreset(layout, preset))}
              >
                {LAYOUT_PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <div>
              <h2>Split Sizes</h2>
              <p>Adjust this layout only</p>
            </div>
          </div>
          {workspaceMode === 'canvas' ? (
            <p className="section-note">Canvas uses floating pane geometry. Unlocked panes drag and resize directly from their chrome.</p>
          ) : activeLayout.sizes.length === 0 ? (
            <p className="section-note">Single pane layouts do not have split controls.</p>
          ) : (
            activeLayout.sizes.map((size, index) => (
              <label key={index}>
                <span className="label-with-value">
                  Split {index + 1}
                  <small>{Math.round(size)}%</small>
                </span>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={size}
                  onChange={(event) => {
                    const sizes = [...activeLayout.sizes]
                    const nextSize = Number(event.target.value)
                    const pairedIndex = getPairedSizeIndex(index)
                    sizes[index] = nextSize
                    sizes[pairedIndex] = 100 - nextSize
                    updateActiveLayout((layout) => updateLayoutSizes(layout, sizes))
                  }}
                />
              </label>
            ))
          )}
        </section>

        <section className="control-section">
          <div className="section-heading">
            <div>
              <h2>Command Profiles</h2>
              <p>Reusable commands for terminal panes</p>
            </div>
            <button
              type="button"
              className="secondary-action quiet-action danger-action"
              onClick={resetCustomProfiles}
              disabled={customProfiles.length === 0}
              title="Delete all custom profiles from saved settings."
            >
              Delete all custom
            </button>
          </div>
          <div className="profile-group">
            <h3>Built-in profiles</h3>
            <p className="section-note">Provided by the app. These cannot be deleted.</p>
            <div className="profile-list">
              {builtInProfiles.map((profile) => (
                <div key={profile.id} className="profile-row protected-profile">
                  <div>
                    <strong>{profile.name}</strong>
                    <span>{profile.command || 'System shell resolved at launch'}</span>
                  </div>
                  <span className={`profile-badge ${getProfileStatusClass(getSetupState(profile, setupStatusesByProfileId))}`}>
                    {profile.setup ? formatSetupState(getSetupState(profile, setupStatusesByProfileId)) : 'Built-in'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="profile-group">
            <h3>Custom profiles</h3>
            <p className="section-note">
              Profiles you created. These can be edited by replacing them or deleted here.
            </p>
            {customProfiles.length === 0 ? (
              <p className="section-note">No custom profiles yet. Add one below for repeated commands.</p>
            ) : (
              <div className="profile-list">
                {customProfiles.map((profile) => (
                  <div key={profile.id} className="profile-row">
                    <div>
                      <strong>{profile.name}</strong>
                      <span>{formatProfileCommand(profile)}</span>
                    </div>
                    <button
                      type="button"
                      className="danger-action quiet-action"
                      onClick={() => deleteProfile(profile.id)}
                      title="Removes this profile from saved settings. Built-in profiles are not affected."
                    >
                      Delete custom profile
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="profile-form" onSubmit={submitProfile}>
            <div className="form-heading">
              <h3>Add custom profile</h3>
              <p>Create a saved command that can be assigned to any pane.</p>
            </div>
            <label>
              <span>Profile name</span>
              <small>Short display name shown in pane selectors.</small>
              <input
                placeholder="Local API server"
                value={profileDraft.name}
                onChange={(event) => {
                  setProfileDraft((draft) => ({ ...draft, name: event.target.value }))
                  setAllowPathLikeProfileName(false)
                  setProfileFormError('')
                }}
              />
            </label>
            <label>
              <span>Command</span>
              <small>Executable to launch, such as powershell.exe, codex, claude, or droid.</small>
              <input
                placeholder="npm"
                value={profileDraft.command}
                onChange={(event) => {
                  setProfileDraft((draft) => ({ ...draft, command: event.target.value }))
                  setProfileFormError('')
                }}
              />
            </label>
            <label>
              <span>Args</span>
              <small>Optional arguments passed to the command.</small>
              <input
                placeholder="run dev"
                value={String(profileDraft.args ?? '')}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, args: event.target.value }))}
              />
            </label>
            <label>
              <span>Working directory</span>
              <small>Folder where the terminal starts. Blank uses the default shell location.</small>
              <input
                placeholder="C:\\Users\\you\\project"
                value={profileDraft.cwd ?? ''}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, cwd: event.target.value }))}
              />
            </label>
            <label>
              <span>Environment variables</span>
              <small>Optional KEY=value entries, one per line.</small>
              <textarea
                placeholder={'NODE_ENV=development\nAPI_HOST=localhost'}
                value={envText}
                onChange={(event) => setEnvText(event.target.value)}
              />
            </label>
            {isCommandPathLikeProfileName(profileDraft.name) ? (
              <label className="confirmation-row">
                <input
                  type="checkbox"
                  checked={allowPathLikeProfileName}
                  onChange={(event) => setAllowPathLikeProfileName(event.target.checked)}
                />
                Use this command-path-looking name anyway
              </label>
            ) : null}
            {profileFormError ? (
              <p className="form-message" role="alert">
                {profileFormError}
              </p>
            ) : null}
            <button type="submit" className="primary-action">
              Add custom profile
            </button>
          </form>
        </section>

        <section className="control-section help-section" aria-labelledby="help-about-heading">
          <div className="section-heading">
            <div>
              <h2 id="help-about-heading">Help / About</h2>
              <p>WindowPanes is a local terminal workspace.</p>
            </div>
          </div>
          <div className="help-copy">
            <p className="about-version">Version {APP_VERSION}</p>
            <p>WindowPanes launches local CLIs already installed on this machine.</p>
            <p>
              It does not manage provider authentication, API keys, prompts, or orchestration.
              Built-in profiles require their CLIs to be installed and authenticated externally.
            </p>
            <p>Custom profiles can launch arbitrary local commands.</p>
          </div>
        </section>
      </aside>

      <section className={`pane-stage pane-stage-${workspaceMode}`} aria-label="Terminal pane assignments">
        <div className={`pane-workspace pane-workspace-${workspaceMode} preset-${activeLayout.preset}`}>
          {renderPaneLayout()}
        </div>
      </section>
      {pendingInstallConfirmation ? (
        <InstallConfirmationModal
          request={pendingInstallConfirmation}
          onCancel={() => setPendingInstallConfirmation(null)}
          onRun={() => void runConfirmedSetupInstall(pendingInstallConfirmation)}
        />
      ) : null}
      {pendingDeleteConfirmation ? (
        <DeleteConfirmationModal
          request={pendingDeleteConfirmation}
          onCancel={() => setPendingDeleteConfirmation(null)}
          onConfirm={confirmPendingDelete}
        />
      ) : null}
    </main>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

function getCanvasInteractionPreviewBounds(
  layout: LayoutProfile,
  paneId: string,
  delta: Pick<PaneBounds, 'x' | 'y'>,
  interaction: { kind: 'move' } | { kind: 'resize'; handle: CanvasResizeHandle }
): PaneBounds | null {
  const pane = layout.panes.find((candidate) => candidate.id === paneId)
  const bounds = pane?.placement?.bounds

  if (!bounds) {
    return null
  }

  if (interaction.kind === 'move') {
    return {
      ...bounds,
      x: bounds.x + delta.x,
      y: bounds.y + delta.y
    }
  }

  const nextBounds = { ...bounds }

  if (interaction.handle.includes('e')) {
    nextBounds.width += delta.x
  }

  if (interaction.handle.includes('s')) {
    nextBounds.height += delta.y
  }

  if (interaction.handle.includes('w')) {
    nextBounds.x += delta.x
    nextBounds.width -= delta.x
  }

  if (interaction.handle.includes('n')) {
    nextBounds.y += delta.y
    nextBounds.height -= delta.y
  }

  return nextBounds
}

function getGlassThemeName(themeId: GemThemeId): string {
  return GLASS_THEMES.find((theme) => theme.id === themeId)?.name ?? 'Diamond'
}

function formatProfileCommand(profile: { command: string; args: readonly string[] }): string {
  const command = profile.command || 'Default shell'
  return [command, ...profile.args].filter(Boolean).join(' ')
}

function formatPaneStatus(status: PaneRuntime['status']): string {
  if (status === 'blank') {
    return 'No profile'
  }

  if (status === 'assigned') {
    return 'Ready to start'
  }

  if (status === 'running') {
    return 'Running session'
  }

  if (status === 'starting') {
    return 'Starting session'
  }

  if (status === 'error') {
    return 'Launch failed'
  }

  const exhaustive: never = status
  return exhaustive
}

function formatPaneName(paneId: string): string {
  return paneId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getPaneBodyTitle(status: PaneRuntime['status']): string {
  if (status === 'blank') {
    return 'No profile assigned'
  }

  if (status === 'error') {
    return 'Launch failed'
  }

  if (status === 'starting') {
    return 'Starting session'
  }

  return 'Ready to start'
}

function getPaneSessionLine(
  status: PaneRuntime['status'],
  assignedProfileName?: string,
  runningProfileName?: string
): string {
  if (status === 'running') {
    return `Running session: ${runningProfileName ?? 'Unknown profile'}`
  }

  if (status === 'starting') {
    return `Session: Starting ${assignedProfileName ?? runningProfileName ?? 'profile'}.`
  }

  if (status === 'error') {
    return 'Session: Launch failed. See diagnostics below.'
  }

  if (assignedProfileName) {
    return `Session: Stopped. Start will launch ${assignedProfileName}.`
  }

  return 'Session: Stopped. Choose a profile before starting.'
}

function getLaunchErrorSummary(errorMessage?: string, profileName?: string): string {
  const firstLine = errorMessage?.split('\n').find((line) => line.trim().length > 0)

  if (firstLine) {
    return firstLine
  }

  return profileName
    ? `${profileName} could not start.`
    : 'Command not found or failed to start.'
}

function getPairedSizeIndex(index: number): number {
  return index % 2 === 0 ? index + 1 : index - 1
}

function syncPanelGroupLayout(group: ImperativePanelGroupHandle | null, sizes: readonly number[]): void {
  if (!group || sizes.length !== 2 || areNumberArraysEqual(group.getLayout(), sizes)) {
    return
  }

  group.setLayout([...sizes])
}

function areNumberArraysEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => Math.abs(value - right[index]) < 0.01)
}

function InstallConfirmationModal(props: {
  request: PendingInstallConfirmation
  onCancel: () => void
  onRun: () => void
}): JSX.Element {
  const { request, onCancel, onRun } = props
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const details = createSetupConfirmationDetails(request.profile, request.platform, request.installCommand)

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <section className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
        <div className="install-modal-heading">
          <h2 id="install-modal-title">{details.title}</h2>
          <p>Review the exact setup command before WindowPanes runs it in this pane.</p>
        </div>
        <dl className="install-modal-metadata">
          <div>
            <dt>Profile</dt>
            <dd>{details.profileName}</dd>
          </div>
          <div>
            <dt>Expected executable</dt>
            <dd>{details.executableName}</dd>
          </div>
          <div>
            <dt>Operating system</dt>
            <dd>{details.operatingSystem}</dd>
          </div>
          <div>
            <dt>Exact install command</dt>
            <dd>
              <code>{details.command}</code>
            </dd>
          </div>
          <div>
            <dt>Source/docs URL</dt>
            <dd>
              <a href={details.sourceUrl} target="_blank" rel="noreferrer">
                {details.sourceUrl}
              </a>
            </dd>
          </div>
        </dl>
        <p className="install-modal-warning">{details.warning}</p>
        <div className="install-modal-actions">
          <button type="button" className="quiet-action" ref={cancelButtonRef} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-action" onClick={onRun}>
            Run install
          </button>
        </div>
      </section>
    </div>
  )
}

function DeleteConfirmationModal(props: {
  request: PendingDeleteConfirmation
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { request, onCancel, onConfirm } = props
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const details = getDeleteConfirmationDetails(request)

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <section className="install-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div className="install-modal-heading">
          <h2 id="delete-modal-title">{details.title}</h2>
          <p>{details.message}</p>
        </div>
        <p className="install-modal-warning">{details.warning}</p>
        <div className="install-modal-actions">
          <button type="button" className="quiet-action" ref={cancelButtonRef} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger-action" onClick={onConfirm}>
            {details.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

function getDeleteConfirmationDetails(request: PendingDeleteConfirmation): {
  title: string
  message: string
  warning: string
  confirmLabel: string
} {
  if (request.kind === 'layout') {
    return {
      title: `Delete ${request.layoutName}?`,
      message: 'This removes the saved layout and its pane assignments.',
      warning: 'Command profiles and installed CLIs are not changed.',
      confirmLabel: 'Delete layout'
    }
  }

  if (request.kind === 'profile') {
    return {
      title: `Delete ${request.profileName}?`,
      message: 'This removes the custom command profile from saved settings.',
      warning: 'Built-in profiles are not affected. Panes using this profile will be cleared.',
      confirmLabel: 'Delete profile'
    }
  }

  return {
    title: 'Delete all custom profiles?',
    message: 'This removes every custom command profile from saved settings.',
    warning: 'Built-in profiles are not affected. Panes using custom profiles will be cleared.',
    confirmLabel: 'Delete all custom'
  }
}

function SetupPanel(props: {
  profile: CommandProfile
  status?: SetupProfileStatus
  onInstall: () => void
  onCopy: () => void
  onLaunchAnyway: () => void
  onUseCustomPath: () => void
}): JSX.Element {
  const { profile, status, onInstall, onCopy, onLaunchAnyway, onUseCustomPath } = props
  const state = status?.state ?? 'unknown'
  const [isDetailsOpen, setIsDetailsOpen] = useState(
    () => state === 'install-failed' || Boolean(status?.output)
  )
  const platform = status?.availability?.platform ?? 'unknown'
  const { installCommand, canInstall, canCopy, manualMessage } = getSetupInstallActionState(
    profile,
    platform,
    state
  )
  const setupMessage =
    manualMessage ??
    (state === 'unknown'
      ? `${profile.name} has not been checked yet. WindowPanes will check PATH before launch.`
      : `${profile.name} is not installed or not on PATH.`)

  useEffect(() => {
    if (state === 'install-failed' || status?.output) {
      setIsDetailsOpen(true)
    }
  }, [state, status?.output])

  return (
    <div className="setup-panel">
      <div className="setup-banner" role="status">
        <div className="setup-banner-copy">
          <strong>{setupMessage}</strong>
          {status?.message ? <small className="setup-message">{status.message}</small> : null}
        </div>
        <div className="setup-banner-actions">
          <button
            type="button"
            className="secondary-action"
            aria-expanded={isDetailsOpen}
            onClick={() => setIsDetailsOpen((current) => !current)}
          >
            {isDetailsOpen ? 'Hide setup' : 'Setup'}
          </button>
          <button type="button" className="secondary-action quiet-action" onClick={onLaunchAnyway}>
            Launch anyway
          </button>
        </div>
      </div>
      {isDetailsOpen ? (
        <div className="setup-details">
          <p>
            WindowPanes can help run the install/setup command, or you can install this CLI manually.
          </p>
          <dl>
            <div>
              <dt>Profile</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt>Executable</dt>
              <dd>{profile.setup?.executableName ?? profile.command}</dd>
            </div>
            <div>
              <dt>OS</dt>
              <dd>{formatInstallPlatform(platform)}</dd>
            </div>
            <div>
              <dt>Setup command</dt>
              <dd>{installCommand?.command ?? MANUAL_INSTALL_MESSAGE}</dd>
            </div>
          </dl>
          {installCommand ? (
            <small>
              Provider/source warning: this command comes from {installCommand.source}. WindowPanes runs it
              only after confirmation, in a visible terminal pane. Source: {installCommand.sourceUrl}
            </small>
          ) : (
            <small>{manualMessage ?? MANUAL_INSTALL_MESSAGE}</small>
          )}
          {profile.setup?.loginSetupNote ? <small>{profile.setup.loginSetupNote}</small> : null}
          {status?.output ? <pre className="setup-output">{status.output}</pre> : null}
          <div className="setup-actions">
            <button type="button" onClick={onInstall} disabled={!canInstall}>
              {state === 'installing' ? 'Installing' : 'Install'}
            </button>
            <button type="button" className="quiet-action" onClick={onCopy} disabled={!canCopy}>
              Copy install command
            </button>
            {profile.setup?.installHelpUrl ? (
              <a className="button-link quiet-action" href={profile.setup.installHelpUrl} target="_blank" rel="noreferrer">
                Open install docs
              </a>
            ) : null}
            <button type="button" className="quiet-action" onClick={onUseCustomPath}>
              Use custom executable path
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getSetupState(
  profile: CommandProfile,
  statusesByProfileId: Record<string, SetupProfileStatus>
): SetupProfileState {
  if (!profile.setup) {
    return 'installed'
  }

  return statusesByProfileId[profile.id]?.state ?? 'unknown'
}

function formatSetupState(state: SetupProfileState): string {
  if (state === 'installed') {
    return 'Installed'
  }

  if (state === 'missing') {
    return 'Missing'
  }

  if (state === 'installing') {
    return 'Installing'
  }

  if (state === 'install-failed') {
    return 'Install failed'
  }

  return 'Unknown'
}

function getProfileStatusClass(state: SetupProfileState): string {
  return `profile-badge-${state}`
}

function formatProfileOption(
  profile: CommandProfile,
  statusesByProfileId: Record<string, SetupProfileStatus>
): string {
  return profile.setup ? `${profile.name} (${formatSetupState(getSetupState(profile, statusesByProfileId))})` : profile.name
}

function parseEnv(text: string): Record<string, string> | undefined {
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, ...valueParts] = line.split('=')
      return [key.trim(), valueParts.join('=').trim()] as const
    })
    .filter(([key]) => key.length > 0)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function clearDefaultProfilePreference(
  preferences: WorkspaceState['preferences']
): WorkspaceState['preferences'] {
  const { defaultProfileId: _defaultProfileId, ...rest } = preferences

  return rest
}

function getStorageApi(): StorageApi {
  return window.storageApi ?? fallbackStorage
}

function createMemoryStorage(): StorageApi {
  let current: PersistedState = DEFAULT_PERSISTED_STATE

  return {
    async load() {
      return current
    },
    async save(state) {
      current = state
    }
  }
}
