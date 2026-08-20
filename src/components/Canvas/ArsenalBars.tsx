import { useRef, useEffect } from 'react'
import type { PitchArsenalItem } from '../../api/types'
import { CHART, getPitchColor, readableInkOn } from '../../utils/chartTheme'

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

    ctx.fillStyle = CHART.background
    ctx.fillRect(0, 0, width, totalHeight)

    sorted.forEach((pitch, i) => {
      const y = padding + i * (barHeight + gap)
      const code = pitch.type.code
      const color = getPitchColor(code)
      const barW = (pitch.percentage / 100) * barAreaWidth

      ctx.fillStyle = CHART.ink
      ctx.font = '12px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(code, padding, y + barHeight / 2)

      ctx.fillStyle = color
      ctx.fillRect(labelWidth, y, barW, barHeight)

      const percentage = `${pitch.percentage.toFixed(1)}%`
      ctx.font = '11px system-ui, sans-serif'
      const percentageSurface =
        4 + ctx.measureText(percentage).width <= barW ? color : CHART.background
      ctx.fillStyle = readableInkOn(percentageSurface)
      ctx.fillText(percentage, labelWidth + 4, y + barHeight / 2)

      ctx.fillStyle = CHART.label
      ctx.textAlign = 'right'
      ctx.fillText(`${pitch.averageSpeed.toFixed(0)} mph`, width - padding, y + barHeight / 2)
      ctx.textAlign = 'left'
    })
  }, [arsenal, width])

  return <canvas ref={canvasRef} style={{ width }} />
}
