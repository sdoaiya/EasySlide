import { describe, expect, it, vi } from 'vitest'
import {
  captureNativeMotionBundles,
  validateNativeMotionBundleCollection,
  validateNativeMotionSceneBundle,
  type NativeSceneManifestRef,
} from '@/native-deck/exportNativeMotionBundle'
import type { NativeSlideSpec } from '@/native-deck/types'

const slides: NativeSlideSpec[] = [
  { pageId: 'page-1', layout: 'core01_cover', props: {} },
  { pageId: 'page-2', layout: 'core02_content', props: {} },
]
const refs: NativeSceneManifestRef[] = [
  { page_id: 'page-1', sha256: 'a'.repeat(64) },
  { page_id: 'page-2', sha256: 'b'.repeat(64) },
]

describe('captureNativeMotionBundles', () => {
  it('freezes DOM and accessible CSS in stable slide order', async () => {
    document.head.innerHTML = '<style>.native-slide { color: rgb(29, 29, 31); }</style>'
    document.body.innerHTML = `
      <div id="deck">
        <section class="slide"><div class="native-slide" data-page-id="page-1"><style>.page-title { font-size: 64px; }</style><h1 class="page-title" data-motion-id="title">第一页</h1></div></section>
        <section class="slide"><div class="native-slide" data-page-id="page-2"><h2 data-motion-id="title">第二页</h2></div></section>
      </div>`

    const first = await captureNativeMotionBundles(slides, refs)
    const second = await captureNativeMotionBundles(slides, refs)

    expect(first).toEqual(second)
    expect(first.map((bundle) => bundle.page_id)).toEqual(['page-1', 'page-2'])
    expect(first[0]).toMatchObject({
      schema_version: 1,
      scene_manifest_sha256: 'a'.repeat(64),
      width: 1920,
      height: 1080,
    })
    expect(first[0].html).toContain('data-motion-id="title"')
    expect(first[0].html).not.toContain('<style')
    expect(first[0].css).toContain('.native-slide')
    expect(first[0].css).toContain('.page-title { font-size: 64px; }')
    expect(first[1].css).not.toContain('.page-title { font-size: 64px; }')
  })

  it('removes executable and editor state markup and reports remote resources', async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <div id="deck"><section class="slide"><div class="native-slide" data-page-id="page-1" contenteditable="true" data-editing="true" onclick="alert(1)">
        <script>window.bad = true</script>
        <h1 data-motion-id="title" onmouseover="alert(2)">安全页面</h1>
        <img src="https://cdn.example.com/hero.png" onload="alert(3)">
      </div></section></div>`

    const [bundle] = await captureNativeMotionBundles(slides.slice(0, 1), refs.slice(0, 1))

    expect(bundle.html).not.toMatch(/script|onclick|onmouseover|onload|contenteditable|data-editing|https:\/\//i)
    expect(bundle.warnings).toContain('unresolved_asset:page-1:img[src]:https://cdn.example.com/hero.png')
    expect(validateNativeMotionSceneBundle(bundle)).toEqual([])
  })

  it('inlines local element, poster, and CSS resources into data URLs', async () => {
    document.head.innerHTML = '<style>.hero { background-image: url("/assets/background.png"); }</style>'
    document.body.innerHTML = `
      <div id="deck"><section class="slide"><div class="native-slide hero" data-page-id="page-1" style="mask-image: url('/assets/mask.svg')">
        <h1 data-motion-id="title">媒体页</h1>
        <img data-motion-id="hero-image" src="assets/hero.png">
        <video poster="/assets/poster.jpg"></video>
      </div></section></div>`
    const resolveAsset = vi.fn(async (source: string) => `data:image/test;base64,${btoa(source)}`)

    const [bundle] = await captureNativeMotionBundles(slides.slice(0, 1), refs.slice(0, 1), document, { resolveAsset })

    expect(resolveAsset.mock.calls.map(([source]) => source)).toEqual([
      'assets/hero.png',
      '/assets/poster.jpg',
      '/assets/mask.svg',
      '/assets/background.png',
    ])
    expect(bundle.assets.map((asset) => [asset.asset_id, asset.source])).toEqual([
      ['asset-001', 'assets/hero.png'],
      ['asset-002', '/assets/poster.jpg'],
      ['asset-003', '/assets/mask.svg'],
      ['asset-004', '/assets/background.png'],
    ])
    expect(bundle.html).toContain('src="data:image/test;base64,')
    expect(bundle.html).toContain('poster="data:image/test;base64,')
    expect(bundle.css).toContain('url("data:image/test;base64,')
    expect(bundle.warnings).toEqual([])
  })

  it('removes unresolved local resources instead of leaving silent URLs', async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <div id="deck"><section class="slide"><div class="native-slide" data-page-id="page-1">
        <h1 data-motion-id="title">缺图页</h1><img src="assets/missing.png">
      </div></section></div>`

    const [bundle] = await captureNativeMotionBundles(slides.slice(0, 1), refs.slice(0, 1), document, { resolveAsset: async () => null })

    expect(bundle.html).not.toContain('assets/missing.png')
    expect(bundle.warnings).toContain('unresolved_asset:page-1:img[src]:assets/missing.png')
  })

  it('fails before upload for count, order, and motion ID violations', async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <div id="deck">
        <section class="slide"><div class="native-slide" data-page-id="page-1"><h1>缺少 ID</h1></div></section>
        <section class="slide"><div class="native-slide" data-page-id="page-2"><h2 data-motion-id="same">A</h2><p data-motion-id="same">B</p></div></section>
      </div>`

    await expect(captureNativeMotionBundles(slides, refs)).rejects.toThrow('html must contain at least one data-motion-id')

    document.querySelector<HTMLElement>('[data-page-id="page-1"] h1')!.dataset.motionId = 'title'
    await expect(captureNativeMotionBundles(slides, refs)).rejects.toThrow('data-motion-id values must be unique')
    await expect(captureNativeMotionBundles([...slides].reverse(), refs)).rejects.toThrow('第 1 页场景顺序与导出页面不一致')
    await expect(captureNativeMotionBundles(slides, refs.slice(0, 1))).rejects.toThrow('场景清单引用数量与导出页面不一致')
  })
})

describe('native motion bundle validation', () => {
  it('rejects collection order and hash divergence', () => {
    const bundles = refs.map((ref) => ({
      schema_version: 1 as const,
      page_id: ref.page_id,
      scene_manifest_sha256: ref.sha256,
      width: 1920 as const,
      height: 1080 as const,
      html: `<div class="native-slide" data-page-id="${ref.page_id}"><h1 data-motion-id="title">A</h1></div>`,
      css: '',
      assets: [],
      warnings: [],
    }))

    expect(validateNativeMotionBundleCollection([...bundles].reverse(), slides, refs)).toContain('bundles[0].page_id is out of order')
    expect(validateNativeMotionBundleCollection(bundles, slides, [{ ...refs[0], sha256: 'c'.repeat(64) }, refs[1]])).toContain(
      'bundles[0].scene_manifest_sha256 does not match reference',
    )
  })
})
