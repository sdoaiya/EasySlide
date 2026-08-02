import { test, expect } from '@playwright/test';

test.describe('桌面端首次打开', () => {
  test('桌面环境（electronAPI）访问 / 直接进入应用而非官网', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electronAPI = { platform: 'win32' };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5182/#/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    console.log('URL after open:', page.url());
    expect(page.url()).toContain('#/home');
    const body = await page.locator('body').innerText();
    expect(body).toContain('作品工作台');
    expect(body).not.toContain('AI PRESENTATION WORKSPACE');
  });

  test('公网环境访问 / 仍显示官网落地页', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5182/#/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    expect(page.url()).toContain('#/');
    const body = await page.locator('body').innerText();
    expect(body).toContain('AI PRESENTATION WORKSPACE');
  });
});
