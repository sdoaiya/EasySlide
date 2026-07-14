import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'
import { NativeSlideRenderer } from '@/components/native-deck/NativeSlideRenderer'
import { layoutRegistry } from '@/native-deck/layoutRegistry'
import { isDashiLayout } from '@/native-deck/dashiThemeRuntime'
import type { NativeSlideSpec } from '@/native-deck/types'

vi.mock('@/api/client', () => ({
  getImageUrl: vi.fn((path: string) => `http://desktop.local${path}`),
}))

const samples: Record<string, Record<string, unknown>> = {
  core01_cover: { kicker: '封面标识', title: '封面标题', subtitle: '封面副标题' },
  core01_agenda: { title: '议程标题', items: ['议程甲', '议程乙'] },
  core01_metrics: { title: '指标标题', metrics: ['指标甲', '指标乙'] },
  core01_comparison: {
    title: '对比标题',
    leftTitle: '左侧标题',
    leftPoints: ['左侧要点'],
    rightTitle: '右侧标题',
    rightPoints: ['右侧要点'],
  },
  core01_process: { title: '流程标题', steps: ['步骤甲', '步骤乙', '步骤丙'] },
  core01_case: { kicker: '案例标识', title: '案例标题', summary: '案例摘要', image: '/files/case.png' },
  core01_conclusion: { title: '总结标题', points: ['总结甲', '总结乙'] },
  core01_end: { title: '结束标题', subtitle: '结束副标题' },
}

function renderSlide(layout: string, props: Record<string, unknown>) {
  const slide: NativeSlideSpec = { pageId: `page-${layout}`, layout, props }
  return render(<NativeSlideRenderer slide={slide} />)
}

describe('native deck layout registry', () => {
  it('registers every enabled manifest layout exactly once', () => {
    const coreLayouts = layoutManifest.layouts.filter((item) => item.theme === 'core01').map((item) => item.layout)
    const dashiLayouts = layoutManifest.layouts.filter((item) => item.theme !== 'core01').map((item) => item.layout)

    expect(Object.keys(layoutRegistry).sort()).toEqual([...coreLayouts].sort())
    expect(dashiLayouts).toHaveLength(1020)
    expect(dashiLayouts.every(isDashiLayout)).toBe(true)
  })

  it.each(layoutManifest.layouts.filter((item) => item.theme === 'core01'))('renders $layout at 1920 x 1080 using supplied props', ({ layout }) => {
    const random = vi.spyOn(Math, 'random')
    const fetch = vi.mocked(global.fetch)
    fetch.mockClear()

    const { container } = renderSlide(layout, samples[layout])
    const slide = container.firstElementChild

    expect(slide).toHaveClass('native-slide')
    expect(slide).toHaveStyle({ width: '1920px', height: '1080px' })
    for (const value of Object.values(samples[layout])) {
      if (typeof value === 'string' && !value.startsWith('/files/')) {
        expect(screen.getByText(value)).toBeInTheDocument()
      }
      if (Array.isArray(value)) {
        for (const item of value) expect(screen.getByText(item)).toBeInTheDocument()
      }
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  it('renders an explicit error state for an unknown layout', () => {
    renderSlide('missing_layout', { title: '不会渲染' })

    expect(screen.getByRole('alert')).toHaveTextContent('未知原生布局：missing_layout')
    expect(screen.queryByText('不会渲染')).not.toBeInTheDocument()
  })

  it('resolves project file URLs for registered core layouts', () => {
    renderSlide('core01_case', samples.core01_case)

    expect(screen.getByAltText('案例标题')).toHaveAttribute('src', 'http://desktop.local/files/case.png')
  })
})
