import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NativeThemePicker } from '@/components/native-deck/NativeThemePicker'

const { getStaticAssetUrl } = vi.hoisted(() => ({
  getStaticAssetUrl: vi.fn((path: string) => `./desktop-assets/${path.replace(/^\//, '')}`),
}))

vi.mock('@/api/client', () => ({ getStaticAssetUrl }))

describe('NativeThemePicker', () => {
  it('uses a desktop-safe relative URL for the selected theme preview', () => {
    render(<NativeThemePicker value="theme01" onChange={vi.fn()} />)

    expect(getStaticAssetUrl).toHaveBeenCalledWith('/assets/native-theme-previews/theme01.webp')
    expect(screen.getByAltText('轻拟态风主题预览')).toHaveAttribute(
      'src',
      './desktop-assets/assets/native-theme-previews/theme01.webp',
    )
  })

  it('selects classic native generation without showing Dashi theme choices', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<NativeThemePicker value="theme03" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: '经典原生生成' }))
    expect(onChange).toHaveBeenCalledWith('core01')

    rerender(<NativeThemePicker value="core01" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: '经典原生生成' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radiogroup', { name: '原生主题' })).not.toBeInTheDocument()
    expect(screen.getByText('不依赖主题模板')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '主题原生生成' }))
    expect(onChange).toHaveBeenLastCalledWith('theme03')
  })
})
