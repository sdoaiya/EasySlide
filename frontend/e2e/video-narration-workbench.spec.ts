import { expect, test, type Page } from '@playwright/test';

const projectId = 'narration-workbench-e2e';
const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const segments = Array.from({ length: 8 }, (_, index) => ({
  segment_id: `segment-${index + 1}`,
  speaker_id: index % 2 === 0 ? 'host' : 'expert',
  text: `这是第 ${index + 1} 段用于验证滚动区域和底部操作栏的双人讲解文案。`,
}));

const version = {
  id: 'version-1',
  page_id: 'page-1',
  version_number: 1,
  mode: 'dialogue',
  language: 'zh-CN',
  text: segments.map((segment) => segment.text).join('\n'),
  segments,
  source_type: 'manual',
  status: 'applied',
  content_hash: 'narration-workbench-hash',
  created_by: 'user',
};

async function mockApis(page: Page) {
  let savePayload: Record<string, unknown> | null = null;

  await page.route((url) => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === `/api/content-projects/${projectId}`) {
      return route.fulfill({ json: {
        success: true,
        data: {
          project_id: projectId,
          last_workspace: 'ppt',
          pending_sync_count: 0,
          spine: {
            id: 'spine-1',
            project_id: projectId,
            revision: 1,
            status: 'confirmed',
            content_hash: 'spine-hash',
            document: { topic: { value: '视频文案工作台验收' }, sections: [] },
          },
          workspaces: [
            {
              id: 'ppt-1',
              project_id: projectId,
              kind: 'ppt',
              state: 'confirmed',
              revision: 1,
              source_kind: 'legacy',
              settings: {},
            },
          ],
        },
      } });
    }

    if (path === `/api/projects/${projectId}`) {
      return route.fulfill({ json: {
        success: true,
        data: {
          id: projectId,
          project_id: projectId,
          status: 'COMPLETED',
          export_allow_partial: true,
          pages: [{
            id: 'page-1',
            page_id: 'page-1',
            order_index: 0,
            status: 'COMPLETED',
            generated_image_path: '/files/mock/workbench.png',
            outline_content: { title: '视频文案工作台验收', points: ['可编辑', '可保存'] },
            description_content: { text: '验证长双人文案不会被底部操作栏遮挡。' },
          }],
        },
      } });
    }

    if (path === `/api/projects/${projectId}/narrations`) {
      return route.fulfill({ json: {
        success: true,
        data: {
          pages: [{
            page_id: 'page-1',
            order_index: 0,
            current_version_id: 'version-1',
            locked: false,
            revision: 3,
            word_count: version.text.length,
            estimated_seconds: 30,
            candidate_count: 0,
          }],
          total_pages: 1,
          confirmed_pages: 1,
          missing_pages: 0,
          candidate_pages: 0,
        },
      } });
    }

    if (path === `/api/projects/${projectId}/pages/page-1/narration/versions`) {
      if (request.method() === 'POST') {
        savePayload = request.postDataJSON();
        return route.fulfill({ json: {
          success: true,
          data: { version: { ...version, id: 'version-2' }, revision: 4 },
        } });
      }
      return route.fulfill({ json: {
        success: true,
        data: {
          page_id: 'page-1',
          revision: 3,
          current_version_id: 'version-1',
          locked: false,
          versions: [version],
        },
      } });
    }

    if (path === '/api/settings') {
      return route.fulfill({ json: { success: true, data: {} } });
    }
    if (path === '/api/output-language') {
      return route.fulfill({ json: { success: true, data: { language: 'zh' } } });
    }
    if (path === '/api/user-templates') {
      return route.fulfill({ json: { success: true, data: { templates: [] } } });
    }
    return route.fulfill({ json: { success: true, data: {} } });
  });

  await page.route('**/files/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.alloc(100),
  }));

  return () => savePayload;
}

for (const viewport of viewports) {
  test(`keeps the final dialogue segment above the footer at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const getSavePayload = await mockApis(page);

    await page.goto(`/project/${projectId}/preview`);
    await page.getByRole('button', { name: '视频文案' }).click();

    const dialog = page.getByRole('dialog', { name: '视频文案工作台' });
    await expect(dialog).toBeVisible();
    const main = dialog.locator('main');
    const footer = dialog.locator('footer');
    const lastSegment = dialog.getByLabel('第 8 段文案');
    await lastSegment.scrollIntoViewIfNeeded();
    await expect(lastSegment).toBeVisible();

    const geometry = await Promise.all([
      dialog.boundingBox(),
      main.boundingBox(),
      footer.boundingBox(),
      lastSegment.boundingBox(),
    ]);
    const [dialogBox, mainBox, footerBox, lastSegmentBox] = geometry;
    expect(dialogBox).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);
    expect(lastSegmentBox!.y + lastSegmentBox!.height).toBeLessThanOrEqual(mainBox!.y + mainBox!.height + 1);
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await lastSegment.fill('更新后的第八段文案');
    await dialog.getByLabel('第 8 段角色').selectOption('host');
    await dialog.getByRole('button', { name: '保存确认稿' }).click();
    await expect.poll(getSavePayload).not.toBeNull();
    expect(getSavePayload()).toMatchObject({
      base_revision: 3,
      mode: 'dialogue',
      language: 'zh-CN',
    });
    expect((getSavePayload()!.segments as Array<{ speaker_id: string; text: string }>)[7]).toMatchObject({
      speaker_id: 'host',
      text: '更新后的第八段文案',
    });
  });
}
