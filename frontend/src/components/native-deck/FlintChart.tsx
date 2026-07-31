import { useEffect, useRef, useState } from 'react'
import type { ChartAssemblyInput } from 'flint-chart'

type ChartInstance = {
  dispose: () => void
  setOption: (option: unknown, options?: { notMerge?: boolean }) => void
}

export function FlintChart({ spec, label }: { spec: unknown; label: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    let chart: ChartInstance | undefined
    const root = rootRef.current
    if (!root) return

    setStatus('loading')
    setError('')
    void Promise.all([import('flint-chart'), import('echarts')])
      .then(([flint, echarts]) => {
        if (!active) return
        const input = parseFlintChartSpec(spec)
        chart = echarts.init(root, undefined, { renderer: 'svg' })
        chart.setOption(flint.assembleECharts(input), { notMerge: true })
        setStatus('ready')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('error')
      })

    return () => {
      active = false
      chart?.dispose()
    }
  }, [spec])

  return (
    <div className="core01-flint-chart">
      <div ref={rootRef} className="core01-flint-chart-canvas" data-flint-chart data-flint-chart-ready={status === 'loading' ? 'false' : status === 'ready' ? 'true' : 'error'} role="img" aria-label={label} />
      {error && <p className="core01-flint-chart-error" role="alert">图表无法渲染：{error}</p>}
    </div>
  )
}

export function parseFlintChartSpec(value: unknown): ChartAssemblyInput {
  if (typeof value !== 'string' || !value.trim()) throw new Error('缺少 Flint 图表规格')

  let input: unknown
  try {
    input = JSON.parse(value)
  } catch {
    throw new Error('Flint 图表规格不是有效 JSON')
  }

  if (!isRecord(input)) throw new Error('Flint 图表规格必须是对象')
  if (!isRecord(input.data) || (!Array.isArray(input.data.values) && typeof input.data.url !== 'string')) {
    throw new Error('Flint 图表规格缺少 data.values 或 data.url')
  }
  if (!isRecord(input.chart_spec) || typeof input.chart_spec.chartType !== 'string' || !input.chart_spec.chartType.trim()) {
    throw new Error('Flint 图表规格缺少 chart_spec.chartType')
  }
  if (!isRecord(input.chart_spec.encodings)) throw new Error('Flint 图表规格缺少 chart_spec.encodings')
  return input as unknown as ChartAssemblyInput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
