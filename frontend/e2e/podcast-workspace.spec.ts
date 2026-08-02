import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const segments = Array.from({ length: 24 }, (_, index) => ({
  segment_id: `segment.${index + 1}`,
  speaker_id: index % 2 === 0 ? 'host' : 'guest',
  text: `第 ${index + 1} 段多人长节目脚本，包含足够长的文本用于验证片段栏滚动和主画布换行，不应撑出横向滚动。`,
  locked: false,
  audio_cues: [],
}));

async function mockPodcastProject(page: Page) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } });
    if (path === '/api/content-projects/podcast-long') return route.fulfill({ json: {
      success: true,
      data: {
        project_id: 'podcast-long',
        project_title: '多人长播客',
        lifecycle_state: 'active',
        last_workspace: 'podcast',
        pending_sync_count: 0,
        project_settings: { pronunciation_lexicon: [], narration_preferences: {} },
        spine: {
          id: 'spine-podcast-long',
          project_id: 'podcast-long',
          revision: 3,
          status: 'confirmed',
          content_hash: 'hash',
          document: { topic: { value: '多人长播客' }, sections: [] },
        },
        workspaces: [
          { id: 'ppt-1', project_id: 'podcast-long', kind: 'ppt', state: 'uninitialized', revision: 0, source_kind: 'spine', settings: {} },
          { id: 'video-1', project_id: 'podcast-long', kind: 'video', state: 'uninitialized', revision: 0, source_kind: 'spine', settings: {} },
          {
            id: 'podcast-1',
            project_id: 'podcast-long',
            kind: 'podcast',
            state: 'draft',
            revision: 4,
            current_version_id: 'podcast-version-4',
            source_kind: 'spine',
            settings: {},
            document: {
              schema_version: 1,
              title: '多人长播客',
              format: 'dialogue',
              language: 'zh-CN',
              speakers: [
                { speaker_id: 'host', name: '主持人', voice_ref: 'voice.host' },
                { speaker_id: 'guest', name: '嘉宾', voice_ref: 'voice.guest' },
              ],
              segments,
              mixing: { bgm_asset_ref: null, ducking: true, fade_in_ms: 500, fade_out_ms: 500 },
              cover: { asset_ref: null, title: '多人长播客', subtitle: '' },
            },
          },
        ],
      },
    } });
    if (path.endsWith('/last-workspace')) return route.fulfill({ json: { success: true, data: { last_workspace: 'podcast' } } });
    if (path.endsWith('/versions')) return route.fulfill({ json: { success: true, data: { versions: [] } } });
    if (path.endsWith('/export')) return route.fulfill({ json: { success: true, data: { task_id: 'podcast-export' } } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`long dialogue podcast workspace fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockPodcastProject(page);
    await page.goto('/project/podcast-long/podcast');

    const projectRail = page.getByRole('complementary', { name: '项目工作区导航' });
    await expect(projectRail).toBeVisible();
    // 阶段4：项目路由不再渲染应用级左栏
    await expect(page.locator('[data-content-project-nav]')).toHaveCount(0);
    await expect(projectRail.getByText('片段 · 24')).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 MP3' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 WAV' })).toBeVisible();

    await projectRail.getByRole('button', { name: /片段 24/ }).scrollIntoViewIfNeeded();
    await projectRail.getByRole('button', { name: /片段 24/ }).click();
    await expect(page.getByRole('main').nth(1)).toContainText('第 24 段多人长节目脚本');
    await expect(page.getByLabel('角色')).toHaveValue('guest');
    await expectNoHorizontalOverflow(page);

    await mkdir('../output/playwright', { recursive: true });
    await page.screenshot({ path: `../output/playwright/podcast-long-${viewport.width}.png`, fullPage: true });
  });
}
