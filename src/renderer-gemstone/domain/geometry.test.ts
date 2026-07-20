import { describe, expect, it } from 'vitest'
import {
  RECOVERY_EDGE_PX,
  clampPaneBounds,
  fitPaneBoundsOnscreen,
  movePaneBounds,
  resizePaneBounds,
  type CanvasSize,
  type PixelBounds
} from './geometry'

const canvas: CanvasSize = { width: 1000, height: 700 }

describe('gemstone pane geometry', () => {
  it('keeps a symmetric recovery edge visible on all four sides while moving', () => {
    const bounds: PixelBounds = { x: 300, y: 180, width: 420, height: 300 }

    expect(movePaneBounds(bounds, -900, 0, canvas).x).toBe(RECOVERY_EDGE_PX - bounds.width)
    expect(movePaneBounds(bounds, 900, 0, canvas).x).toBe(canvas.width - RECOVERY_EDGE_PX)
    expect(movePaneBounds(bounds, 0, -900, canvas).y).toBe(RECOVERY_EDGE_PX - bounds.height)
    expect(movePaneBounds(bounds, 0, 900, canvas).y).toBe(canvas.height - RECOVERY_EDGE_PX)
  })

  it('does not force panes inside the canvas when they are larger than the usable area', () => {
    const bounds = clampPaneBounds({ x: -2000, y: -1400, width: 1400, height: 900 }, canvas)

    expect(bounds.x).toBe(RECOVERY_EDGE_PX - bounds.width)
    expect(bounds.y).toBe(RECOVERY_EDGE_PX - bounds.height)
    expect(clampPaneBounds({ ...bounds, x: 1400, y: 900 }, canvas)).toMatchObject({
      x: canvas.width - RECOVERY_EDGE_PX,
      y: canvas.height - RECOVERY_EDGE_PX
    })
  })

  it('enforces minimum pane size during corner resize', () => {
    const resized = resizePaneBounds(
      { x: 80, y: 90, width: 360, height: 260 },
      500,
      500,
      'nw',
      canvas
    )

    expect(resized.width).toBeGreaterThanOrEqual(320)
    expect(resized.height).toBeGreaterThanOrEqual(240)
    expect(resized.x).toBeLessThanOrEqual(canvas.width - RECOVERY_EDGE_PX)
    expect(resized.y).toBeLessThanOrEqual(canvas.height - RECOVERY_EDGE_PX)
  })

  it('fits lost panes fully onscreen for explicit recovery', () => {
    const fitted = fitPaneBoundsOnscreen({ x: -900, y: 1200, width: 480, height: 320 }, canvas)

    expect(fitted.x).toBeGreaterThanOrEqual(24)
    expect(fitted.y).toBeGreaterThanOrEqual(24)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(canvas.width - 24)
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(canvas.height - 24)
  })
})
