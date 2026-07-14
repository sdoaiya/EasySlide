import { render, screen } from '@testing-library/react'
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
})
