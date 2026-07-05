import { test, expect } from '@playwright/test';

test.describe('Settings page API key labels and links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('Baidu section title should not contain OCR', async ({ page }) => {
    const baiduSection = page.locator('h2').filter({ hasText: /百度配置|Baidu Configuration/ });
    await expect(baiduSection).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: /百度 OCR 配置|Baidu OCR Configuration/ })).not.toBeVisible();
  });

  test('Baidu API Key label should not contain OCR', async ({ page }) => {
    const baiduLabel = page.locator('label').filter({ hasText: /百度 API Key|Baidu API Key/ });
    await expect(baiduLabel).toBeVisible();
    await expect(page.locator('label:has-text("百度 OCR API Key")')).not.toBeVisible();
  });

  test('MinerU Token field has application link', async ({ page }) => {
    const mineruLink = page.locator('a[href="https://mineru.net/apiManage/token"]');
    await expect(mineruLink).toBeVisible();
    await expect(mineruLink).toHaveAttribute('target', '_blank');
  });

  test('Baidu API Key field has application link', async ({ page }) => {
    const baiduLink = page.locator('a[href="https://console.bce.baidu.com/iam/#/iam/apikey/list"]');
    await expect(baiduLink).toBeVisible();
    await expect(baiduLink).toHaveAttribute('target', '_blank');
  });

  test('OpenAI Platform has API key link', async ({ page }) => {
    const targetUrl = 'https://platform.openai.com/api-keys';

    const openaiLinks = page.locator(`a[href="${targetUrl}"]`);
    await expect(openaiLinks).toHaveCount(2);
    await expect(openaiLinks.first()).toBeVisible();
    await expect(openaiLinks.first()).toHaveAttribute('target', '_blank');
    await expect(openaiLinks.last()).toBeVisible();
    await expect(openaiLinks.last()).toHaveAttribute('target', '_blank');
    await expect(page.locator('a[href*="aihubmix"]')).toHaveCount(0);
  });

  test('OpenAI API key guide uses Platform flow', async ({ page }) => {
    await expect(page.locator('li').filter({ hasText: /OpenAI Platform|API keys/ })).toBeVisible();
    await expect(page.locator('li').filter({ hasText: /Create new secret key/ })).toBeVisible();
    await expect(page.locator('li').filter({ hasText: /复制生成的 API Key|Copy the generated API key/ })).toBeVisible();
  });
});
