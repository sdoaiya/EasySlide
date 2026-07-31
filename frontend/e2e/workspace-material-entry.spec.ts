import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const scenes = [{
  scene_id: 'scene.1',
  title: '开场素材场景',
  visual: { kind: 'blank', source_ref: null },
  narration: { mode: 'single', text: '视频旁白。', segments: [] },
  subtitles: { enabled: true, text: '视频旁白。' },
  duration_ms: 3000,
  transition: 'cut',
  animation: { intensity: 'subtle', cues: [] },
  audio_cues: [],
}];

const podcastSegments = [{ segment_id: 'segment.1', speaker_id: 'host', text: '播客脚本。', locked: false, audio_cues: [] }];

async function mockWorkspaceMaterials(page: Page) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } });
    if (path === '/api/projects') return route.fulfill({ json: { success: true, data: { projects: [], total: 0 } } });
    if (path === '/api/content-projects/workspace-materials') return route.fulfill({ json: {
      success: true,
      data: {
        project_id: 'workspace-materials',
        last_workspace: 'video',
        pending_sync_count: 0,
        spine: { id: 'spine-1', project_id: 'workspace-materials', revision: 1, status: 'confirmed', content_hash: 'hash', document: { topic: { value: '素材工作区' }, sections: [] } },
        workspaces: [
          { id: 'ppt-1', project_id: 'workspace-materials', kind: 'ppt', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
          { id: 'video-1', project_id: 'workspace-materials', kind: 'video', state: 'draft', revision: 1, current_version_id: 'video-version', source_kind: 'spine', settings: {}, document: { schema_version: 1, title: '视频素材工作区', aspect_ratio: '16:9', scenes } },
          { id: 'podcast-1', project_id: 'workspace-materials', kind: 'podcast', state: 'draft', revision: 1, current_version_id: 'podcast-version', source_kind: 'spine', settings: {}, document: { schema_version: 1, title: '播客素材工作区', format: 'single', language: 'zh-CN', speakers: [{ speaker_id: 'host', name: '主持人', voice_ref: 'edge:voice' }], segments: podcastSegments, mixing: { bgm_asset_ref: null, ducking: true, fade_in_ms: 0, fade_out_ms: 0 }, cover: { asset_ref: null, title: '播客素材工作区', subtitle: '' } } },
        ],
      },
    } });
    if (path.endsWith('/versions')) return route.fulfill({ json: { success: true, data: { versions: [] } } });
    if (path === '/api/materials') {
      const mediaKind = url.searchParams.get('media_kind') || '';
      const material = mediaKind.includes('transcript')
        ? { id: 'script-1', url: '/files/materials/script.md', filename: 'script.md', original_filename: 'script.md', media_kind: 'transcript', mime_type: 'text/markdown', created_at: '', updated_at: '' }
        : mediaKind.includes('audio') && !mediaKind.includes('image')
          ? { id: 'audio-1', url: '/files/materials/music.mp3', filename: 'music.mp3', original_filename: 'music.mp3', media_kind: 'audio', mime_type: 'audio/mpeg', created_at: '', updated_at: '' }
          : { id: 'video-asset-1', url: '/files/materials/clip.mp4', filename: 'clip.mp4', original_filename: 'clip.mp4', media_kind: 'video', mime_type: 'video/mp4', created_at: '', updated_at: '' };
      return route.fulfill({ json: { success: true, data: { materials: [material], count: 1 } } });
    }
    return route.fulfill({ json: { success: true, data: {} } });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  expect(overflow.html, JSON.stringify(overflow)).toBeLessThanOrEqual(1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(1);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`video material picker fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockWorkspaceMaterials(page);
    await page.goto('/project/workspace-materials/video');
    await page.getByRole('button', { name: '选择' }).click();
    const dialog = page.getByRole('dialog', { name: '选择素材' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('video/mp4')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await mkdir('../output/playwright', { recursive: true });
    await page.screenshot({ path: `../output/playwright/workspace-video-material-${viewport.width}.png`, fullPage: true });
  });

  test(`podcast material picker fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockWorkspaceMaterials(page);
    await page.goto('/project/workspace-materials/podcast');
    await page.getByRole('button', { name: '选择素材' }).click();
    const dialog = page.getByRole('dialog', { name: '选择素材' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('text/markdown')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await mkdir('../output/playwright', { recursive: true });
    await page.screenshot({ path: `../output/playwright/workspace-podcast-material-${viewport.width}.png`, fullPage: true });
  });
}
