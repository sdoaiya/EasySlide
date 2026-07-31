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
  core01_statement: { kicker: '核心观点', title: '观点标题', summary: '观点摘要', points: ['依据甲', '依据乙'] },
  core01_evidence: { title: '证据标题', summary: '证据摘要', metrics: ['证据甲', '证据乙'] },
  core01_narrative: { kicker: '推进路径', title: '路径标题', summary: '路径摘要', steps: ['阶段甲', '阶段乙', '阶段丙'] },
  core01_risk: { title: '风险标题', summary: '风险摘要', risks: ['风险甲', '风险乙', '风险丙'] },
  core01_decision: { kicker: '决策建议', title: '决策标题', recommendation: '推荐方案', options: ['方案甲', '方案乙'] },
  core01_image_story: { kicker: '现场观察', title: '图文标题', summary: '图文摘要', caption: '图片说明', image: '/files/story.png' },
  core01_quote: { kicker: '核心引言', quote: '引用内容', attribution: '引用来源', summary: '引用说明' },
  core01_actions: { title: '行动标题', summary: '行动摘要', actions: ['行动甲', '行动乙', '行动丙'] },
  core01_matrix: { title: '矩阵标题', xLabel: '横轴', yLabel: '纵轴', items: ['象限甲', '象限乙', '象限丙', '象限丁'] },
  core01_overview: { kicker: '结构总览', title: '总览标题', summary: '总览摘要', sections: ['模块甲', '模块乙', '模块丙'] },
  core01_section: { kicker: '第二章', title: '章节标题', subtitle: '章节说明', sectionNumber: '02' },
  core01_timeline: { title: '时间轴标题', milestones: ['里程碑甲', '里程碑乙', '里程碑丙'] },
  core01_bars: { title: '数据条标题', summary: '数据摘要', metrics: ['指标甲 80%', '指标乙 60%', '指标丙 40%'] },
  core01_chart: { title: '智能图表标题', summary: '智能图表摘要', spec: '{"data":{"values":[{"quarter":"Q1","revenue":120}]},"chart_spec":{"chartType":"Bar Chart","encodings":{"x":{"field":"quarter"},"y":{"field":"revenue"}}}}' },
  core01_table: { title: '报告标题', leftLabel: '分类', rightLabel: '结论', rows: ['记录甲', '记录乙', '记录丙'] },
  core01_architecture: { kicker: '系统架构', title: '架构标题', summary: '架构摘要', layers: ['接入层', '服务层', '数据层'] },
  core01_profile: { kicker: '核心成员', name: '人物姓名', role: '人物角色', summary: '人物摘要', highlights: ['经历甲', '经历乙'], image: '/files/profile.png' },
  core01_funnel: { kicker: '转化漏斗', title: '漏斗标题', summary: '漏斗摘要', stages: ['触达', '验证', '成交'] },
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
    for (const [key, value] of Object.entries(samples[layout])) {
      if (key === 'spec') continue
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

  it.each(['editorial', 'signal', 'route', 'contrast', 'spotlight', 'caution'])('exposes the %s Huashu visual system to the renderer', (visualSystem) => {
    const { container } = renderSlide('core01_statement', {
      ...samples.core01_statement,
      __design_intent: {
        design_engine: 'huashu_native',
        page_plan: { visual_system: visualSystem },
      },
    })

    expect(container.querySelector('.native-slide')).toHaveAttribute('data-design-engine', 'huashu_native')
    expect(container.querySelector('.native-slide')).toHaveAttribute('data-visual-system', visualSystem)
  })
})
