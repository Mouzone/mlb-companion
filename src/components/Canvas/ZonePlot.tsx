import { useRef, useEffect } from 'react'
import { PITCH_COLORS } from '../../utils/pitchConstants'

interface ZonePlotProps {
  zone: number | null
  size?: number
  pitchType?: string
  callCode?: string
}

const CALL_COLORS: Record<string, string> = {
  B: '#4488ff',
  C: '#ff4444',
  S: '#ff4444',
  F: '#ffaa44',
  X: '#44ff44',
  E: '#44ff44',
}

export function ZonePlot({ zone, size = 150, pitchType, callCode }: ZonePlotProps) {
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

    const padding = 12
    const w = size - padding * 2
    const h = size - padding * 2
    const cellW = w / 3
    const cellH = h / 3

    ctx.fillStyle = '#0d1b12'
    ctx.fillRect(0, 0, size, size)

    ctx.strokeStyle = '#2a5a3a'
    ctx.lineWidth = 1
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(padding + cellW * i, padding)
      ctx.lineTo(padding + cellW * i, padding + h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padding, padding + cellH * i)
      ctx.lineTo(padding + w, padding + cellH * i)
      ctx.stroke()
    }

    ctx.strokeStyle = '#3a7a4a'
    ctx.lineWidth = 2
    ctx.strokeRect(padding, padding, w, h)

    if (zone !== null && zone >= 1 && zone <= 14) {
      let col: number, row: number
      if (zone <= 9) {
        col = (zone - 1) % 3
        row = Math.floor((zone - 1) / 3)
      } else {
        const outerZones = [
          { z: 10, col: -0.5, row: -0.5 },
          { z: 11, col: 1, row: -0.5 },
          { z: 12, col: 2.5, row: -0.5 },
          { z: 13, col: -0.5, row: 1 },
          { z: 14, col: 2.5, row: 1 },
        ]
        const outer = outerZones.find((o) => o.z === zone)
        if (!outer) return
        col = outer.col
        row = outer.row
      }

      const x = padding + cellW * (col + 0.5)
      const y = padding + cellH * (row + 0.5)

      const color = callCode ? CALL_COLORS[callCode] ?? '#ffaa44' : '#ffaa44'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = pitchType ? PITCH_COLORS[pitchType] ?? '#ffffff' : '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [zone, size, pitchType, callCode])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />
}
