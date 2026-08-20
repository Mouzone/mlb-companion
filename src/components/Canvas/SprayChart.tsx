import { useRef, useEffect } from 'react'
import { CHART, EVENT_COLORS, UNKNOWN_SERIES_COLOR } from '../../utils/chartTheme'
import type { SavantBattedBall } from '../../api/types'

interface SprayChartProps {
  data: SavantBattedBall[]
  width?: number
  height?: number
}

const EVENT_FILLS: Readonly<Record<string, string>> = EVENT_COLORS

export function SprayChart({ data, width = 240, height = 200 }: SprayChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = CHART.background
    ctx.fillRect(0, 0, width, height)

    const fieldW = width
    const fieldH = height

    ctx.strokeStyle = CHART.fieldLine
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(width / 2, fieldH + 20, fieldH * 0.9, Math.PI, 0)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(width / 2, fieldH + 20, fieldH * 0.6, Math.PI, 0)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(width / 2, fieldH + 20, fieldH * 0.3, Math.PI, 0)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, fieldH)
    ctx.lineTo(width / 2, fieldH + 20)
    ctx.lineTo(width, fieldH)
    ctx.stroke()

    const battedBalls = data.filter((d) => d.hc_x && d.hc_y && d.events)

    battedBalls.forEach((ball) => {
      const hcX = parseFloat(ball.hc_x)
      const hcY = parseFloat(ball.hc_y)
      if (isNaN(hcX) || isNaN(hcY)) return

      const normalizedX = (hcX / 250) * fieldW
      const normalizedY = fieldH - ((hcY - 20) / 220) * fieldH

      const color = EVENT_FILLS[ball.events] ?? UNKNOWN_SERIES_COLOR
      const isHit = ['single', 'double', 'triple', 'home_run'].includes(ball.events)

      ctx.fillStyle = color
      ctx.globalAlpha = isHit ? 0.9 : 0.5
      ctx.beginPath()
      ctx.arc(normalizedX, normalizedY, isHit ? 4 : 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      if (isHit) {
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.stroke()
      }
    })

    ctx.fillStyle = CHART.label
    ctx.font = '9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('LF', width * 0.2, height - 4)
    ctx.fillText('CF', width * 0.5, height - 4)
    ctx.fillText('RF', width * 0.8, height - 4)
  }, [data, width, height])

  return <canvas ref={canvasRef} style={{ width, height }} />
}
