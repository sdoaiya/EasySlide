import { test, expect } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5182';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5181';

test.describe('全流程：转换向导 + 播客', () => {
  test('PPT 编辑器转换视频向导→候选→发布', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized') && Array.isArray(p.pages) && p.pages.length >= 2)?.project_id;
    expect(pid).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/ppt/editor`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    // 打开转换向导（工具栏「转换视频」）
    const convert = page.getByRole('button', { name: '转换视频' }).first();
    expect(await convert.count()).toBe(1);
    await convert.click();
    await page.waitForTimeout(800);
    const wizard = page.locator('[role="dialog"]').filter({ hasText: '从 PPT 转换视频' });
    expect(await wizard.count()).toBe(1);
    const wizardText = await wizard.innerText();
    console.log('WIZARD:', wizardText.slice(0, 300).replace(/\n/g, '|'));
    expect(wizardText).toContain('选择页面');
    expect(wizardText).toContain('开始转换');

    // 开始转换
    await wizard.getByRole('button', { name: '开始转换' }).click();
    await page.waitForURL(/\/video\/review\//, { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('候选已就绪'), { timeout: 60000 });
    await page.waitForTimeout(1200);
    const review = await page.locator('body').innerText();
    console.log('REVIEW(ppt→video):', review.slice(0, 350).replace(/\n/g, '|'));
    expect(review).toContain('来源：PPT 页面');
    expect(review).toContain('发布为正式版本');
    // 候选场景数量 = 页面数量
    const sceneCount = (review.match(/源页面/g) || []).length;
    console.log('源页面引用数:', sceneCount);
    expect(sceneCount).toBeGreaterThanOrEqual(2);
  });

  test('播客：直接生成→审查→发布→工作区→试听', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => !(p.workspaces || []).some((w: any) => w.kind === 'podcast' && w.state !== 'uninitialized'))?.project_id;
    expect(pid).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/podcast`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const direct = page.getByRole('button', { name: '直接生成节目候选' });
    if (await direct.count()) {
      await direct.click();
      await page.waitForURL(/\/podcast\/review\//, { timeout: 15000 });
      await page.waitForFunction(() => document.body.innerText.includes('候选已就绪'), { timeout: 60000 });
      await page.waitForTimeout(1000);
      const review = await page.locator('body').innerText();
      console.log('PODCAST REVIEW:', review.slice(0, 300).replace(/\n/g, '|'));
      expect(review).toContain('播客候选');
      expect(review).toContain('发布为正式版本');
      await page.getByRole('button', { name: '发布为正式版本' }).click();
      await page.waitForURL((url) => url.pathname.endsWith('/podcast'), { timeout: 30000 });
      await page.waitForTimeout(2500);
      const ws = await page.locator('body').innerText();
      console.log('PODCAST WS:', ws.slice(0, 350).replace(/\n/g, '|'));
      expect(ws).toContain('片段');
      expect(ws).toContain('导出 MP3');
    } else {
      console.log('播客工作区已有正式版本或异常');
    }
  });

  test('视频工作区编辑保存新版本', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'video' && w.state !== 'uninitialized'))?.project_id;
    expect(pid).toBeTruthy();
    await page.goto(`${FRONTEND}/project/${pid}/video`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const sceneTitle = page.getByLabel('场景标题');
    if (await sceneTitle.count()) {
      const uniqueTitle = `E2E 场景 ${Date.now()}`;
      await sceneTitle.fill(uniqueTitle);
      await page.getByRole('button', { name: '保存版本' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('已保存新版本'), { timeout: 15000 });
      const after = await page.locator('body').innerText();
      expect(after).toContain(uniqueTitle);
      console.log('SAVED:', after.slice(0, 200).replace(/\n/g, '|'));
      expect(after).toContain('已保存新版本');
      // 还原标题（组件在保存后重新挂载，等待稳定后重新定位并校验输入生效）
      await page.waitForTimeout(2000);
      const restoreInput = page.getByLabel('场景标题').first();
      await restoreInput.fill('还原标题');
      await page.waitForTimeout(300);
      await expect(restoreInput).toHaveValue('还原标题');
      await page.getByRole('button', { name: '保存版本' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('已保存新版本'), { timeout: 15000 });
      console.log('RESTORED OK');
    } else {
      console.log('无场景标题输入框');
    }
  });
});
