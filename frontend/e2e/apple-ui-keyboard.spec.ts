import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } })
    if (path === '/api/settings') return route.fulfill({ json: { success: true, data: { language: 'zh', output_language: 'zh' } } })
    if (path === '/api/output-language') return route.fulfill({ json: { success: true, data: { language: 'zh' } } })
    if (path === '/api/user-templates') return route.fulfill({ json: { success: true, data: { templates: [] } } })
    return route.fulfill({ json: { success: true, data: {} } })
  })
})

test('primary creation controls are reachable by keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})

test('Escape closes the material center dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /素材中心/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
