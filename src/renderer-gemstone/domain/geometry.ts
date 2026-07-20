export interface CanvasSize {
  width: number
  height: number
}

export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RECOVERY_EDGE_PX = 48
export const MIN_PANE_WIDTH_PX = 320
export const MIN_PANE_HEIGHT_PX = 240

export function clampPaneBounds(
  bounds: PixelBounds,
  canvas: CanvasSize,
  options: { minWidth?: number; minHeight?: number; recoveryEdge?: number } = {}
): PixelBounds {
  const recoveryEdge = options.recoveryEdge ?? RECOVERY_EDGE_PX
  const minWidth = options.minWidth ?? MIN_PANE_WIDTH_PX
  const minHeight = options.minHeight ?? MIN_PANE_HEIGHT_PX
  const canvasWidth = Math.max(1, canvas.width)
  const canvasHeight = Math.max(1, canvas.height)
  const width = Math.max(minWidth, Math.round(bounds.width))
  const height = Math.max(minHeight, Math.round(bounds.height))

  return {
    x: clamp(Math.round(bounds.x), recoveryEdge - width, canvasWidth - recoveryEdge),
    y: clamp(Math.round(bounds.y), recoveryEdge - height, canvasHeight - recoveryEdge),
    width,
    height
  }
}

export function movePaneBounds(bounds: PixelBounds, deltaX: number, deltaY: number, canvas: CanvasSize): PixelBounds {
  return clampPaneBounds(
    {
      ...bounds,
      x: bounds.x + deltaX,
      y: bounds.y + deltaY
    },
    canvas
  )
}

export function resizePaneBounds(
  bounds: PixelBounds,
  deltaX: number,
  deltaY: number,
  handle: ResizeHandle,
  canvas: CanvasSize
): PixelBounds {
  const nextBounds = { ...bounds }

  if (handle.includes('e')) {
    nextBounds.width += deltaX
  }

  if (handle.includes('s')) {
    nextBounds.height += deltaY
  }

  if (handle.includes('w')) {
    nextBounds.x += deltaX
    nextBounds.width -= deltaX
  }

  if (handle.includes('n')) {
    nextBounds.y += deltaY
    nextBounds.height -= deltaY
  }

  return clampPaneBounds(nextBounds, canvas)
}

export function fitPaneBoundsOnscreen(
  bounds: PixelBounds,
  canvas: CanvasSize,
  margin = 24
): PixelBounds {
  const canvasWidth = Math.max(1, Math.round(canvas.width))
  const canvasHeight = Math.max(1, Math.round(canvas.height))
  const safeMargin = Math.max(0, Math.round(margin))
  const maxWidth = Math.max(MIN_PANE_WIDTH_PX, canvasWidth - safeMargin * 2)
  const maxHeight = Math.max(MIN_PANE_HEIGHT_PX, canvasHeight - safeMargin * 2)
  const width = Math.min(Math.max(MIN_PANE_WIDTH_PX, Math.round(bounds.width)), maxWidth)
  const height = Math.min(Math.max(MIN_PANE_HEIGHT_PX, Math.round(bounds.height)), maxHeight)
  const maxX = Math.max(safeMargin, canvasWidth - width - safeMargin)
  const maxY = Math.max(safeMargin, canvasHeight - height - safeMargin)

  return {
    x: clamp(Math.round(bounds.x), safeMargin, maxX),
    y: clamp(Math.round(bounds.y), safeMargin, maxY),
    width,
    height
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
