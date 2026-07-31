import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { exportNativeVideo } from '@/api/endpoints'
import type { NativeSceneManifest } from '@/native-deck/nativeSceneAdapter'

describe('native scene manifest upload', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('serializes manifests in page order into multipart data', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { task_id: 'task-1' } } })
    const manifests = [manifest('page-1'), manifest('page-2')]

    await exportNativeVideo(
      'project-1',
      [new Blob(['one']), new Blob(['two'])],
      ['page-1', 'page-2'],
      'demo.mp4',
      undefined,
      undefined,
      manifests,
    )

    const formData = post.mock.calls[0][1] as FormData
    expect(JSON.parse(String(formData.get('scene_manifests')))).toEqual(manifests)
    expect(formData.get('page_ids')).toBe(JSON.stringify(['page-1', 'page-2']))
  })

  it('rejects mismatched manifest order before uploading', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { task_id: 'task-1' } } })

    await expect(exportNativeVideo(
      'project-1',
      [new Blob(['one']), new Blob(['two'])],
      ['page-1', 'page-2'],
      undefined,
      undefined,
      undefined,
      [manifest('page-2'), manifest('page-1')],
    )).rejects.toThrow('场景清单顺序与导出页面不一致')
    expect(post).not.toHaveBeenCalled()
  })
})

function manifest(pageId: string): NativeSceneManifest {
  return {
    schema_version: 1,
    page_id: pageId,
    render_mode: 'native',
    width: 1920,
    height: 1080,
    visual_style: { theme_id: 'core01_cover', colors: [], font_families: [] },
    elements: [],
    fallback_preview_path: null,
    quality: { score: 0, warnings: ['no_scene_elements'] },
  }
}
