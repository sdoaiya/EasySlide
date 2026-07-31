import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FlintChart, parseFlintChartSpec } from '@/components/native-deck/FlintChart'

const chartMocks = vi.hoisted(() => ({
  assembleECharts: vi.fn(() => ({ series: [] })),
  dispose: vi.fn(),
  setOption: vi.fn(),
  init: vi.fn(),
}))

vi.mock('flint-chart', () => ({ assembleECharts: chartMocks.assembleECharts }))
vi.mock('echarts', () => ({ init: chartMocks.init }))

const validSpec = JSON.stringify({
  data: { values: [{ quarter: 'Q1', revenue: 120 }] },
  semantic_types: { quarter: 'Quarter', revenue: 'Amount' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } },
  },
})

describe('FlintChart', () => {
  beforeEach(() => {
    chartMocks.assembleECharts.mockClear()
    chartMocks.dispose.mockClear()
    chartMocks.setOption.mockClear()
    chartMocks.init.mockReset().mockReturnValue({
      dispose: chartMocks.dispose,
      setOption: chartMocks.setOption,
    })
  })

  it('compiles a Flint spec and renders it through the ECharts SVG renderer', async () => {
    const { container, unmount } = render(<FlintChart spec={validSpec} label="季度营收" />)

    await waitFor(() => expect(chartMocks.setOption).toHaveBeenCalledWith({ series: [] }, { notMerge: true }))
    expect(chartMocks.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, { renderer: 'svg' })
    expect(container.querySelector('[data-flint-chart]')).toHaveAttribute('data-flint-chart-ready', 'true')
    expect(screen.getByRole('img', { name: '季度营收' })).toBeInTheDocument()

    unmount()
    expect(chartMocks.dispose).toHaveBeenCalled()
  })

  it('shows a bounded error state for an invalid spec', async () => {
    const { container } = render(<FlintChart spec="not-json" label="错误图表" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Flint 图表规格不是有效 JSON')
    expect(container.querySelector('[data-flint-chart]')).toHaveAttribute('data-flint-chart-ready', 'error')
    expect(chartMocks.init).not.toHaveBeenCalled()
  })
})

describe('parseFlintChartSpec', () => {
  it('rejects specs without an encoding contract', () => {
    expect(() => parseFlintChartSpec('{"data":{"values":[]},"chart_spec":{"chartType":"Bar Chart"}}'))
      .toThrow('chart_spec.encodings')
  })
})
