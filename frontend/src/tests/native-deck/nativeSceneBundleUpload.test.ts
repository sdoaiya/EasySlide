import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { createNativeSceneManifestRefs, exportNativeVideo } from '@/api/endpoints'
import type { NativeMotionSceneBundle } from '@/native-deck/exportNativeMotionBundle'
import type { NativeSceneManifest } from '@/native-deck/nativeSceneAdapter'

describe('native scene bundle upload', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('serializes bundles into multipart data in manifest order', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { task_id: 'task-1' } } })
    const manifests = [manifest('page-1'), manifest('page-2')]
    const refs = await createNativeSceneManifestRefs(manifests, ['page-1', 'page-2'])
    const bundles = refs.map(bundle)

    await exportNativeVideo(
      'project-1',
      [new Blob(['one']), new Blob(['two'])],
      ['page-1', 'page-2'],
      'demo.mp4',
      undefined,
      undefined,
      manifests,
      bundles,
    )

    const formData = post.mock.calls[0][1] as FormData
    expect(JSON.parse(String(formData.get('native_scene_bundles')))).toEqual(bundles)
  })

  it.each([
    ['count', (items: NativeMotionSceneBundle[]) => items.slice(0, 1), '场景包数量与导出页面不一致'],
    ['order', (items: NativeMotionSceneBundle[]) => [...items].reverse(), '场景包顺序与导出页面不一致'],
    ['hash', (items: NativeMotionSceneBundle[]) => [{ ...items[0], scene_manifest_sha256: 'f'.repeat(64) }, items[1]], '场景包哈希与场景清单不一致'],
  ])('rejects bundle %s divergence before uploading', async (_case, mutate, message) => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { task_id: 'task-1' } } })
    const pageIds = ['page-1', 'page-2']
    const manifests = pageIds.map(manifest)
    const refs = await createNativeSceneManifestRefs(manifests, pageIds)

    await expect(exportNativeVideo(
      'project-1',
      [new Blob(['one']), new Blob(['two'])],
      pageIds,
      undefined,
      undefined,
      undefined,
      manifests,
      mutate(refs.map(bundle)),
    )).rejects.toThrow(message)
    expect(post).not.toHaveBeenCalled()
  })

  it('keeps legacy calls without bundles compatible', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { task_id: 'task-1' } } })

    await exportNativeVideo('project-1', [new Blob(['one'])], ['page-1'])

    const formData = post.mock.calls[0][1] as FormData
    expect(formData.has('native_scene_bundles')).toBe(false)
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

function bundle(ref: { page_id: string; sha256: string }): NativeMotionSceneBundle {
  return {
    schema_version: 1,
    page_id: ref.page_id,
    scene_manifest_sha256: ref.sha256,
    width: 1920,
    height: 1080,
    html: `<div class="native-slide" data-page-id="${ref.page_id}"><h1 data-motion-id="title">A</h1></div>`,
    css: '',
    assets: [],
    warnings: [],
  }
}
