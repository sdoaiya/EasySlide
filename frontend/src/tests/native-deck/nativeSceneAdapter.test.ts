import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildNativeSceneManifest, validateNativeSceneManifest } from '@/native-deck/nativeSceneAdapter'

describe('nativeSceneAdapter', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('builds stable motion ids for title, body, image, number, and chart elements', () => {
    document.body.innerHTML = `
      <section id="slide">
        <h1>增长复盘</h1><p>关键结论</p><strong>94</strong>
        <img src="assets/hero.png"><div data-flint-chart></div>
      </section>`
    const root = document.querySelector<HTMLElement>('#slide')!
    mockRects(root, Array.from(root.children) as HTMLElement[])
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
      zIndex: element instanceof HTMLElement && element.hasAttribute('data-flint-chart') ? '3' : '1',
      color: 'rgb(29, 29, 31)',
      backgroundColor: 'rgb(255, 255, 255)',
      fontFamily: '"PingFang SC", "Segoe UI"',
    } as CSSStyleDeclaration))

    const slide = {
      pageId: 'page-1',
      layout: 'core01-summary',
      props: {
        title: '增长复盘',
        bodyText: '关键结论',
        heroImage: 'assets/hero.png',
        metricValue: 94,
        chartData: { labels: ['A'], values: [94] },
      },
    }
    const manifest = buildNativeSceneManifest(root, slide, 'page.png')

    expect(manifest.elements.map(({ id, kind }) => [id, kind])).toEqual([
      ['title', 'title'],
      ['body-text', 'body'],
      ['hero-image', 'image'],
      ['metric-value', 'number'],
      ['chart-data', 'chart'],
    ])
    expect(root.querySelector('h1')).toHaveAttribute('data-motion-id', 'title')
    expect(manifest.elements[0].bbox).toEqual([100, 100, 400, 80])
    expect(manifest.visual_style.font_families).toEqual(['PingFang SC', 'Segoe UI'])
    expect(validateNativeSceneManifest(manifest)).toEqual([])

    const edited = buildNativeSceneManifest(root, { ...slide, props: { ...slide.props, title: '新的标题' } })
    expect(edited.elements.filter(({ kind }) => kind !== 'title').map(({ id }) => id)).toEqual(
      manifest.elements.filter(({ kind }) => kind !== 'title').map(({ id }) => id),
    )
  })

  it('rejects duplicate ids and out-of-bounds boxes', () => {
    const manifest = {
      schema_version: 1 as const,
      page_id: 'page-1',
      render_mode: 'native' as const,
      width: 1920 as const,
      height: 1080 as const,
      visual_style: { theme_id: 'core01', colors: [], font_families: [] },
      elements: [
        { id: 'title', kind: 'title' as const, role: 'headline' as const, bbox: [0, 0, 100, 50] as [number, number, number, number], z_index: 1, asset_path: null, text: 'A', motion_capabilities: ['reveal'] },
        { id: 'title', kind: 'body' as const, role: 'supporting' as const, bbox: [1900, 0, 100, 50] as [number, number, number, number], z_index: 1, asset_path: null, text: 'B', motion_capabilities: ['reveal'] },
      ],
      fallback_preview_path: null,
      quality: { score: 1, warnings: [] },
    }

    expect(validateNativeSceneManifest(manifest)).toEqual([
      'duplicate or empty element id: title',
      'bbox outside scene: title',
    ])
  })

  it('reports localized schema errors for element metadata, visual style, and quality', () => {
    const manifest = {
      schema_version: 1,
      page_id: 'page-1',
      render_mode: 'native',
      width: 1920,
      height: 1080,
      visual_style: { theme_id: '', colors: ['#fff', 42], font_families: ['PingFang SC', 'PingFang SC'] },
      elements: [{
        id: 'hero',
        kind: 'video',
        role: 'narrator',
        bbox: [0, 0, 100, 50],
        z_index: 1,
        asset_path: null,
        text: null,
        motion_capabilities: ['reveal', 'fly', 'reveal'],
      }],
      fallback_preview_path: null,
      quality: { score: 2, warnings: ['low_quality', 7] },
    } as unknown as Parameters<typeof validateNativeSceneManifest>[0]

    expect(validateNativeSceneManifest(manifest)).toEqual(expect.arrayContaining([
      'visual_style.theme_id must be a non-empty string',
      'visual_style.colors must be an array of strings',
      'visual_style.font_families must contain unique values',
      'elements[0].kind is invalid',
      'elements[0].role is invalid',
      'elements[0].motion_capabilities contains an invalid capability',
      'elements[0].motion_capabilities must contain unique values',
      'quality.score must be a number between 0 and 1',
      'quality.warnings must be an array of strings',
    ]))
  })

  it('rejects capabilities that are unsupported by the element kind', () => {
    const manifest = {
      schema_version: 1 as const,
      page_id: 'page-1',
      render_mode: 'native' as const,
      width: 1920 as const,
      height: 1080 as const,
      visual_style: { theme_id: 'core01', colors: [], font_families: [] },
      elements: [{
        id: 'title',
        kind: 'title' as const,
        role: 'headline' as const,
        bbox: [0, 0, 100, 50] as [number, number, number, number],
        z_index: 1,
        asset_path: null,
        text: 'A',
        motion_capabilities: ['pan'],
      }],
      fallback_preview_path: null,
      quality: { score: 1, warnings: [] },
    }

    expect(validateNativeSceneManifest(manifest)).toContain(
      'elements[0].motion_capabilities contains an invalid capability',
    )
  })
})

function mockRects(root: HTMLElement, children: HTMLElement[]) {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1920, 1080))
  children.forEach((element, index) => {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(100 + index * 200, 100 + index * 100, 400, 80))
  })
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }
}
