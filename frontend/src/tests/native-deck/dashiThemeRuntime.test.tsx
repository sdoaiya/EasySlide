import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeSlideRenderer } from '@/components/native-deck/NativeSlideRenderer'
import { resolveDashiAssetUrl } from '@/native-deck/dashiRuntimeEffects'

describe('DashiAI theme runtime', () => {
  it('resolves copied assets from the application root instead of the current project route', () => {
    expect(resolveDashiAssetUrl('assets/3d/08.png')).toMatch(/^http:\/\/localhost:\d+\/assets\/3d\/08\.png$/)
  })

  it('loads a real DashiAI layout and merges user props over defaults', async () => {
    render(
      <NativeSlideRenderer
        slide={{
          pageId: 'page-roadmap',
          layout: 'theme01_page040',
          props: { title: '产品升级路线图' },
        }}
      />,
    )

    expect(screen.getByText('主题加载中...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('产品升级路线图')).toBeInTheDocument(), { timeout: 5000 })
    expect(document.querySelector('#aip-theme')).toBeInTheDocument()
  })
})
