import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalDataEvent } from '../../shared'
import {
  TERMINAL_RESIZE_DEBOUNCE_MS,
  normalizeTerminalSize,
  shouldSendTerminalResize,
  type TerminalSize
} from '../domain/terminalResize'

interface TerminalPaneProps {
  /** The live pty id for this pane, or null when nothing is running. */
  ptyId: string | null
}

/**
 * Mounts an xterm.js terminal and bridges it to the main-process pty over the
 * existing window.terminalApi IPC contract:
 *   - terminalApi.onData (filtered by ptyId) -> xterm.write   (display output)
 *   - xterm.onData                            -> terminalApi.write (user keystrokes/paste)
 *   - FitAddon                                -> terminalApi.resize (mount + container resize)
 *
 * Provider boundary: the ONLY pty stdin path is xterm.onData, i.e. explicit user
 * keystrokes/paste. There is no programmatic/auto-sent input.
 */
export function TerminalPane({ ptyId }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // Create the xterm instance once for the lifetime of this pane panel.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 14,
      theme: {
        background: '#0a0f14',
        foreground: '#d8e4ea',
        cursor: '#8be9fd',
        selectionBackground: '#26485a'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    fitAddon.fit()

    terminalRef.current = terminal
    fitRef.current = fitAddon

    return () => {
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [])

  // Wire the terminal to the active pty whenever the pty id changes.
  useEffect(() => {
    const terminal = terminalRef.current
    const fitAddon = fitRef.current
    const container = containerRef.current

    if (!terminal || !fitAddon || !container || !ptyId) {
      return
    }

    let lastSentSize: TerminalSize | null = null
    let resizeTimer: number | null = null

    const sendCurrentSize = (): void => {
      fitAddon.fit()
      const nextSize = normalizeTerminalSize({ cols: terminal.cols, rows: terminal.rows })

      if (!shouldSendTerminalResize(lastSentSize, nextSize)) {
        return
      }

      lastSentSize = nextSize
      window.terminalApi.resize({ ptyId, ...nextSize })
    }

    const syncSize = (immediate = false): void => {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer)
        resizeTimer = null
      }

      if (immediate) {
        sendCurrentSize()
        return
      }

      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        sendCurrentSize()
      }, TERMINAL_RESIZE_DEBOUNCE_MS)
    }

    syncSize(true)
    terminal.focus()
    terminal.reset()

    let isSubscribed = true
    let isReplaying = true
    let lastWrittenSeq = 0
    let pendingLiveEvents: TerminalDataEvent[] = []

    const writeEvent = (event: TerminalDataEvent): void => {
      if (event.ptyId !== ptyId || event.seq <= lastWrittenSeq) {
        return
      }

      terminal.write(event.data)
      lastWrittenSeq = event.seq
    }

    const flushReplayAndPending = (replayEvents: TerminalDataEvent[]): void => {
      const events = [...replayEvents, ...pendingLiveEvents]
        .filter((event) => event.ptyId === ptyId)
        .sort((a, b) => a.seq - b.seq)

      for (const event of events) {
        writeEvent(event)
      }

      pendingLiveEvents = []
      isReplaying = false
    }

    const offData = window.terminalApi.onData((event) => {
      if (event.ptyId !== ptyId) {
        return
      }

      if (isReplaying) {
        pendingLiveEvents.push(event)
        return
      }

      writeEvent(event)
    })
    const inputDisposable = terminal.onData((data) => {
      window.terminalApi.write({ ptyId, data })
    })

    const resizeObserver = new ResizeObserver(() => syncSize())
    resizeObserver.observe(container)

    window.terminalApi
      .replayData({ ptyId })
      .then((events) => {
        if (isSubscribed) {
          flushReplayAndPending(events)
        }
      })
      .catch(() => {
        if (isSubscribed) {
          flushReplayAndPending([])
        }
      })

    return () => {
      isSubscribed = false
      offData()
      inputDisposable.dispose()
      resizeObserver.disconnect()
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer)
      }
    }
  }, [ptyId])

  return <div className="terminal-surface" data-pty-id={ptyId ?? undefined} ref={containerRef} />
}
