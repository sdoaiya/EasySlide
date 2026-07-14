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
  ],
}

describe('NativeDeckPropertyPanel DashiAI fields', () => {
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
          },
        }}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={onChange}
        onLayoutChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('phases 1 heading'), { target: { value: '试点阶段' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      phases: [
        { heading: '试点阶段', points: ['验证需求'] },
        { heading: '第二阶段', points: ['规模推广'] },
      ],
    }))

    fireEvent.click(screen.getByLabelText('重点强调'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ highlight: false }))

    fireEvent.change(screen.getByLabelText('强调第几段'), { target: { value: '2' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ highlightIndex: 2 }))
  })

  it('offers prompt and replacement actions for media slots', () => {
    const onChange = vi.fn()
    const onGenerate = vi.fn()
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
        mediaActions={{ busy: {}, onGenerate, onUpload: vi.fn(), onSelect: vi.fn() }}
      />,
    )

    const mediaHeading = screen.getByText('图片内容')
    const titleField = screen.getByLabelText('title')
    expect(mediaHeading.compareDocumentPosition(titleField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByAltText('images 1')).toHaveAttribute('src', '/files/old.png')
    fireEvent.change(screen.getByLabelText('images 1 图片要求'), { target: { value: '主体靠右' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ __media_prompts: { 'images[0]': '主体靠右' } }))
    fireEvent.click(screen.getByRole('button', { name: '修改 images 1' }))
    expect(onGenerate).toHaveBeenCalledWith('images', 0, '主体靠右', true)
    expect(screen.getByRole('button', { name: '上传替换 images 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '从素材库选择 images 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除 images 1' })).toBeInTheDocument()
  })
})
