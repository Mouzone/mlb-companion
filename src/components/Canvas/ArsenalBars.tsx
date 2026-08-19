import { useRef, useEffect } from 'react'
import type { PitchArsenalItem } from '../../api/types'

const PITCH_COLORS: Record<string, string> = {
  FF: '#ff4444',
  SI: '#ff6644',
  FC: '#ff8844',
  SL: '#4488ff',
  ST: '#44aaff',
  CU: '#44ff88',
  KC: '#44ffaa',
  CH: '#88ff44',
  FS: '#aaff44',
  KN: '#dddddd',
  FO: '#ffff44',
  SC: '#ff44ff',
  EP: '#44ffff',
}

interface ArsenalBarsProps {
  arsenal: PitchArsenalItem[]
  width?: number
}

export function ArsenalBars({ arsenal, width = 280 }: ArsenalBarsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sorted = [...arsenal].sort((a, b) => b.percentage - a.percentage)
    const barHeight = 28
    const gap = 6
    const labelWidth = 60
    const veloWidth = 70
    const padding = 8
    const barAreaWidth = width - labelWidth - veloWidth - padding * 2
    const totalHeight = sorted.length * (barHeight + gap) + padding * 2

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = totalHeight * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#0d1b12'
    ctx.fillRect(0, 0, width, totalHeight)

    sorted.forEach((pitch, i) => {
      const y = padding + i * (barHeight + gap)
      const code = pitch.type.code
      const color = PITCH_COLORS[code] ?? '#888888'
      const barW = (pitch.percentage / 100) * barAreaWidth

      ctx.fillStyle = '#aaaaaa'
      ctx.font = '12px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(code, padding, y + barHeight / 2)

      ctx.fillStyle = color
      ctx.fillRect(labelWidth, y, barW, barHeight)

      ctx.fillStyle = '#ffffff'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(`${pitch.percentage.toFixed(1)}%`, labelWidth + 4, y + barHeight / 2)

      ctx.fillStyle = '#cccccc'
      ctx.textAlign = 'right'
      ctx.fillText(`${pitch.averageSpeed.toFixed(0)} mph`, width - padding, y + barHeight / 2)
      ctx.textAlign = 'left'
    })
  }, [arsenal, width])

  return <canvas ref={canvasRef} style={{ width }} />
}
