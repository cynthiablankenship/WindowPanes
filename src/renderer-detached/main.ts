import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { TerminalDataEvent } from '../shared'
import './styles.css'

const root = document.getElementById('root')
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const ptyId = params.get('ptyId')
const title = params.get('title') ?? 'Detached Pane'

if (!root || !ptyId) {
  document.body.textContent = 'Detached pane is missing a terminal session.'
} else {
  renderDetachedPane(root, ptyId, title)
}

function renderDetachedPane(rootElement: HTMLElement, activePtyId: string, paneTitle: string): void {
  rootElement.innerHTML = `
    <section class="detached-pane">
      <header class="detached-titlebar">
        <div>
          <strong>${escapeHtml(paneTitle)}</strong>
          <span>Detached desktop pane</span>
        </div>
        <div class="detached-actions">
          <button type="button" data-lock>Lock</button>
          <button type="button" data-pin>Unpin</button>
        </div>
      </header>
      <div class="detached-terminal"></div>
    </section>
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
    if (event.ptyId !== activePtyId || event.seq <= lastWrittenSeq) {
      return
    }

    terminal.write(event.data)
    lastWrittenSeq = event.seq
  }

  const flushReplayAndPending = (replayEvents: TerminalDataEvent[]): void => {
    const events = [...replayEvents, ...pendingLiveEvents]
      .filter((event) => event.ptyId === activePtyId)
      .sort((a, b) => a.seq - b.seq)

    for (const event of events) {
      writeEvent(event)
    }

    pendingLiveEvents = []
    isReplaying = false
  }

  window.terminalApi.onData((event) => {
    if (event.ptyId !== activePtyId) {
      return
    }

    if (isReplaying) {
      pendingLiveEvents.push(event)
      return
    }

    writeEvent(event)
  })

  terminal.onData((data) => {
    window.terminalApi.write({ ptyId: activePtyId, data })
  })

  const resize = (): void => {
    fitAddon.fit()
    window.terminalApi.resize({ ptyId: activePtyId, cols: terminal.cols, rows: terminal.rows })
  }

  new ResizeObserver(resize).observe(terminalHost)
  window.addEventListener('resize', resize)

  window.terminalApi
    .replayData({ ptyId: activePtyId })
    .then(flushReplayAndPending)
    .catch(() => flushReplayAndPending([]))

  rootElement.querySelector<HTMLButtonElement>('[data-lock]')?.addEventListener('click', async (event) => {
    locked = !locked
    rootElement.querySelector('.detached-pane')?.classList.toggle('locked', locked)
    ;(event.currentTarget as HTMLButtonElement).textContent = locked ? 'Unlock' : 'Lock'
    await window.terminalApi.updateDetachedWindow({ locked })
  })

  rootElement.querySelector<HTMLButtonElement>('[data-pin]')?.addEventListener('click', async (event) => {
    alwaysOnTop = !alwaysOnTop
    ;(event.currentTarget as HTMLButtonElement).textContent = alwaysOnTop ? 'Unpin' : 'Pin'
    await window.terminalApi.updateDetachedWindow({ alwaysOnTop })
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
