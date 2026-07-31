import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NativeThemePicker } from '@/components/native-deck/NativeThemePicker'

const { getStaticAssetUrl } = vi.hoisted(() => ({
  getStaticAssetUrl: vi.fn((path: string) => `./desktop-assets/${path.replace(/^\//, '')}`),
}))

vi.mock('@/api/client', () => ({ getStaticAssetUrl }))

describe('NativeThemePicker', () => {
  it('uses a desktop-safe relative URL for the selected theme preview', () => {
    const { container } = render(<NativeThemePicker value="theme01" onChange={vi.fn()} />)

    expect(getStaticAssetUrl).toHaveBeenCalledWith('/assets/native-theme-previews/theme01.jpg')
    expect(container.innerHTML).not.toContain('shadow-sm')
    expect(screen.getByAltText('轻拟态风主题预览')).toHaveAttribute(
      'src',
      './desktop-assets/assets/native-theme-previews/theme01.jpg',
    )
    expect(screen.getAllByText('真实渲染预览')).not.toHaveLength(0)
    expect(screen.getByText('图表')).toBeInTheDocument()
    expect(screen.getByText('分析模型')).toBeInTheDocument()
    expect(screen.getByText('卡片')).toBeInTheDocument()
    expect(screen.getByText('目录')).toBeInTheDocument()
  })

  it('shows theme thumbnails and design context on theme cards', () => {
    render(<NativeThemePicker value="theme02" onChange={vi.fn()} />)

    expect(screen.getByRole('img', { name: '炫光紫绿风缩略预览' })).toHaveAttribute(
      'src',
      './desktop-assets/assets/native-theme-previews/theme02.jpg',
    )
    expect(screen.getByText('高对比发光')).toBeInTheDocument()
    expect(screen.getAllByText('科技发布、创意提案、品牌活动').length).toBeGreaterThan(0)
  })

  it('filters themes by scene and opens the selected preview', async () => {
    const user = userEvent.setup()
    render(<NativeThemePicker value="theme01" onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '金融' }))
    expect(screen.queryByRole('radio', { name: '轻拟态风' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '金色指数风' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '放大 轻拟态风 主题预览' }))
    expect(screen.getByRole('dialog', { name: '轻拟态风主题预览' })).toBeInTheDocument()
    expect(screen.getByAltText('轻拟态风主题放大预览')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('bg-black/60')
    expect(document.body.innerHTML).toContain('bg-[color:var(--app-surface)]/85')
    await user.click(screen.getByRole('button', { name: '关闭主题预览' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '轻拟态风主题预览' })).not.toBeInTheDocument())
  })

  it('selects classic native generation without showing Dashi theme choices', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container, rerender } = render(<NativeThemePicker value="theme03" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: '经典原生生成' }))
    expect(onChange).toHaveBeenCalledWith('core01')

    rerender(<NativeThemePicker value="core01" onChange={onChange} />)
    expect(container.innerHTML).not.toContain('shadow-sm')
    expect(screen.getByRole('radio', { name: '经典原生生成' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radiogroup', { name: '原生主题' })).not.toBeInTheDocument()
    expect(screen.getByText('原生内容驱动')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '主题原生生成' }))
    expect(onChange).toHaveBeenLastCalledWith('theme03')
  })

  it('supports arrow-key navigation for modes and themes, and Escape closes preview', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<NativeThemePicker value="core01" onChange={onChange} />)

    const classic = screen.getByRole('radio', { name: '经典原生生成' })
    classic.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('theme01')

    rerender(<NativeThemePicker value="theme01" onChange={onChange} />)
    const firstTheme = screen.getByRole('radio', { name: '轻拟态风' })
    firstTheme.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('theme02')

    const previewButton = screen.getByRole('button', { name: '放大 轻拟态风 主题预览' })
    await user.click(previewButton)
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(previewButton).toHaveFocus()
    })
  })
})
