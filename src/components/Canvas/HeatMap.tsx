import { useRef, useEffect } from 'react'
import { CHART, HEAT_EMPTY, TEMP_COLORS, UNKNOWN_SERIES_COLOR } from '../../utils/chartTheme'
import type { HotColdZone } from '../../api/types'

interface HeatMapProps {
  zones: HotColdZone[]
  size?: number
}

const TEMP_FILLS: Readonly<Record<string, string>> = TEMP_COLORS

export function HeatMap({ zones, size = 150 }: HeatMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const padding = 16
    const w = size - padding * 2
    const h = size - padding * 2
    const cellW = w / 3
    const cellH = h / 3

    ctx.fillStyle = CHART.background
    ctx.fillRect(0, 0, size, size)

    const zoneMap = new Map<number, HotColdZone>()
    for (const z of zones) {
      zoneMap.set(parseInt(z.zone, 10), z)
    }

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const zoneNum = row * 3 + col + 1
        const z = zoneMap.get(zoneNum)
        const x = padding + col * cellW
        const y = padding + row * cellH

        if (z) {
          ctx.fillStyle = TEMP_FILLS[z.temp] ?? UNKNOWN_SERIES_COLOR
          ctx.globalAlpha = 0.6
        } else {
          ctx.fillStyle = HEAT_EMPTY
          ctx.globalAlpha = 1
        }
        ctx.fillRect(x, y, cellW, cellH)
        ctx.globalAlpha = 1

        ctx.strokeStyle = CHART.grid
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, cellW, cellH)

        if (z && z.value) {
          ctx.fillStyle = CHART.ink
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const displayVal = z.value > 1 ? z.value.toFixed(3) : `${(z.value * 100).toFixed(0)}%`
          ctx.fillText(displayVal, x + cellW / 2, y + cellH / 2)
        }
      }
    }

    ctx.strokeStyle = CHART.border
    ctx.lineWidth = 2
    ctx.strokeRect(padding, padding, w, h)

    ctx.fillStyle = CHART.label
    ctx.font = '9px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('K', 2, padding - 2)
  }, [zones, size])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />
}
