import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { TerminalDataEvent } from '../shared'
import '../renderer-gemstone/styles.css'
import './styles.css'

const root = document.getElementById('root')
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const ptyId = params.get('ptyId')
const title = params.get('title') ?? 'Detached Pane'
const subtitle = params.get('subtitle') || 'Detached desktop pane'
const material = getAllowedValue(params.get('material'), ['diamond', 'onyx', 'opal', 'amethyst', 'cobalt', 'emerald', 'ruby'], 'diamond')
const treatment = getAllowedValue(params.get('treatment'), ['sharp', 'polished', 'architectural'], 'sharp')
const facetOrientation = getAllowedValue(params.get('facetOrientation'), ['right', 'left', 'symmetric'], 'right')

if (!root || !ptyId) {
  document.body.textContent = 'Detached pane is missing a terminal session.'
} else {
  renderDetachedPane(root, {
    ptyId,
    title,
    subtitle,
    material,
    treatment,
    facetOrientation
  })
}

interface DetachedPaneModel {
  ptyId: string
  title: string
  subtitle: string
  material: string
  treatment: string
  facetOrientation: string
}

function renderDetachedPane(rootElement: HTMLElement, pane: DetachedPaneModel): void {
  rootElement.innerHTML = `
    <main class="gemstone-workspace detached-workspace">
      <article class="gem-pane detached-pane active material-${pane.material} treatment-${pane.treatment} orientation-${pane.facetOrientation} status-running" data-pane-visible="true" data-pane-selected="true" data-pane-locked="false" data-pane-status="running" style="--pane-x: 0px; --pane-y: 0px;">
        <div class="gem-shadow" aria-hidden="true"></div>
        <div class="gemstone-frame">
          <div class="facet-grid" aria-hidden="true"></div>
          <div class="edge-rim" aria-hidden="true"></div>
          <div class="gem-content-safe">
            <header class="gem-chrome detached-titlebar">
              <div>
                <strong>${escapeHtml(pane.title)}</strong>
                <span class="pane-command-subtitle">${escapeHtml(pane.subtitle)}</span>
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
            </div>
          </div>
        </div>
      </article>
    </main>
  `

  const terminalHost = rootElement.querySelector<HTMLElement>('.detached-terminal')

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

  const writeEvent = (event: TerminalDataEvent): void => {
    if (event.ptyId !== pane.ptyId || event.seq <= lastWrittenSeq) {
      return
    }

    terminal.write(event.data)
    lastWrittenSeq = event.seq
  }

  const flushReplayAndPending = (replayEvents: TerminalDataEvent[]): void => {
    const events = [...replayEvents, ...pendingLiveEvents]
      .filter((event) => event.ptyId === pane.ptyId)
      .sort((a, b) => a.seq - b.seq)

    for (const event of events) {
      writeEvent(event)
    }

    pendingLiveEvents = []
    isReplaying = false
  }

  window.terminalApi.onData((event) => {
    if (event.ptyId !== pane.ptyId) {
      return
    }

    if (isReplaying) {
      pendingLiveEvents.push(event)
      return
    }

    writeEvent(event)
  })

  terminal.onData((data) => {
    window.terminalApi.write({ ptyId: pane.ptyId, data })
  })

  const resize = (): void => {
    fitAddon.fit()
    window.terminalApi.resize({ ptyId: pane.ptyId, cols: terminal.cols, rows: terminal.rows })
  }

  new ResizeObserver(resize).observe(terminalHost)
  window.addEventListener('resize', resize)

  window.terminalApi
    .replayData({ ptyId: pane.ptyId })
    .then(flushReplayAndPending)
    .catch(() => flushReplayAndPending([]))

  rootElement.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', async () => {
    await window.terminalApi.closeDetachedWindow({ ptyId: pane.ptyId })
  })

  rootElement.querySelector<HTMLButtonElement>('[data-lock]')?.addEventListener('click', async (event) => {
    locked = !locked
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
}

function getAllowedValue(value: string | null, allowedValues: string[], fallback: string): string {
  return value && allowedValues.includes(value) ? value : fallback
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
