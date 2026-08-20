import { useRef, useEffect } from 'react'
import {
  CALL_COLORS as CALL_PALETTE,
  CHART,
  UNKNOWN_SERIES_COLOR,
  getPitchColor,
  readableInkOn,
} from '../../utils/chartTheme'
import type { PlayEvent } from '../../api/types'

interface ZonePlotProps {
  zone?: number | null
  size?: number
  pitchType?: string
  callCode?: string
  pitches?: PlayEvent[]
}

/** Gameday call codes mapped onto the four semantic call slots. */
const CALL_COLORS: Record<string, string> = {
  B: CALL_PALETTE.ball,
  C: CALL_PALETTE.strike,
  S: CALL_PALETTE.strike,
  F: CALL_PALETTE.foul,
  X: CALL_PALETTE.inplay,
  E: CALL_PALETTE.inplay,
}

const PADDING = 12
const DOT_RADIUS = 6

/** Below this canvas size the 3x3 grid plus 12px dots leaves no legible room for a legend. */
const LEGEND_MIN_SIZE = 172
const LEGEND_ROW_HEIGHT = 13
const LEGEND_MAX_ROWS = 2
const LEGEND_SWATCH_SIZE = 7
const LEGEND_LABEL_GAP = 3
const LEGEND_ITEM_GAP = 10
const LEGEND_TOP_GAP = 4
const LEGEND_FONT = '9px system-ui, sans-serif'

/** Half the plate width plus a ball radius, in feet — the horizontal span the grid represents. */
const ZONE_HALF_WIDTH_FT = 0.83
const DEFAULT_ZONE_TOP_FT = 3.5
const DEFAULT_ZONE_BOTTOM_FT = 1.5

interface GridBox {
  left: number
  top: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

interface Cell {
  col: number
  row: number
}

interface Dot {
  x: number
  y: number
  color: string
  label: string
}

interface LegendLayout {
  rows: string[][]
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Gameday zone 1-9 is the 3x3 grid (catcher's view); 11-14 are the outer quadrants. */
function zoneToCell(zone: number): Cell | null {
  if (zone >= 1 && zone <= 9) {
    return { col: (zone - 1) % 3, row: Math.floor((zone - 1) / 3) }
  }
  const outer: Record<number, Cell> = {
    10: { col: -0.5, row: -0.5 },
    11: { col: 1, row: -0.5 },
    12: { col: 2.5, row: -0.5 },
    13: { col: -0.5, row: 1 },
    14: { col: 2.5, row: 1 },
  }
  return outer[zone] ?? null
}

function cellToPoint(cell: Cell, grid: GridBox): Point {
  return {
    x: grid.left + (grid.width / 3) * (cell.col + 0.5),
    y: grid.top + (grid.height / 3) * (cell.row + 0.5),
  }
}

/**
 * Prefers plate-crossing coordinates (pX/pZ, in feet) for precise placement and falls back to the
 * Gameday zone cell centre. pX grows to the catcher's right, matching the zone-cell column order.
 */
function pitchToPoint(pitch: PlayEvent, grid: GridBox): Point | null {
  const data = pitch.pitchData
  if (!data) return null

  const coords = data.coordinates
  const top = Number.isFinite(data.strikeZoneTop) ? data.strikeZoneTop : DEFAULT_ZONE_TOP_FT
  const bottom = Number.isFinite(data.strikeZoneBottom) ? data.strikeZoneBottom : DEFAULT_ZONE_BOTTOM_FT
  const span = top - bottom

  if (coords && Number.isFinite(coords.pX) && Number.isFinite(coords.pZ) && span > 0) {
    return {
      x: grid.left + ((coords.pX + ZONE_HALF_WIDTH_FT) / (ZONE_HALF_WIDTH_FT * 2)) * grid.width,
      y: grid.top + ((top - coords.pZ) / span) * grid.height,
    }
  }

  const cell = zoneToCell(data.zone)
  return cell ? cellToPoint(cell, grid) : null
}

function collectLegendCodes(pitches: PlayEvent[] | undefined, pitchType: string | undefined): string[] {
  const codes: string[] = []
  if (pitches && pitches.length > 0) {
    for (const pitch of pitches) {
      const code = pitch.details?.type?.code
      if (code && !codes.includes(code)) codes.push(code)
    }
    return codes
  }
  if (pitchType) codes.push(pitchType)
  return codes
}

function layoutLegend(codes: string[], ctx: CanvasRenderingContext2D, innerWidth: number): LegendLayout {
  if (codes.length === 0) return { rows: [], height: 0 }

  ctx.font = LEGEND_FONT
  const rows: string[][] = [[]]
  let used = 0

  for (const code of codes) {
    const itemWidth =
      LEGEND_SWATCH_SIZE + LEGEND_LABEL_GAP + ctx.measureText(code).width + LEGEND_ITEM_GAP
    const current = rows[rows.length - 1]
    if (used + itemWidth > innerWidth && current.length > 0) {
      if (rows.length >= LEGEND_MAX_ROWS) break
      rows.push([])
      used = 0
    }
    rows[rows.length - 1].push(code)
    used += itemWidth
  }

  const filled = rows.filter((row) => row.length > 0)
  return { rows: filled, height: filled.length * LEGEND_ROW_HEIGHT + LEGEND_TOP_GAP }
}

function drawLegend(ctx: CanvasRenderingContext2D, layout: LegendLayout, origin: Point): void {
  ctx.font = LEGEND_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  layout.rows.forEach((row, rowIndex) => {
    const centreY = origin.y + LEGEND_TOP_GAP + rowIndex * LEGEND_ROW_HEIGHT + LEGEND_ROW_HEIGHT / 2
    let cursorX = origin.x
    for (const code of row) {
      ctx.fillStyle = getPitchColor(code)
      ctx.fillRect(cursorX, centreY - LEGEND_SWATCH_SIZE / 2, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE)
      cursorX += LEGEND_SWATCH_SIZE + LEGEND_LABEL_GAP
      ctx.fillStyle = CHART.legendLabel
      ctx.fillText(code, cursorX, centreY)
      cursorX += ctx.measureText(code).width + LEGEND_ITEM_GAP
    }
  })
}

function drawGrid(ctx: CanvasRenderingContext2D, grid: GridBox): void {
  const cellW = grid.width / 3
  const cellH = grid.height / 3

  ctx.strokeStyle = CHART.grid
  ctx.lineWidth = 1
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(grid.left + cellW * i, grid.top)
    ctx.lineTo(grid.left + cellW * i, grid.top + grid.height)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(grid.left, grid.top + cellH * i)
    ctx.lineTo(grid.left + grid.width, grid.top + cellH * i)
    ctx.stroke()
  }

  ctx.strokeStyle = CHART.axis
  ctx.lineWidth = 2
  ctx.strokeRect(grid.left, grid.top, grid.width, grid.height)
}

function drawNumberedDot(ctx: CanvasRenderingContext2D, dot: Dot): void {
  ctx.fillStyle = dot.color
  ctx.beginPath()
  ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = CHART.markerStroke
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = readableInkOn(dot.color)
  ctx.font = `bold ${dot.label.length > 1 ? 7 : 8}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(dot.label, dot.x, dot.y)
}

function drawSinglePitch(ctx: CanvasRenderingContext2D, cell: Cell, grid: GridBox): void {
  const point = cellToPoint(cell, grid)
  ctx.beginPath()
  ctx.arc(point.x, point.y, DOT_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

export function ZonePlot({ zone, size = 150, pitchType, callCode, pitches }: ZonePlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = CHART.background
    ctx.fillRect(0, 0, size, size)

    const innerWidth = size - PADDING * 2
    const showLegend = size >= LEGEND_MIN_SIZE
    const legend = showLegend
      ? layoutLegend(collectLegendCodes(pitches, pitchType), ctx, innerWidth)
      : { rows: [], height: 0 }

    const grid: GridBox = {
      left: PADDING,
      top: PADDING,
      width: innerWidth,
      height: size - PADDING * 2 - legend.height,
    }
    if (grid.height <= 0) return

    drawGrid(ctx, grid)

    const plotBottom = grid.top + grid.height + PADDING
    const sequence = pitches ?? []

    if (sequence.length > 0) {
      sequence.forEach((pitch, index) => {
        const point = pitchToPoint(pitch, grid)
        if (!point) return
        const code = pitch.details?.type?.code
        drawNumberedDot(ctx, {
          x: clamp(point.x, DOT_RADIUS + 1, size - DOT_RADIUS - 1),
          y: clamp(point.y, DOT_RADIUS + 1, plotBottom - DOT_RADIUS - 1),
          color: getPitchColor(code),
          label: String(index + 1),
        })
      })
    } else if (zone !== null && zone !== undefined) {
      const cell = zoneToCell(zone)
      if (cell) {
        ctx.fillStyle = callCode ? CALL_COLORS[callCode] ?? UNKNOWN_SERIES_COLOR : UNKNOWN_SERIES_COLOR
        ctx.strokeStyle = getPitchColor(pitchType)
        ctx.lineWidth = 2
        drawSinglePitch(ctx, cell, grid)
      }
    }

    if (legend.rows.length > 0) {
      drawLegend(ctx, legend, { x: PADDING, y: grid.top + grid.height })
    }
  }, [zone, size, pitchType, callCode, pitches])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />
}
