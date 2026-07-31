import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeDeckPropertyPanel, type NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'

const contract: NativeLayoutContract = {
  layout: 'theme01_page040',
  theme: 'theme01',
  label: '阶段性策略路线图',
  roles: ['process'],
  copyKeys: ['title', 'phases[].heading', 'phases[].points[]'],
  copyBudgets: {},
  propShapes: {
    title: 'string',
    phases: [{ heading: 'string', points: ['string'] }],
  },
  arrayMeta: [{ key: 'phases', min: 2, max: 4 }],
  mediaSlots: [],
  controls: [
    { key: 'highlight', label: '重点强调', type: 'toggle', default: true },
    { key: 'highlightIndex', label: '强调第几段', type: 'range', default: 1, min: 0, max: 3 },
    { key: 'showLead', label: '显示导语', type: 'boolean', default: true },
    { key: 'accentMode', label: '强调模式', type: 'radio', default: 'warm', options: [{ value: 'warm', label: '暖色' }, { value: 'cool', label: '冷色' }] },
    { key: 'density', label: '信息密度', type: 'slider', default: 2, min: 1, max: 4, step: 1 },
    { key: 'palette', label: '分层配色', type: 'palette', default: ['#ff0000', '#00ff00'], options: [{ value: ['#ff0000', '#00ff00'], label: '暖色', color: '#ff0000' }, { value: ['#0000ff', '#00ffff'], label: '冷色', color: '#0000ff' }] },
    { key: 'scheme', label: '方案', type: 'enum', default: 'green', options: [{ value: 'green', label: '绿色' }, { value: 'violet', label: '紫色' }] },
  ],
}

describe('NativeDeckPropertyPanel DashiAI fields', () => {
  function openLayer(name: '页面' | '内容' | '媒体' | '结构' | '视觉' | '动效') {
    const mapped = name === '媒体' ? '图片' : name === '视觉' || name === '动效' ? '设计' : '内容'
    fireEvent.click(screen.getByRole('tab', { name: mapped }))
  }

  it('groups page fields into content, design, and image layers', () => {
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: {
            title: '路线图',
            phases: [
              { heading: '第一阶段', points: ['验证需求'] },
              { heading: '第二阶段', points: ['规模推广'] },
            ],
            __animation: { enter: 'fade' },
            density: 2,
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('tab', { name: '内容' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('页面设置')).toBeInTheDocument()
    expect(screen.getByLabelText('页面角色')).toHaveValue('process')
    expect(screen.getByText('已生成')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '内容' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '图片' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '设计' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByText('文字与数据')).toBeInTheDocument()
    expect(screen.getByLabelText('title')).toHaveValue('路线图')
    expect(screen.queryByText('页面动效')).not.toBeInTheDocument()

    openLayer('内容')
    expect(screen.getByText('页面设置')).toBeInTheDocument()
    expect(screen.getByText('文字与数据')).toBeInTheDocument()

    openLayer('动效')
    expect(screen.getByText('页面动效')).toBeInTheDocument()
    expect(screen.queryByText('页面设置')).not.toBeInTheDocument()
  })

  it('switches to a same-theme layout when the page role changes', () => {
    const onLayoutChange = vi.fn()
    const cover = { ...contract, layout: 'theme01_page001', roles: ['cover'], label: '封面' }
    render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: contract.layout, props: { title: '路线图' } }}
        contract={contract}
        contracts={[contract, cover]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={onLayoutChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('页面角色'), { target: { value: 'cover' } })

    expect(onLayoutChange).toHaveBeenCalledWith('theme01_page001')
  })

  it('shows Huashu design intent as read-only planning context', () => {
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: {
            title: '路线图',
            phases: [
              { heading: '第一阶段', points: ['验证需求'] },
              { heading: '第二阶段', points: ['规模推广'] },
            ],
            __design_intent: {
              narrative_role: '正文页，需要服务单一信息角色',
              visual_direction: '政府汇报、克制、专业',
              media_strategy: '本页优先使用文字、数据和结构表达',
              content_signals: ['项目总览', '海外验证'],
              page_plan: {
                information_focus: 'process',
                composition: 'sequence',
                media_direction: 'supportive',
                motion_direction: 'progressive',
              },
              quality_report: {
                status: 'warning',
                score: 85,
                outline_coverage: 1,
                issues: ['consecutive_layout_repeat'],
              },
            },
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )

    openLayer('页面')
    const intent = screen.getByText('页面摘要').closest('details')
    expect(intent).toBeInTheDocument()
    expect(intent).toContainElement(screen.getByText('政府汇报、克制、专业'))
    expect(intent).toContainElement(screen.getByText('正文页，需要服务单一信息角色'))
    expect(intent).toContainElement(screen.getByText('本页优先使用文字、数据和结构表达'))
    expect(intent).toContainElement(screen.getByText('85 分 · 连续布局重复'))
    expect(screen.getByRole('button', { name: '修复并重新生成' })).toBeInTheDocument()
    expect(intent).not.toHaveTextContent('项目总览 / 海外验证')
    expect(intent).not.toHaveTextContent('流程与路径')
  })

  it('marks a contract-safe fallback page so it can be retried intentionally', () => {
    const onRegenerate = vi.fn()
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: { title: '路线图', __design_intent: { generation_fallback: true } },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
        onRegenerate={onRegenerate}
      />,
    )

    expect(screen.getByText('回退生成')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新生成本页' }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('edits nested object arrays and visual controls', () => {
    const onChange = vi.fn()
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: {
            title: '路线图',
            phases: [
              { heading: '第一阶段', points: ['验证需求'] },
              { heading: '第二阶段', points: ['规模推广'] },
            ],
            highlight: true,
            highlightIndex: 1,
            showLead: true,
            accentMode: 'warm',
            density: 2,
            palette: ['#ff0000', '#00ff00'],
            scheme: 'green',
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={onChange}
        onLayoutChange={vi.fn()}
      />,
    )

    openLayer('结构')
    fireEvent.click(screen.getByLabelText('重点强调'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ highlight: false }))

    fireEvent.change(screen.getByLabelText('强调第几段'), { target: { value: '2' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ highlightIndex: 2 }))

    fireEvent.click(screen.getByLabelText('显示导语'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showLead: false }))
    fireEvent.click(screen.getByRole('button', { name: '恢复默认 显示导语' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showLead: true }))
    openLayer('视觉')
    fireEvent.change(screen.getByLabelText('强调模式'), { target: { value: 'cool' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ accentMode: 'cool' }))
    openLayer('结构')
    fireEvent.change(screen.getByLabelText('信息密度'), { target: { value: '3' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ density: 3 }))
    openLayer('视觉')
    fireEvent.click(screen.getByLabelText('冷色'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ palette: ['#0000ff', '#00ffff'] }))
    fireEvent.change(screen.getByLabelText('方案'), { target: { value: 'violet' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scheme: 'violet' }))

    openLayer('动效')
    fireEvent.change(screen.getByLabelText('元素统一延迟（毫秒）'), { target: { value: '220' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ __animation: expect.objectContaining({ elementDelay: 220 }) }))
  })

  it('splits Dashi controls into structure and visual sections by default', () => {
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: {
            title: '路线图',
            phases: [
              { heading: '第一阶段', points: ['验证需求'] },
              { heading: '第二阶段', points: ['规模推广'] },
            ],
            density: 2,
            palette: ['#ff0000', '#00ff00'],
            scheme: 'green',
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )

    openLayer('结构')
    const structure = screen.getAllByText('结构').find((item) => item.tagName.toLowerCase() === 'summary')?.closest('details')
    expect(structure).toBeInTheDocument()
    expect(structure).toHaveAttribute('open')
    expect(structure).toContainElement(screen.getByLabelText('信息密度'))

    openLayer('视觉')
    const visual = screen.getAllByText('视觉').find((item) => item.tagName.toLowerCase() === 'summary')?.closest('details')

    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute('open')
    expect(visual).toContainElement(screen.getByRole('group', { name: '分层配色' }))
    expect(visual).toContainElement(screen.getByLabelText('方案'))
  })

  it('splits page animation settings into compact subgroups', () => {
    render(
      <NativeDeckPropertyPanel
        slide={{
          pageId: 'page-1',
          layout: contract.layout,
          props: {
            title: '路线图',
            phases: [
              { heading: '第一阶段', points: ['验证需求'] },
              { heading: '第二阶段', points: ['规模推广'] },
            ],
            __animation: { enter: 'fade', elementEnter: 'slide-up', transition: 'cover' },
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )

    openLayer('动效')
    const motionPanel = screen.getByText('页面动效').closest('details')
    expect(motionPanel).toBeInTheDocument()
    expect(motionPanel).not.toHaveAttribute('open')

    fireEvent.click(screen.getByText('页面动效'))
    expect(screen.getByText('页面入场')).toBeInTheDocument()
    expect(screen.getByText('元素动效')).toBeInTheDocument()
    expect(screen.getByText('翻页播放')).toBeInTheDocument()
  })

  it('offers prompt and replacement actions for media slots', () => {
    const onChange = vi.fn()
    const onGenerate = vi.fn()
    const onUpload = vi.fn()
    const mediaContract: NativeLayoutContract = {
      ...contract,
      layout: 'theme01_page008',
      propShapes: { title: 'string', images: ['media'] },
      mediaSlots: [{ key: 'images', required: false, defaultVisibleCount: 2, max: 3 }],
      defaultProps: { title: '', images: [] },
    }
    render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: mediaContract.layout, props: { title: '案例', images: ['/files/old.png'] } }}
        contract={mediaContract}
        contracts={[mediaContract]}
        errors={{}}
        onChange={onChange}
        onLayoutChange={vi.fn()}
        mediaActions={{ busy: {}, onGenerate, onUpload, onSelect: vi.fn() }}
      />,
    )

    expect(screen.getByRole('tab', { name: '内容' })).toHaveAttribute('aria-selected', 'true')
    openLayer('媒体')
    const mediaHeading = screen.getByText('图片内容')
    expect(mediaHeading).toBeInTheDocument()
    expect(screen.queryByLabelText('title')).not.toBeInTheDocument()
    expect(screen.getByAltText('images 1')).toHaveAttribute('src', '/files/old.png')
    fireEvent.change(screen.getByLabelText('images 1 图片要求'), { target: { value: '主体靠右' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ __media_prompts: { 'images[0]': '主体靠右' } }))
    fireEvent.click(screen.getByRole('button', { name: '修改 images 1' }))
    expect(onGenerate).toHaveBeenCalledWith('images', 0, '主体靠右', true)
    expect(screen.getByRole('button', { name: '上传替换 images 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '从素材库选择 images 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除 images 1' })).toBeInTheDocument()

    const file = new File(['image'], 'replacement.png', { type: 'image/png' })
    fireEvent.drop(screen.getByLabelText('images 1 媒体槽'), { dataTransfer: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith('images', 0, file)
  })

  it('shows busy state for array media slots using the same id as the batch queue', () => {
    const mediaContract: NativeLayoutContract = {
      ...contract,
      layout: 'theme01_page008',
      propShapes: { title: 'string', images: ['media'] },
      mediaSlots: [{ key: 'images', required: false, defaultVisibleCount: 1, max: 3 }],
      defaultProps: { title: '', images: [] },
    }
    render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: mediaContract.layout, props: { title: '案例', images: [] } }}
        contract={mediaContract}
        contracts={[mediaContract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
        mediaActions={{ busy: { 'page-1:images[0]': '生成中...' }, onGenerate: vi.fn(), onUpload: vi.fn(), onSelect: vi.fn() }}
      />,
    )

    openLayer('媒体')
    expect(screen.getByRole('status')).toHaveTextContent('生成中...')
  })

  it('supports video media slots without exposing image generation as an available action', () => {
    const onUpload = vi.fn()
    const mediaContract: NativeLayoutContract = {
      ...contract,
      layout: 'theme01_video001',
      propShapes: { title: 'string', videos: ['media'] },
      mediaSlots: [{ key: 'videos', type: 'video', required: false, defaultVisibleCount: 1, max: 1 }],
      defaultProps: { title: '', videos: [] },
    }
    render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: mediaContract.layout, props: { title: '案例', videos: [] } }}
        contract={mediaContract}
        contracts={[mediaContract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
        mediaActions={{ busy: {}, onGenerate: vi.fn(), onUpload, onSelect: vi.fn() }}
      />,
    )

    openLayer('媒体')
    expect(screen.getByRole('button', { name: '生成 videos 1' })).toBeDisabled()
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    fireEvent.drop(screen.getByLabelText('videos 1 媒体槽'), { dataTransfer: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith('videos', 0, file)
  })

  it('honors Dashi control dependencies and dependency values', () => {
    const dependentContract: NativeLayoutContract = {
      ...contract,
      controls: [
        { key: 'enabled', label: '启用参数', type: 'toggle', default: false },
        { key: 'amount', label: '参数数值', type: 'number', default: 1, dependsOn: 'enabled' },
        { key: 'mode', label: '参数模式', type: 'select', default: 'warm', options: ['warm', 'cool'], dependsOn: 'enabled', dependsOnValue: true },
        { key: 'count', label: '参数数量', type: 'number', default: 2, min: 1, max: 8 },
        { key: 'index', label: '参数序号', type: 'number', default: 1, min: 1, max: 8, maxFromKey: 'count' },
      ],
    }
    const { rerender } = render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: dependentContract.layout, props: { title: '路线图', enabled: false, count: 2 } }}
        contract={dependentContract}
        contracts={[dependentContract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )

    openLayer('结构')
    expect(screen.queryByLabelText('参数数值')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('参数模式')).not.toBeInTheDocument()
    rerender(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: dependentContract.layout, props: { title: '路线图', enabled: true, count: 2 } }}
        contract={dependentContract}
        contracts={[dependentContract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )
    openLayer('结构')
    expect(screen.getByLabelText('参数数值')).toBeInTheDocument()
    expect(screen.getByLabelText('参数序号')).toHaveAttribute('max', '2')
    openLayer('视觉')
    expect(screen.getByLabelText('参数模式')).toBeInTheDocument()
  })

  it('honors showIf and maxFromKeyOffset metadata', () => {
    const conditionalContract: NativeLayoutContract = {
      ...contract,
      controls: [
        { key: 'showFunnel', label: '显示漏斗', type: 'toggle', default: false },
        { key: 'funnelTitle', label: '漏斗标题', type: 'text', showIf: 'showFunnel' },
        { key: 'count', label: '参数数量', type: 'number', default: 3, min: 1, max: 8 },
        { key: 'index', label: '参数序号', type: 'number', default: 1, min: 1, max: 8, maxFromKey: 'count', maxFromKeyOffset: -1 },
      ],
    }
    render(
      <NativeDeckPropertyPanel
        slide={{ pageId: 'page-1', layout: conditionalContract.layout, props: { title: '路线图', showFunnel: false, count: 3 } }}
        contract={conditionalContract}
        contracts={[conditionalContract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )
    openLayer('结构')
    expect(screen.queryByLabelText('漏斗标题')).not.toBeInTheDocument()
    expect(screen.getByLabelText('参数序号')).toHaveAttribute('max', '2')
  })
})
