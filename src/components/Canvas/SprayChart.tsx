import { useRef, useEffect } from 'react'
import { BASE_VALUE_COLORS, CHART, FIELD } from '../../utils/chartTheme'
import type { SavantBattedBall } from '../../api/types'

interface SprayChartProps {
  data: ReadonlyArray<SavantBattedBall>
  width?: number
  height?: number
}

/**
 * Statcast reports landing spots as pixels in a fixed 250x250 frame with home
 * plate at (125.42, 198.27) and y growing toward the backstop. Scaling the
 * offset by 2.29 ft/px puts a dead-centre home run on the 400 ft arc, which is
 * the calibration the public Savant charts use.
 */
const HOME_X = 125.42
const HOME_Y = 198.27
const FEET_PER_UNIT = 2.29

const BASE_DISTANCE_FT = 90
const MOUND_DISTANCE_FT = 60.5
const MOUND_RADIUS_FT = 9
const INFIELD_ARC_FT = 95
const HOME_CIRCLE_FT = 13
const BASEPATH_WIDTH_FT = 6
const BASE_SIZE_FT = 4.5
const WARNING_TRACK_FT = 14
const FOUL_LINE_FT = 330
const CENTER_FIELD_FT = 400
const FOUL_BEARING = Math.PI / 4

const VIEW_HALF_WIDTH_FT = 248
const VIEW_DEPTH_FT = 418

const LEGEND_HEIGHT = 22
const LEGEND_DOT_GAP = 5
const LEGEND_ITEM_GAP = 11
const EDGE_PAD = 4
const ARC_STEPS = 56

type BaseValue = 0 | 1 | 2 | 3 | 4

interface Point {
  x: number
  y: number
}

interface Marker {
  x: number
  y: number
  bases: BaseValue
}

interface MarkerStyle {
  label: string
  color: string
  radius: number
}

type Project = (fieldX: number, fieldY: number) => Point

const BASES_BY_EVENT: Readonly<Record<string, BaseValue>> = {
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
}

const MARKER_STYLES: Readonly<Record<BaseValue, MarkerStyle>> = {
  0: { label: 'Out', color: BASE_VALUE_COLORS.out, radius: 2.6 },
  1: { label: '1B', color: BASE_VALUE_COLORS.single, radius: 3.4 },
  2: { label: '2B', color: BASE_VALUE_COLORS.double, radius: 4.2 },
  3: { label: '3B', color: BASE_VALUE_COLORS.triple, radius: 5 },
  4: { label: 'HR', color: BASE_VALUE_COLORS.home_run, radius: 5.8 },
}

const LEGEND_ORDER: readonly BaseValue[] = [0, 1, 2, 3, 4]

/** Fence distance for a bearing measured off the centre-field axis. */
function fenceRadius(bearing: number): number {
  return FOUL_LINE_FT + (CENTER_FIELD_FT - FOUL_LINE_FT) * Math.cos(2 * bearing)
}

/**
 * Where a foul line meets the infield arc, from solving
 * `t^2 - 2*d*cos(theta)*t + (d^2 - r^2) = 0` for the arc centred on the rubber.
 */
function foulLineArcDistance(): number {
  const alongAxis = MOUND_DISTANCE_FT * Math.cos(FOUL_BEARING)
  const discriminant =
    alongAxis * alongAxis - MOUND_DISTANCE_FT * MOUND_DISTANCE_FT + INFIELD_ARC_FT * INFIELD_ARC_FT
  return alongAxis + Math.sqrt(Math.max(discriminant, 0))
}

function bearingPoint(bearing: number, radius: number): Point {
  return { x: radius * Math.sin(bearing), y: radius * Math.cos(bearing) }
}

function diamondCorners(project: Project): Point[] {
  const leg = BASE_DISTANCE_FT / Math.SQRT2
  return [
    project(0, 0),
    project(leg, leg),
    project(0, BASE_DISTANCE_FT * Math.SQRT2),
    project(-leg, leg),
  ]
}

/**
 * Field space puts home plate at the origin with +x toward right field and +y
 * toward centre field, so the projection only has to flip y and scale.
 */
function toMarkers(data: ReadonlyArray<SavantBattedBall>): Marker[] {
  const markers: Marker[] = []
  for (const ball of data) {
    if (!ball.hc_x || !ball.hc_y || !ball.events) continue
    const rawX = Number.parseFloat(ball.hc_x)
    const rawY = Number.parseFloat(ball.hc_y)
    if (Number.isNaN(rawX) || Number.isNaN(rawY)) continue
    markers.push({
      x: (rawX - HOME_X) * FEET_PER_UNIT,
      y: (HOME_Y - rawY) * FEET_PER_UNIT,
      bases: BASES_BY_EVENT[ball.events] ?? 0,
    })
  }
  return markers.sort((a, b) => a.bases - b.bases)
}

function tracePlayingSurface(ctx: CanvasRenderingContext2D, project: Project, inset: number): void {
  const home = project(0, 0)
  ctx.beginPath()
  ctx.moveTo(home.x, home.y)
  for (let step = 0; step <= ARC_STEPS; step += 1) {
    const bearing = -FOUL_BEARING + (2 * FOUL_BEARING * step) / ARC_STEPS
    const edge = bearingPoint(bearing, fenceRadius(bearing) - inset)
    const point = project(edge.x, edge.y)
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
}

function traceInfieldDirt(ctx: CanvasRenderingContext2D, project: Project): void {
  const corner = foulLineArcDistance()
  const left = bearingPoint(-FOUL_BEARING, corner)
  const right = bearingPoint(FOUL_BEARING, corner)
  const startAngle = Math.atan2(left.y - MOUND_DISTANCE_FT, left.x)
  const endAngle = Math.atan2(right.y - MOUND_DISTANCE_FT, right.x)
  const home = project(0, 0)

  ctx.beginPath()
  ctx.moveTo(home.x, home.y)
  for (let step = 0; step <= ARC_STEPS; step += 1) {
    const angle = startAngle + ((endAngle - startAngle) * step) / ARC_STEPS
    const point = project(
      INFIELD_ARC_FT * Math.cos(angle),
      MOUND_DISTANCE_FT + INFIELD_ARC_FT * Math.sin(angle),
    )
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
}

function traceDiamond(ctx: CanvasRenderingContext2D, project: Project): void {
  const corners = diamondCorners(project)
  ctx.beginPath()
  corners.forEach((corner, index) => {
    if (index === 0) ctx.moveTo(corner.x, corner.y)
    else ctx.lineTo(corner.x, corner.y)
  })
  ctx.closePath()
}

function fillCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  color: string,
): void {
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function drawBases(ctx: CanvasRenderingContext2D, project: Project, scale: number): void {
  const side = Math.max(BASE_SIZE_FT * scale, 3)
  ctx.fillStyle = FIELD.chalk
  ctx.strokeStyle = FIELD.fence
  ctx.lineWidth = 0.75
  for (const spot of diamondCorners(project)) {
    ctx.beginPath()
    ctx.rect(spot.x - side / 2, spot.y - side / 2, side, side)
    ctx.fill()
    ctx.stroke()
  }
}

function drawFoulLines(ctx: CanvasRenderingContext2D, project: Project): void {
  const pole = fenceRadius(FOUL_BEARING)
  const left = bearingPoint(-FOUL_BEARING, pole)
  const right = bearingPoint(FOUL_BEARING, pole)
  const home = project(0, 0)
  const leftEnd = project(left.x, left.y)
  const rightEnd = project(right.x, right.y)
  ctx.strokeStyle = FIELD.chalk
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(leftEnd.x, leftEnd.y)
  ctx.lineTo(home.x, home.y)
  ctx.lineTo(rightEnd.x, rightEnd.y)
  ctx.stroke()
}

function drawField(ctx: CanvasRenderingContext2D, project: Project, scale: number): void {
  tracePlayingSurface(ctx, project, 0)
  ctx.fillStyle = FIELD.warningTrack
  ctx.fill()

  tracePlayingSurface(ctx, project, WARNING_TRACK_FT)
  ctx.fillStyle = FIELD.grass
  ctx.fill()

  traceInfieldDirt(ctx, project)
  ctx.fillStyle = FIELD.dirt
  ctx.fill()

  traceDiamond(ctx, project)
  ctx.fillStyle = FIELD.grassAlt
  ctx.fill()
  ctx.strokeStyle = FIELD.dirt
  ctx.lineWidth = Math.max(BASEPATH_WIDTH_FT * scale, 2)
  ctx.lineJoin = 'round'
  ctx.stroke()

  fillCircle(ctx, project(0, MOUND_DISTANCE_FT), Math.max(MOUND_RADIUS_FT * scale, 2), FIELD.dirt)
  fillCircle(ctx, project(0, 0), Math.max(HOME_CIRCLE_FT * scale, 3), FIELD.dirt)

  drawFoulLines(ctx, project)

  tracePlayingSurface(ctx, project, 0)
  ctx.strokeStyle = FIELD.fence
  ctx.lineWidth = 1.25
  ctx.stroke()

  drawBases(ctx, project, scale)
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  project: Project,
  markers: readonly Marker[],
): void {
  for (const marker of markers) {
    const style = MARKER_STYLES[marker.bases]
    const point = project(marker.x, marker.y)
    ctx.globalAlpha = marker.bases === 0 ? 0.6 : 0.95
    fillCircle(ctx, point, style.radius, style.color)
    if (marker.bases > 0) {
      ctx.strokeStyle = CHART.markerStroke
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

function drawLegend(ctx: CanvasRenderingContext2D, width: number, baseline: number): void {
  ctx.font = '9px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  const styles = LEGEND_ORDER.map((bases) => MARKER_STYLES[bases])
  const widths = styles.map(
    (style) => style.radius * 2 + LEGEND_DOT_GAP + ctx.measureText(style.label).width,
  )
  const total = widths.reduce((sum, value) => sum + value, 0) + LEGEND_ITEM_GAP * (styles.length - 1)

  let cursor = Math.max((width - total) / 2, EDGE_PAD)
  styles.forEach((style, index) => {
    fillCircle(ctx, { x: cursor + style.radius, y: baseline }, style.radius, style.color)
    ctx.fillStyle = CHART.legendLabel
    ctx.fillText(style.label, cursor + style.radius * 2 + LEGEND_DOT_GAP, baseline)
    cursor += widths[index] + LEGEND_ITEM_GAP
  })
}

export function SprayChart({ data, width = 280, height = 252 }: SprayChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = CHART.background
    ctx.fillRect(0, 0, width, height)

    const plotWidth = width - EDGE_PAD * 2
    const plotHeight = height - LEGEND_HEIGHT - EDGE_PAD * 2
    const scale = Math.min(plotWidth / (VIEW_HALF_WIDTH_FT * 2), plotHeight / VIEW_DEPTH_FT)
    const originY = EDGE_PAD + plotHeight
    const project: Project = (fieldX, fieldY) => ({
      x: width / 2 + fieldX * scale,
      y: originY - fieldY * scale,
    })

    drawField(ctx, project, scale)
    drawMarkers(ctx, project, toMarkers(data))
    drawLegend(ctx, width, height - EDGE_PAD - LEGEND_HEIGHT / 2)
  }, [data, width, height])

  return <canvas ref={canvasRef} style={{ width, height }} />
}
