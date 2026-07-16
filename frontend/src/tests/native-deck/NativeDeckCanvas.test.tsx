import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeDeckCanvas } from '@/components/native-deck/NativeDeckCanvas'
import type { NativeSlideSpec } from '@/native-deck/types'

const slide: NativeSlideSpec = {
  pageId: 'page-1',
  layout: 'core01-cover',
  props: {
    title: '演示测试',
    __animation: { elementEnter: 'fade', elementTrigger: 'click', advanceAfter: 1 },
  },
}

describe('NativeDeckCanvas', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for the click-triggered animation before starting auto advance', () => {
    vi.useFakeTimers()
    const onNext = vi.fn()
    const { container } = render(
      <NativeDeckCanvas slide={slide} pageIndex={0} pageCount={2} presenting onNext={onNext} />,
    )

    act(() => { vi.advanceTimersByTime(1000) })
    expect(onNext).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.native-slide')!)
    act(() => { vi.advanceTimersByTime(999) })
    expect(onNext).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('keeps click-triggered element animations visible while editing', () => {
    const { container } = render(
      <NativeDeckCanvas slide={{ ...slide, layout: 'core01_cover' }} pageIndex={0} pageCount={2} />,
    )

    expect(container.querySelector('.native-slide')).toHaveAttribute('data-element-step', '1')
    expect(screen.getByText('演示测试')).toBeInTheDocument()
  })

  it('selects a unique text value before editing it', () => {
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试', subtitle: '副标题' } }}
        onPropsChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('演示测试'))

    expect(screen.getByTestId('native-canvas-text-selection')).toBeInTheDocument()
    expect(screen.queryByLabelText('画布文字编辑')).not.toBeInTheDocument()
  })

  it('edits a uniquely matched text value from the canvas and writes it back to props', () => {
    const onPropsChange = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试', subtitle: '副标题' } }}
        onPropsChange={onPropsChange}
      />,
    )

    fireEvent.doubleClick(screen.getByText('演示测试'))
    const editor = screen.getByLabelText('画布文字编辑')
    expect(screen.getByRole('button', { name: '保存文字修改' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消文字修改' })).toBeInTheDocument()
    fireEvent.change(editor, { target: { value: '新的标题' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(onPropsChange).toHaveBeenCalledWith(expect.objectContaining({ title: '新的标题', subtitle: '副标题' }))
  })

  it('applies the layout copy budget while editing text on the canvas', () => {
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '标题', subtitle: '副标题' } }}
        mediaContract={{ propShapes: {}, mediaSlots: [], copyBudgets: { title: { maxChars: 5 } } }}
        onPropsChange={vi.fn()}
      />,
    )

    fireEvent.doubleClick(screen.getByText('标题'))

    expect(screen.getByLabelText('画布文字编辑')).toHaveAttribute('maxlength', '5')
    expect(screen.getByLabelText('文字长度 2/5')).toBeInTheDocument()
  })

  it('edits the clicked occurrence when the same text appears more than once', () => {
    const onPropsChange = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_agenda', props: { title: '议程', items: ['重复', '重复'] } }}
        onPropsChange={onPropsChange}
      />,
    )

    fireEvent.doubleClick(screen.getAllByText('重复')[1])
    const editor = screen.getByLabelText('画布文字编辑')
    fireEvent.change(editor, { target: { value: '第二项' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(onPropsChange).toHaveBeenCalledWith(expect.objectContaining({ items: ['重复', '第二项'] }))
  })

  it('cancels canvas text editing without writing props', () => {
    const onPropsChange = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试', subtitle: '副标题' } }}
        onPropsChange={onPropsChange}
      />,
    )

    fireEvent.doubleClick(screen.getByText('演示测试'))
    fireEvent.change(screen.getByLabelText('画布文字编辑'), { target: { value: '不会保存' } })
    fireEvent.click(screen.getByRole('button', { name: '取消文字修改' }))

    expect(onPropsChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('画布文字编辑')).not.toBeInTheDocument()
  })

  it('commits canvas text editing from the floating toolbar after changing the value', () => {
    const onPropsChange = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试', subtitle: '副标题' } }}
        onPropsChange={onPropsChange}
      />,
    )

    fireEvent.doubleClick(screen.getByText('演示测试'))
    fireEvent.change(screen.getByLabelText('画布文字编辑'), { target: { value: '工具栏保存' } })
    fireEvent.click(screen.getByRole('button', { name: '保存文字修改' }))

    expect(onPropsChange).toHaveBeenCalledWith(expect.objectContaining({ title: '工具栏保存', subtitle: '副标题' }))
    expect(screen.queryByLabelText('画布文字编辑')).not.toBeInTheDocument()
  })

  it('cancels canvas text editing with Escape even after focus leaves the textarea', () => {
    const onPropsChange = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试', subtitle: '副标题' } }}
        onPropsChange={onPropsChange}
      />,
    )

    fireEvent.doubleClick(screen.getByText('演示测试'))
    fireEvent.change(screen.getByLabelText('画布文字编辑'), { target: { value: '不会保存' } })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onPropsChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('画布文字编辑')).not.toBeInTheDocument()
  })

  it('selects a media slot from the canvas image', () => {
    const onMediaSelect = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_case', props: { kicker: '案例', title: '客户案例', summary: '摘要', image: '/files/old.png' } }}
        mediaContract={{ propShapes: { image: 'media' }, mediaSlots: [{ key: 'image', required: false }] }}
        onMediaSelect={onMediaSelect}
      />,
    )

    fireEvent.click(screen.getByAltText('客户案例'))

    expect(onMediaSelect).toHaveBeenCalledWith('image', undefined)
  })

  it('uploads a file dropped on a canvas media slot', () => {
    const onMediaUpload = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_case', props: { kicker: '案例', title: '客户案例', summary: '摘要', image: '/files/old.png' } }}
        mediaContract={{ propShapes: { image: 'media' }, mediaSlots: [{ key: 'image', required: false }] }}
        onMediaUpload={onMediaUpload}
      />,
    )

    const file = new File(['image'], 'replacement.png', { type: 'image/png' })
    fireEvent.drop(screen.getByAltText('客户案例'), { dataTransfer: { files: [file] } })

    expect(onMediaUpload).toHaveBeenCalledWith('image', undefined, file)
  })

  it('rejects a mismatched file type dropped on a canvas media slot', () => {
    const onMediaUpload = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_case', props: { kicker: '案例', title: '客户案例', summary: '摘要', image: '/files/old.png' } }}
        mediaContract={{ propShapes: { image: 'media' }, mediaSlots: [{ key: 'image', type: 'image', required: false }] }}
        onMediaUpload={onMediaUpload}
      />,
    )

    fireEvent.drop(screen.getByAltText('客户案例'), { dataTransfer: { files: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })] } })

    expect(onMediaUpload).not.toHaveBeenCalled()
  })

  it('shows page generation progress beside the page navigator', () => {
    const onPause = vi.fn()
    render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { title: '演示测试' } }}
        generationStatus={{ status: 'PROCESSING', completed: 2, failed: 1, total: 5, onPause }}
      />,
    )

    const navigator = screen.getByTestId('native-page-navigator')
    expect(navigator).toHaveTextContent('正在生成 2/5，失败 1')
    expect(screen.queryByTestId('native-page-generation-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('applies the content-led visual system from the native page plan', () => {
    const { container } = render(
      <NativeDeckCanvas
        slide={{ ...slide, layout: 'core01_cover', props: { ...slide.props, __design_intent: { page_plan: { visual_system: 'signal' } } } }}
        pageIndex={0}
        pageCount={2}
      />,
    )

    expect(container.querySelector('[data-visual-system="signal"]')).toBeInTheDocument()
  })
})
