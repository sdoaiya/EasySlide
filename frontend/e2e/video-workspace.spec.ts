import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const scenes = Array.from({ length: 20 }, (_, index) => ({
  scene_id: `scene.${index + 1}`,
  title: `场景 ${index + 1}：核心观点`,
  visual: { kind: 'blank', source_ref: null },
  narration: { mode: 'single', text: `这是第 ${index + 1} 个场景的旁白。`, segments: [] },
  subtitles: { enabled: true, text: `这是第 ${index + 1} 个场景的旁白。` },
  duration_ms: 3000,
  transition: 'cut',
  animation: { intensity: 'subtle', cues: [] },
  audio_cues: [],
}));

async function mockVideoWorkspace(page: Page) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access-code/check') {
      return route.fulfill({ json: { success: true, data: { enabled: false } } });
    }
    if (path === '/api/content-projects/video-workspace') {
      return route.fulfill({ json: {
        success: true,
        data: {
          project_id: 'video-workspace',
          last_workspace: 'video',
          pending_sync_count: 0,
          spine: {
            id: 'spine-video',
            project_id: 'video-workspace',
            revision: 1,
            status: 'confirmed',
            content_hash: 'video-hash',
            document: { topic: { value: '独立视频项目' }, sections: [] },
          },
          workspaces: [
            { id: 'ppt-video', project_id: 'video-workspace', kind: 'ppt', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
            {
              id: 'video-1',
              project_id: 'video-workspace',
              kind: 'video',
              state: 'draft',
              revision: 1,
              current_version_id: 'version-1',
              source_kind: 'spine',
              settings: {},
              document: { schema_version: 1, title: '独立视频项目', aspect_ratio: '16:9', scenes },
            },
            { id: 'podcast-video', project_id: 'video-workspace', kind: 'podcast', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
          ],
        },
      } });
    }
    if (path.endsWith('/workspaces/video/versions')) {
      return route.fulfill({ json: { success: true, data: { versions: [] } } });
    }
    return route.fulfill({ json: { success: true, data: {} } });
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`video workspace keeps one rail at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockVideoWorkspace(page);
    await page.goto('/project/video-workspace/video');

    await expect(page.getByRole('complementary', { name: '项目工作区导航' })).toBeVisible();
    // 阶段4：项目路由不再渲染应用级左栏
    await expect(page.locator('[data-content-project-nav]')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: '页面栏' })).toContainText('场景 20');
    await expect(page.getByRole('main')).toContainText('场景 1：核心观点');
    await expect(page.getByRole('complementary', { name: '属性栏' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await mkdir('../output/playwright', { recursive: true });
    await page.screenshot({ path: `../output/playwright/video-workspace-${viewport.width}.png`, fullPage: true });
  });
}
