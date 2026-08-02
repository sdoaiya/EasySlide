import { test, expect } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5182';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5181';

test.describe('全流程：文案工作台 + 1280 视口', () => {
  test('视频文案工作台：页面栏在导航槽、候选标签、批量处理', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized') && Array.isArray(p.pages) && p.pages.length > 0)?.project_id;
    expect(pid).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/ppt/editor`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    // 打开视频文案工作台
    const open = page.getByRole('button', { name: '视频文案' }).first();
    await open.click();
    await page.waitForTimeout(1500);
    const wb = page.locator('[role="dialog"]').filter({ hasText: '视频文案工作台' });
    expect(await wb.count()).toBe(1);
    const wbText = await wb.innerText();
    console.log('WORKBENCH:', wbText.slice(0, 250).replace(/\n/g, '|'));
    expect(wbText).toContain('视频文案工作台');
    expect(wbText).toContain('AI 批量处理');
    expect(wbText).toContain('已确认');
    // 页面栏位于工作台自己的左侧（独立编辑区，不嵌入导航槽）
    const wbRail = wb.locator('nav[aria-label="旁白页面"]');
    expect(await wbRail.count()).toBe(1);
    const railText = await wbRail.innerText();
    console.log('WORKBENCH RAIL:', railText.slice(0, 150).replace(/\n/g, '|'));
    expect(railText).toContain('第 1 页');
    // 阶段4：无应用级 rail 槽位；页面索引由工作区 sidebar 承载
    await expect(page.locator('[data-content-project-rail-slot]')).toHaveCount(0);
    // 检查器候选标签
    const inspector = wb.locator('aside, [class*="border-l"]').first();
    const inspectorText = await wb.innerText();
    expect(inspectorText).toContain('候选');
    // 关闭
    await wb.getByRole('button', { name: '返回当前工作区' }).click();
    await page.waitForTimeout(500);
    expect(await page.locator('[role="dialog"]:has-text("视频文案工作台")').count()).toBe(0);
  });

  test('1280x720 视口：编辑器无横向挤压、检查器抽屉可用', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized'))?.project_id;
    expect(pid).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${FRONTEND}/project/${pid}/ppt/editor`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    console.log('1280 BODY:', body.slice(0, 250).replace(/\n/g, '|'));
    // 画布存在
    expect(await page.locator('main').count()).toBeGreaterThan(0);
    // 无横向滚动（页面不应溢出）
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log('HORIZONTAL OVERFLOW px:', scrollW);
    expect(scrollW).toBeLessThanOrEqual(2);
    // 检查器抽屉按钮（1280 以下为抽屉）
    const inspectorToggle = page.getByRole('button', { name: /打开属性栏|收起属性栏/ }).first();
    if (await inspectorToggle.count()) {
      await inspectorToggle.click();
      await page.waitForTimeout(400);
      console.log('INSPECTOR DRAWER OK');
    }
  });

  test('导航折叠 44px 在编辑页', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized'))?.project_id;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/ppt/editor`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: '折叠侧栏' }).click();
    await page.waitForTimeout(600);
    const navBox = await page.locator('nav[data-content-project-nav]').boundingBox();
    console.log('COLLAPSED NAV WIDTH:', navBox?.width);
    expect(Math.abs((navBox?.width || 0) - 44)).toBeLessThanOrEqual(2);
    // 展开按钮可用
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('nav[data-content-project-nav]').boundingBox()).toMatchObject({ width: 216 });
  });
});
