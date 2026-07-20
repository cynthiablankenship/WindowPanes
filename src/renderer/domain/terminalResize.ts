export interface TerminalSize {
  cols: number
  rows: number
}

export const TERMINAL_RESIZE_DEBOUNCE_MS = 50

export function normalizeTerminalSize(size: TerminalSize): TerminalSize {
  return {
    cols: Math.max(1, Math.floor(size.cols)),
    rows: Math.max(1, Math.floor(size.rows))
  }
}

export function shouldSendTerminalResize(previous: TerminalSize | null, next: TerminalSize): boolean {
  const normalized = normalizeTerminalSize(next)

  return !previous || previous.cols !== normalized.cols || previous.rows !== normalized.rows
}
