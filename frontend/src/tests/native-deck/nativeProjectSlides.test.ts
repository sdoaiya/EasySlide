import { describe, expect, it } from 'vitest'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import { buildNativeProjectSlides } from '@/native-deck/nativeProjectSlides'
import type { Project } from '@/types'

const contracts = layoutManifest.layouts as unknown as readonly NativeLayoutContract[]

function project(pages: Project['pages'], nativeTheme?: string): Project {
  return {
    project_id: 'project-1',
    idea_prompt: '',
    render_mode: 'native',
    native_theme: nativeTheme,
    status: 'DESCRIPTIONS_GENERATED',
    pages,
    created_at: '',
    updated_at: '',
  }
}

describe('buildNativeProjectSlides', () => {
  it('keeps the selected Dashi theme for pending native pages after reopening a project', () => {
    const slides = buildNativeProjectSlides(project([
      { page_id: 'page-1', order_index: 0, status: 'DESCRIPTION_GENERATED', outline_content: { title: '封面', points: [] } },
      { page_id: 'page-2', order_index: 1, status: 'DESCRIPTION_GENERATED', outline_content: { title: '摘要', points: [] } },
    ], 'theme05'), contracts)

    expect(slides).toHaveLength(2)
    expect(slides.every((slide) => slide.pending)).toBe(true)
    expect(slides.every((slide) => slide.layout.startsWith('theme05_'))).toBe(true)
    expect(slides[0].props.title).toBe('封面')
  })

  it('restores the theme from existing native layouts for old projects', () => {
    const slides = buildNativeProjectSlides(project([
      {
        page_id: 'page-1',
        order_index: 0,
        status: 'NATIVE_GENERATED',
        outline_content: { title: '已生成', points: [] },
        native_layout: 'theme07_page001',
        native_props: { title: '已生成' },
      },
      { page_id: 'page-2', order_index: 1, status: 'DESCRIPTION_GENERATED', outline_content: { title: '待生成', points: [] } },
    ]), contracts)

    expect(slides[0].layout).toBe('theme07_page001')
    expect(slides[1].layout.startsWith('theme07_')).toBe(true)
  })
})
