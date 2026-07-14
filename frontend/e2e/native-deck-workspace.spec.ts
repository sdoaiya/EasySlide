import { expect, test, type Page } from '@playwright/test'

const projectId = 'native-workspace-e2e'
const dashiProjectId = 'dashi-workspace-e2e'

async function mockNativeProject(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/access-code/check') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
    }
    if (pathname === '/api/settings') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { output_language: 'zh' } }) })
    }
    if (pathname === '/api/output-language') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    }
    if (pathname === `/api/projects/${projectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: projectId,
            project_id: projectId,
            idea_prompt: '原生工作区视觉验收',
            render_mode: 'native',
            status: 'NATIVE_DECK_GENERATED',
            pages: [
              { id: 'page-1', page_id: 'page-1', order_index: 0, status: 'NATIVE_GENERATED', outline_content: { title: '原生页面验收', points: [] }, native_layout: 'core01_cover', native_props: { kicker: 'EasySlide', title: '原生页面验收', subtitle: '逐元素可编辑导出' } },
              { id: 'page-2', page_id: 'page-2', order_index: 1, status: 'NATIVE_GENERATED', outline_content: { title: '第二页', points: [] }, native_layout: 'core01_end', native_props: { title: '第二页', subtitle: '保持结构化编辑' } },
            ],
          },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
}

async function mockDashiProject(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/access-code/check') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
    if (pathname === '/api/settings') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { output_language: 'zh' } }) })
    if (pathname === '/api/output-language') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    if (pathname === `/api/projects/${dashiProjectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: dashiProjectId,
            project_id: dashiProjectId,
            idea_prompt: 'DashiAI 主题验收',
            render_mode: 'native',
            native_theme: 'theme01',
            status: 'NATIVE_DECK_GENERATED',
            pages: [
              {
                id: 'page-roadmap', page_id: 'page-roadmap', order_index: 0, status: 'NATIVE_GENERATED',
                outline_content: { title: '产品升级路线图', points: [] }, native_layout: 'theme01_page040',
                native_props: {
                  title: '产品升级路线图',
                  phases: [
                    { period: 'Q1', step: '01', heading: '能力验证', points: ['主题运行时', '逐元素编辑'], verdict: '可用' },
                    { period: 'Q2', step: '02', heading: '质量提升', points: ['布局去重', '导出校验'], verdict: '稳定' },
                    { period: 'Q3', step: '03', heading: '规模推广', points: ['全主题覆盖', '资产复用'], verdict: '交付' },
                  ],
                },
              },
              {
                id: 'page-code', page_id: 'page-code', order_index: 1, status: 'NATIVE_GENERATED',
                outline_content: { title: '技术路线导览', points: [] }, native_layout: 'theme03_page006',
                native_props: { titlePre: '技术', titleAccent: '路线导览', showDecor: true, decorSrc: 'assets/3d/08.png' },
              },
              {
                id: 'page-unicorn', page_id: 'page-unicorn', order_index: 2, status: 'NATIVE_GENERATED',
                outline_content: { title: '动态背景验收', points: [] }, native_layout: 'theme01_page030',
                native_props: { title: '动态背景验收', backgroundMode: 'unicorn', unicornScene: 'tech' },
              },
            ],
          },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
}

for (const viewport of [
  { width: 1200, height: 760 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`native workspace fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await mockNativeProject(page)
    await page.goto(`/project/${projectId}/preview`)

    const shell = page.locator('.workspace-shell')
    await expect(shell).toBeVisible()
    await expect(page.getByRole('main')).toContainText('原生页面验收')
    await expect(shell).toHaveAttribute('data-inspector-layout', viewport.width === 1200 ? 'drawer' : 'column')

    if (viewport.width === 1200) {
      await expect(page.getByRole('button', { name: '打开属性栏' })).toBeVisible()
      await page.getByRole('button', { name: '打开属性栏' }).click()
      await expect(page.getByRole('complementary', { name: '属性栏' })).toContainText('title')
    } else {
      await expect(page.getByRole('complementary', { name: '属性栏' })).toContainText('title')
    }

    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight - window.innerHeight,
    }))
    expect(overflow.width).toBeLessThanOrEqual(1)
    expect(overflow.height).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`native-${viewport.width}x${viewport.height}.png`), fullPage: true })
  })
}

test('DashiAI runtime renders complex props and copied assets', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockDashiProject(page)
  await page.goto(`/project/${dashiProjectId}/preview`)

  await expect(page.getByRole('main')).toContainText('产品升级路线图')
  await expect(page.getByRole('complementary', { name: '属性栏' })).toContainText('phases')
  await page.getByRole('button', { name: /第 2 页/ }).click()
  await expect(page.getByRole('main')).toContainText('技术路线导览')
  const decor = page.locator('main img[src*="assets/3d/08.png"]').first()
  await expect(decor).toBeVisible()
  await expect.poll(() => decor.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

  await page.getByRole('button', { name: /第 3 页/ }).click()
  const unicornFrame = page.locator('main .bt-unicorn-frame[data-unicorn-ready="true"]').first()
  await expect(unicornFrame).toBeVisible({ timeout: 15000 })
  const canvas = unicornFrame.locator('canvas')
  await expect(canvas).toBeVisible()
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width * element.height)).toBeGreaterThan(0)

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.width).toBeLessThanOrEqual(1)
  expect(overflow.height).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('dashiai-runtime-1440x900.png'), fullPage: true })
})
