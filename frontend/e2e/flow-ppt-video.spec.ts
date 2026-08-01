import { test, expect } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5182';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5181';

test.describe('全流程：PPT→视频转换链路', () => {
  test('向导→候选→审查→发布→视频工作区', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    // 选一个有 PPT 页面且视频未初始化的项目
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized') && !(p.workspaces || []).some((w: any) => w.kind === 'video' && w.state !== 'uninitialized'))?.project_id
      || list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt'))?.project_id;
    expect(pid, '需要 PPT 项目').toBeTruthy();
    test.info().annotations.push({ type: 'project', description: pid });

    // 打开视频工作区入口（未初始化空态）
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/video`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    console.log('VIDEO ENTRY:', body.slice(0, 300).replace(/\n/g, '|'));

    // 直接生成（brief→video 机械候选，不依赖 AI）
    const directButton = page.getByRole('button', { name: '直接生成视频候选' });
    if (await directButton.count()) {
      await directButton.click();
      await page.waitForURL(/\/video\/review\//, { timeout: 15000 });
      console.log('REVIEW URL:', page.url());
      // 等待 REVIEW_READY
      await page.waitForFunction(() => document.body.innerText.includes('候选已就绪') || document.body.innerText.includes('发布为正式版本'), { timeout: 60000 });
      await page.waitForTimeout(1500);
      const reviewBody = await page.locator('body').innerText();
      console.log('REVIEW:', reviewBody.slice(0, 400).replace(/\n/g, '|'));
      expect(reviewBody).toContain('发布为正式版本');
      expect(reviewBody).toContain('候选已就绪');
      // 发布
      await page.getByRole('button', { name: '发布为正式版本' }).click();
      await page.waitForURL((url) => url.pathname.endsWith('/video'), { timeout: 30000 });
      await page.waitForTimeout(3000);
      const wsBody = await page.locator('body').innerText();
      console.log('VIDEO WS:', wsBody.slice(0, 300).replace(/\n/g, '|'));
      expect(wsBody).toContain('场景');
    } else {
      console.log('视频工作区已有正式版本或入口状态异常，body:', body.slice(0, 200));
    }
  });

  test('视频导出设置弹窗已简化（默认只显示核心项）', async ({ page }) => {
    const projects = await (await fetch(`${BACKEND}/api/projects`)).json();
    const list = projects?.data?.projects || [];
    const pid = list.find((p: any) => (p.workspaces || []).some((w: any) => w.kind === 'ppt' && w.state !== 'uninitialized' && Array.isArray(p.pages) && p.pages.length > 0))?.project_id;
    expect(pid).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND}/project/${pid}/ppt/editor`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    // 打开导出菜单 → 讲解视频设置
    const exportBtn = page.getByRole('button', { name: '导出 导出' }).first();
    if (await exportBtn.count()) await exportBtn.click();
    const videoExport = page.getByRole('button', { name: /导出为讲解视频|导出 讲解视频/ }).first();
    if (await videoExport.count()) await videoExport.click();

    await page.waitForTimeout(1500);
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '视频导出设置' }).or(page.locator('[role="dialog"]:has-text("讲解视频导出设置")')).first();
    if (await dialog.count()) {
      const dlgText = await dialog.innerText();
      console.log('DIALOG:', dlgText.slice(0, 400).replace(/\n/g, '|'));
      // 默认展开时：成片风格可见，语音引擎/旁白模式/语音音色应在高级设置内（不可见）
      expect(dlgText).toContain('成片风格');
      expect(dlgText).not.toContain('语音音色');
      expect(dlgText).not.toContain('旁白模式');
      // 展开高级设置
      const advanced = dialog.getByRole('button', { name: '高级设置' }).first();
      if (await advanced.count()) {
        await advanced.click();
        await page.waitForTimeout(500);
        const expanded = await dialog.innerText();
        console.log('DIALOG EXPANDED:', expanded.slice(0, 300).replace(/\n/g, '|'));
        expect(expanded).toContain('语音引擎');
        expect(expanded).toContain('旁白模式');
      }
    } else {
      console.log('未找到视频导出弹窗（可能导出入口不同）');
    }
  });
});
