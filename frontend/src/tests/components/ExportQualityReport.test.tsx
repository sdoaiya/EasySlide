import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExportQualityReport } from '@/components/export/ExportQualityReport'

const report = {
  slideCount: 2,
  textObjects: 5,
  shapeObjects: 3,
  imageObjects: 1,
  slideSummaries: [
    { index: 1, renderedTextObjects: 3, renderedShapeObjects: 2, renderedImageObjects: 1 },
    { index: 2, renderedTextObjects: 2, renderedShapeObjects: 1, renderedImageObjects: 0 },
  ],
  warnings: [{ slide: 2, type: 'font-fallback' }],
}

describe('ExportQualityReport', () => {
  it('shows summary, pages, and warnings without exposing raw logs by default', () => {
    render(<ExportQualityReport report={report} onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: '导出质量报告' });
    expect(dialog).toHaveTextContent('2 页')
    expect(dialog.parentElement).not.toHaveClass('bg-black/45')
    expect(dialog.parentElement).toHaveClass('bg-[color:var(--app-surface)]/80')
    expect(dialog.outerHTML).not.toMatch(/border-border-primary|text-foreground-secondary|bg-background-hover|shadow-popover/)
    fireEvent.click(screen.getByRole('tab', { name: '页面' }))
    expect(screen.getByText('第 1 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '警告' }))
    expect(screen.getByText(/font-fallback/)).toBeInTheDocument()
  })

  it('shows narration timing and visual fallback without NaN similarity', () => {
    render(<ExportQualityReport report={{
      provider: 'fish_audio',
      model: 's2.1-pro-free',
      characters: 20,
      requests: 1,
      duration_seconds: 8,
      elapsed_seconds: 10,
      retry_count: 0,
      quality_pages: [{
        page_index: 0,
        timing_quality: 'estimated',
        visual_renderer: 'browser_frames',
        fallback_from: 'hyperframes',
        fallback_reason: '渲染器超时',
      }],
      warnings: [],
    }} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: '页面' }))
    expect(screen.getByText('时间估算')).toBeInTheDocument()
    expect(screen.getByText('阶段帧动画（由元素动画降级）')).toHaveAttribute('title', '渲染器超时')
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('shows missing timing and renderer data as unrecorded', () => {
    render(<ExportQualityReport report={{
      provider: 'edge', model: 'edge-tts', characters: 0, requests: 0,
      duration_seconds: 0, elapsed_seconds: 0, retry_count: 0,
      quality_pages: [{ page_index: 0 }], warnings: [],
    }} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: '页面' }))
    expect(screen.getAllByText('未记录')).toHaveLength(2)
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const view = render(<ExportQualityReport report={report} onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: '关闭质量报告' })
    expect(closeButton).toHaveClass('h-10', 'w-10')
    await waitFor(() => expect(document.activeElement).toBe(closeButton))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
