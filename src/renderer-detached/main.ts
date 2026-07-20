import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {
  BUILT_IN_PROFILES,
  DETACHED_PANE_CONFIG_CHANNEL,
  type CommandProfile,
  type DetachedPaneAppearanceDraft,
  type DetachedPaneConfigMessage,
  type DetachedPaneConfigSnapshot,
  type TerminalDataEvent
} from '../shared'
import {
  FACET_ORIENTATIONS,
  MATERIALS,
  TREATMENTS,
  type FacetOrientation,
  type GemMaterial,
  type GemTreatment
} from '../renderer-gemstone/domain/gemstoneState'
import '../renderer-gemstone/styles.css'
import './styles.css'

const root = document.getElementById('root')
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const paneId = params.get('paneId')
const ptyId = params.get('ptyId')
const title = params.get('title') ?? 'Detached Pane'
const subtitle = params.get('subtitle') || 'Detached desktop pane'
const material = getAllowedValue(params.get('material'), MATERIALS, 'diamond')
const treatment = getAllowedValue(params.get('treatment'), TREATMENTS, 'sharp')
const facetOrientation = getAllowedValue(params.get('facetOrientation'), FACET_ORIENTATIONS, 'right')

if (!root || !paneId || !ptyId) {
  document.body.textContent = 'Detached pane is missing a terminal session.'
} else {
  renderDetachedPane(root, {
    paneId,
    ptyId,
    title,
    subtitle,
    profileId: null,
    material,
    treatment,
    facetOrientation,
    status: 'running',
    profiles: [...BUILT_IN_PROFILES]
  })
}

interface DetachedPaneModel {
  paneId: string
  ptyId: string | null
  title: string
  subtitle: string
  profileId: string | null
  material: GemMaterial
  treatment: GemTreatment
  facetOrientation: FacetOrientation
  status: DetachedPaneConfigSnapshot['status']
  profiles: CommandProfile[]
}

function renderDetachedPane(rootElement: HTMLElement, pane: DetachedPaneModel): void {
  let currentPane: DetachedPaneModel = { ...pane, profiles: [...pane.profiles] }
  let lastKnownPtyId = pane.ptyId
  rootElement.innerHTML = `
    <main class="gemstone-workspace detached-workspace">
      <article class="gem-pane detached-pane active material-${currentPane.material} treatment-${currentPane.treatment} orientation-${currentPane.facetOrientation} status-${currentPane.status}" data-pane-visible="true" data-pane-selected="true" data-pane-locked="false" data-pane-status="${currentPane.status}" style="--pane-x: 0px; --pane-y: 0px;">
        <div class="gem-shadow" aria-hidden="true"></div>
        <div class="gemstone-frame">
          <div class="facet-grid" aria-hidden="true"></div>
          <div class="edge-rim" aria-hidden="true"></div>
          <div class="gem-content-safe">
            <header class="gem-chrome detached-titlebar">
              <div>
                <strong data-title>${escapeHtml(currentPane.title)}</strong>
                <span class="pane-command-subtitle" data-subtitle>${escapeHtml(currentPane.subtitle)}</span>
              </div>
              <div class="pane-chip-row">
                <span aria-label="Running" class="status-dot status-dot-green" title="Running"></span>
              </div>
            </header>
            <div class="terminal-core">
              <div class="terminal-surface detached-terminal"></div>
            </div>
            <div class="pane-icon-controls detached-actions" aria-label="${escapeHtml(pane.title)} detached controls" data-pane-control="true">
              <button type="button" class="pane-icon-button" data-close aria-label="Return ${escapeHtml(pane.title)} to workspace" title="Return to workspace">X</button>
              <button type="button" class="pane-icon-button" data-lock aria-label="Lock ${escapeHtml(pane.title)}" title="Lock">🔓</button>
              <button type="button" class="pane-icon-button" data-pin aria-label="Unpin ${escapeHtml(pane.title)}" title="Unpin">⌖</button>
              <button type="button" class="pane-icon-button" data-edit aria-label="Edit ${escapeHtml(pane.title)}" title="Edit pane">⋯</button>
            </div>
            <form class="detached-editor" data-editor hidden aria-label="Detached pane settings">
              <header>
                <strong>Edit pane</strong>
                <button type="button" data-cancel-edit aria-label="Close detached pane editor" title="Close">X</button>
              </header>
              <label>
                <span>Profile</span>
                <select data-profile></select>
              </label>
              <label>
                <span>Material</span>
                <select data-material></select>
              </label>
              <label>
                <span>Treatment</span>
                <select data-treatment></select>
              </label>
              <label>
                <span>Facet orientation</span>
                <select data-facet-orientation></select>
              </label>
              <button type="submit" class="detached-editor-apply">Apply</button>
            </form>
          </div>
        </div>
      </article>
    </main>
  `

  const terminalHost = rootElement.querySelector<HTMLElement>('.detached-terminal')
  const paneElement = rootElement.querySelector<HTMLElement>('.detached-pane')
  const titleElement = rootElement.querySelector<HTMLElement>('[data-title]')
  const subtitleElement = rootElement.querySelector<HTMLElement>('[data-subtitle]')
  const editor = rootElement.querySelector<HTMLFormElement>('[data-editor]')
  const profileSelect = rootElement.querySelector<HTMLSelectElement>('[data-profile]')
  const materialSelect = rootElement.querySelector<HTMLSelectElement>('[data-material]')
  const treatmentSelect = rootElement.querySelector<HTMLSelectElement>('[data-treatment]')
  const facetOrientationSelect = rootElement.querySelector<HTMLSelectElement>('[data-facet-orientation]')
  const configChannel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(DETACHED_PANE_CONFIG_CHANNEL)

  if (!terminalHost) {
    return
  }

  const terminal = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'Cascadia Mono, Menlo, Monaco, monospace',
    fontSize: 14,
    theme: {
      background: '#050b10',
      foreground: '#d8e4ea',
      cursor: '#8be9fd',
      selectionBackground: '#26485a'
    }
  })
  const fitAddon = new FitAddon()
  let locked = false
  let alwaysOnTop = true
  let lastWrittenSeq = 0
  let isReplaying = true
  let pendingLiveEvents: TerminalDataEvent[] = []

  terminal.loadAddon(fitAddon)
  terminal.open(terminalHost)
  fitAddon.fit()
  terminal.focus()
  void window.terminalApi.notifyDetachedWindowReady({
    ptyId: currentPane.ptyId ?? lastKnownPtyId,
    paneId: currentPane.paneId
  })

  const writeEvent = (event: TerminalDataEvent): void => {
    if (event.ptyId !== currentPane.ptyId || event.seq <= lastWrittenSeq) {
      return
    }

    terminal.write(event.data)
    lastWrittenSeq = event.seq
  }

  const flushReplayAndPending = (replayEvents: TerminalDataEvent[]): void => {
    const events = [...replayEvents, ...pendingLiveEvents]
      .filter((event) => event.ptyId === currentPane.ptyId)
      .sort((a, b) => a.seq - b.seq)

    for (const event of events) {
      writeEvent(event)
    }

    pendingLiveEvents = []
    isReplaying = false
  }

  window.terminalApi.onData((event) => {
    if (event.ptyId !== currentPane.ptyId) {
      return
    }

    if (isReplaying) {
      pendingLiveEvents.push(event)
      return
    }

    writeEvent(event)
  })

  terminal.onData((data) => {
    if (!currentPane.ptyId) {
      return
    }

    window.terminalApi.write({ ptyId: currentPane.ptyId, data })
  })

  const resize = (): void => {
    fitAddon.fit()
    if (!currentPane.ptyId) {
      return
    }

    window.terminalApi.resize({ ptyId: currentPane.ptyId, cols: terminal.cols, rows: terminal.rows })
  }

  new ResizeObserver(resize).observe(terminalHost)
  window.addEventListener('resize', resize)

  if (currentPane.ptyId) {
    window.terminalApi
      .replayData({ ptyId: currentPane.ptyId })
      .then(flushReplayAndPending)
      .catch(() => flushReplayAndPending([]))
  } else {
    flushReplayAndPending([])
  }

  rootElement.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', async () => {
    await window.terminalApi.closeDetachedWindow({ ptyId: currentPane.ptyId ?? lastKnownPtyId, paneId: currentPane.paneId })
  })

  rootElement.querySelector<HTMLButtonElement>('[data-lock]')?.addEventListener('click', async (event) => {
    locked = !locked
    document.body.classList.toggle('detached-locked', locked)
    rootElement.querySelector('.detached-pane')?.classList.toggle('locked', locked)
    ;(event.currentTarget as HTMLButtonElement).textContent = locked ? '🔒' : '🔓'
    ;(event.currentTarget as HTMLButtonElement).title = locked ? 'Unlock' : 'Lock'
    await window.terminalApi.updateDetachedWindow({ locked })
  })

  rootElement.querySelector<HTMLButtonElement>('[data-pin]')?.addEventListener('click', async (event) => {
    alwaysOnTop = !alwaysOnTop
    ;(event.currentTarget as HTMLButtonElement).textContent = alwaysOnTop ? '⌖' : '◇'
    ;(event.currentTarget as HTMLButtonElement).title = alwaysOnTop ? 'Unpin' : 'Pin'
    await window.terminalApi.updateDetachedWindow({ alwaysOnTop })
  })

  rootElement.querySelector<HTMLButtonElement>('[data-edit]')?.addEventListener('click', () => {
    if (!editor) {
      return
    }

    editor.hidden = !editor.hidden
    populateEditorControls()
    configChannel?.postMessage({
      type: 'detached-pane-config:request',
      paneId: currentPane.paneId
    } satisfies DetachedPaneConfigMessage)
  })

  rootElement.querySelector<HTMLButtonElement>('[data-cancel-edit]')?.addEventListener('click', () => {
    if (editor) {
      editor.hidden = true
    }
  })

  editor?.addEventListener('submit', (event) => {
    event.preventDefault()
    const draft: DetachedPaneAppearanceDraft = {
      profileId: profileSelect?.value || currentPane.profileId,
      material: materialSelect?.value ?? currentPane.material,
      treatment: treatmentSelect?.value ?? currentPane.treatment,
      facetOrientation: facetOrientationSelect?.value ?? currentPane.facetOrientation
    }
    const isProfileChanging = currentPane.profileId !== draft.profileId

    if (isProfileChanging && isActiveDetachedPaneSession(currentPane)) {
      const confirmed = window.confirm(
        `Change profile for ${currentPane.title}? This will stop the current terminal session before launching the replacement profile.`
      )

      if (!confirmed) {
        return
      }
    }

    applySnapshot({
      ...currentPane,
      ...draft,
      material: getAllowedValue(draft.material, MATERIALS, currentPane.material),
      treatment: getAllowedValue(draft.treatment, TREATMENTS, currentPane.treatment),
      facetOrientation: getAllowedValue(draft.facetOrientation, FACET_ORIENTATIONS, currentPane.facetOrientation)
    })
    configChannel?.postMessage({
      type: 'detached-pane-config:update',
      paneId: currentPane.paneId,
      draft
    } satisfies DetachedPaneConfigMessage)
  })

  if (configChannel) {
    configChannel.onmessage = (event: MessageEvent<DetachedPaneConfigMessage>) => {
      const message = event.data

      if (message.type === 'detached-pane-config:snapshot' && message.snapshot.paneId === currentPane.paneId) {
        applySnapshot(message.snapshot)
        return
      }

      if (message.type === 'detached-pane-config:result' && message.paneId === currentPane.paneId && !message.ok) {
        window.alert(message.message ?? 'Could not apply detached pane changes.')
      }
    }
    configChannel.postMessage({
      type: 'detached-pane-config:request',
      paneId: currentPane.paneId
    } satisfies DetachedPaneConfigMessage)
  }

  function applySnapshot(snapshot: Omit<DetachedPaneConfigSnapshot, 'profiles'> & Partial<Pick<DetachedPaneConfigSnapshot, 'profiles'>>): void {
    const previousPtyId = currentPane.ptyId
    currentPane = {
      ...currentPane,
      ...snapshot,
      material: getAllowedValue(snapshot.material, MATERIALS, currentPane.material),
      treatment: getAllowedValue(snapshot.treatment, TREATMENTS, currentPane.treatment),
      facetOrientation: getAllowedValue(snapshot.facetOrientation, FACET_ORIENTATIONS, currentPane.facetOrientation),
      profiles: snapshot.profiles ?? currentPane.profiles
    }
    if (currentPane.ptyId) {
      lastKnownPtyId = currentPane.ptyId
    }

    updatePaneChrome()
    populateEditorControls()

    if (!currentPane.ptyId && previousPtyId) {
      terminal.reset()
      lastWrittenSeq = 0
      pendingLiveEvents = []
      isReplaying = false
      return
    }

    if (currentPane.ptyId && currentPane.ptyId !== previousPtyId) {
      terminal.reset()
      lastWrittenSeq = 0
      pendingLiveEvents = []
      isReplaying = true
      window.terminalApi
        .replayData({ ptyId: currentPane.ptyId })
        .then(flushReplayAndPending)
        .catch(() => flushReplayAndPending([]))
      resize()
    }
  }

  function updatePaneChrome(): void {
    if (paneElement) {
      paneElement.className = `gem-pane detached-pane active material-${currentPane.material} treatment-${currentPane.treatment} orientation-${currentPane.facetOrientation} status-${currentPane.status}`
      paneElement.dataset.paneStatus = currentPane.status
    }

    if (titleElement) {
      titleElement.textContent = currentPane.title
    }

    if (subtitleElement) {
      subtitleElement.textContent = currentPane.subtitle
    }
  }

  function populateEditorControls(): void {
    if (profileSelect) {
      const hasCurrentProfile = currentPane.profiles.some((profile) => profile.id === currentPane.profileId)
      const profileOptions = currentPane.profiles.map(
        (profile) =>
          `<option value="${escapeHtml(profile.id)}"${profile.id === currentPane.profileId ? ' selected' : ''}>${escapeHtml(profile.name)}</option>`
      )

      profileSelect.innerHTML = [
        ...(hasCurrentProfile
          ? []
          : [`<option value="" selected disabled>${currentPane.profileId ? 'Current profile unavailable' : 'Loading profiles...'}</option>`]),
        ...profileOptions
      ].join('')
    }

    populateSelect(materialSelect, MATERIALS, currentPane.material, formatMaterial)
    populateSelect(treatmentSelect, TREATMENTS, currentPane.treatment, formatTreatment)
    populateSelect(facetOrientationSelect, FACET_ORIENTATIONS, currentPane.facetOrientation, formatFacetOrientation)
  }
}

function populateSelect<T extends string>(
  select: HTMLSelectElement | null,
  values: readonly T[],
  selectedValue: T,
  formatter: (value: T) => string
): void {
  if (!select) {
    return
  }

  select.innerHTML = values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(formatter(value))}</option>`
    )
    .join('')
}

function getAllowedValue<T extends string>(value: string | null, allowedValues: readonly T[], fallback: T): T {
  return value && allowedValues.includes(value as T) ? (value as T) : fallback
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

function isActiveDetachedPaneSession(pane: Pick<DetachedPaneModel, 'ptyId' | 'status'>): boolean {
  return Boolean(pane.ptyId) || pane.status === 'running' || pane.status === 'starting'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
