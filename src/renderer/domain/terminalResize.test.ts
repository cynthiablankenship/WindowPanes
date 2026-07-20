import { normalizeTerminalSize, shouldSendTerminalResize } from './terminalResize'

describe('terminal resize helpers', () => {
  it('normalizes terminal sizes to positive integer dimensions', () => {
    expect(normalizeTerminalSize({ cols: 0, rows: -3 })).toEqual({ cols: 1, rows: 1 })
    expect(normalizeTerminalSize({ cols: 120.8, rows: 35.2 })).toEqual({ cols: 120, rows: 35 })
  })

  it('suppresses duplicate terminal resize payloads', () => {
    expect(shouldSendTerminalResize(null, { cols: 80, rows: 24 })).toBe(true)
    expect(shouldSendTerminalResize({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
    expect(shouldSendTerminalResize({ cols: 80, rows: 24 }, { cols: 100, rows: 24 })).toBe(true)
    expect(shouldSendTerminalResize({ cols: 80, rows: 24 }, { cols: 80, rows: 30 })).toBe(true)
  })
})
