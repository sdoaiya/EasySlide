import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeSlideRenderer } from '@/components/native-deck/NativeSlideRenderer'
import { resolveDashiAssetUrl } from '@/native-deck/dashiRuntimeEffects'
import { pruneDashiProps } from '@/native-deck/dashiThemeRuntime'

describe('DashiAI theme runtime', () => {
  it('resolves copied assets from the application root instead of the current project route', () => {
    expect(resolveDashiAssetUrl('assets/3d/08.png')).toMatch(/^http:\/\/localhost:\d+\/assets\/3d\/08\.png$/)
  })

  it('prunes stale layout props while preserving nested contract values', () => {
    const result = pruneDashiProps({
      defaultProps: { title: '', settings: { accent: '' }, items: [{ label: '' }] },
      controls: [{ key: 'showTitle' }],
    }, {
      title: '保留',
      settings: { accent: '青', stale: '删除' },
      items: [{ label: '项目', stale: '删除' }],
      showTitle: true,
      stale: '删除',
    })

    expect(result).toEqual({ title: '保留', settings: { accent: '青' }, items: [{ label: '项目' }], showTitle: true })
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
    expect(document.querySelector('.native-slide')).toHaveAttribute('data-deck-active')
  })

  it('disables Dashi internal effects when the page setting is off', async () => {
    render(
      <NativeSlideRenderer
        slide={{
          pageId: 'page-static',
          layout: 'theme01_page040',
          props: { title: '静态预览', __animation: { internal: false } },
        }}
      />,
    )

    await waitFor(() => expect(screen.getByText('静态预览')).toBeInTheDocument(), { timeout: 5000 })
    expect(document.querySelector('.native-slide')).not.toHaveAttribute('data-deck-active')
  })

  it('replays the Dashi page when the animation replay token changes', async () => {
    const view = render(
      <NativeSlideRenderer
        slide={{ pageId: 'page-replay', layout: 'theme01_page040', props: { title: '第一次', __animation: { replay: 1 } } }}
      />,
    )
    await waitFor(() => expect(screen.getByText('第一次')).toBeInTheDocument(), { timeout: 5000 })
    const firstFrame = document.querySelector('.native-slide')
    view.rerender(<NativeSlideRenderer slide={{ pageId: 'page-replay', layout: 'theme01_page040', props: { title: '第二次', __animation: { replay: 2 } } }} />)
    await waitFor(() => expect(screen.getByText('第二次')).toBeInTheDocument(), { timeout: 5000 })
    expect(document.querySelector('.native-slide')).not.toBe(firstFrame)
  })

  it('exposes optional element-level motion settings without enabling them during export', async () => {
    render(
      <NativeSlideRenderer
        slide={{
          pageId: 'page-elements',
          layout: 'theme01_page040',
          props: { title: '元素动效', __animation: { elementEnter: 'slide-up', elementDuration: 500, elementStagger: 90 } },
        }}
      />,
    )

    await waitFor(() => expect(screen.getByText('元素动效')).toBeInTheDocument(), { timeout: 5000 })
    const frame = document.querySelector('.native-slide')
    expect(frame).toHaveAttribute('data-element-animation', 'slide-up')
    expect(frame).toHaveStyle('--native-element-duration: 500ms')
    expect(frame).toHaveStyle('--native-element-stagger: 90ms')
  })

  it('keeps click-triggered element motion at its initial step until activated', async () => {
    render(
      <NativeSlideRenderer
        slide={{
          pageId: 'page-click-motion',
          layout: 'theme01_page040',
          props: { title: '单击动效', __animation: { elementEnter: 'fade', elementTrigger: 'click' } },
        }}
        elementAnimationActive={false}
        elementAnimationStep={0}
      />,
    )

    await waitFor(() => expect(screen.getByText('单击动效')).toBeInTheDocument(), { timeout: 5000 })
    const frame = document.querySelector('.native-slide')
    expect(frame).toHaveAttribute('data-element-trigger', 'click')
    expect(frame).toHaveAttribute('data-element-step', '0')
  })

  it('exposes rotate-in motion to the shared element animation CSS contract', async () => {
    render(
      <NativeSlideRenderer
        slide={{
          pageId: 'page-rotate-motion',
          layout: 'theme01_page040',
          props: { title: '旋转动效', __animation: { elementEnter: 'rotate-in', elementDuration: 520 } },
        }}
      />,
    )

    await waitFor(() => expect(screen.getByText('旋转动效')).toBeInTheDocument(), { timeout: 5000 })
    const frame = document.querySelector('.native-slide')
    expect(frame).toHaveAttribute('data-element-animation', 'rotate-in')
    expect(frame).toHaveStyle('--native-element-duration: 520ms')
  })
})
