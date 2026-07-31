import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const imageProject = {
  project_id: 'workspace-image',
  id: 'workspace-image',
  project_title: '图片模式工作区',
  creation_type: 'topic',
  render_mode: 'image',
  image_aspect_ratio: '16:9',
  extra_requirements: '减少文字，突出关键数据',
  status: 'COMPLETED',
  pages: [{
    id: 'page-1',
    page_id: 'page-1',
    order_index: 0,
    status: 'COMPLETED',
    generated_image_path: '/files/workspace-slide.svg',
    outline_content: { title: '行业现状与市场规模', points: ['市场持续增长', '多模态成为主流'] },
    description_content: { text: '用数据对比行业规模、技术演进和主要应用方向。' },
  }],
}

const nativeProject = {
  ...imageProject,
  project_id: 'workspace-native',
  id: 'workspace-native',
  project_title: '原生可编辑工作区',
  render_mode: 'native',
  status: 'NATIVE_DECK_GENERATED',
  pages: [{
    id: 'page-1',
    page_id: 'page-1',
    order_index: 0,
    status: 'NATIVE_GENERATED',
    native_layout: 'core01_agenda',
    native_props: { title: '行业现状与市场规模', items: ['市场持续增长', '多模态成为主流'] },
    outline_content: { title: '行业现状与市场规模', points: ['市场持续增长', '多模态成为主流'] },
    description_content: { text: '原生元素可直接编辑。' },
  }],
}

const renovationProject = {
  ...imageProject,
  project_id: 'workspace-renovation',
  id: 'workspace-renovation',
  project_title: '翻新 PPT 工作区',
  creation_type: 'ppt_renovation',
}

async function mockWorkspaceApis(page: Page) {
  await page.route('**/files/workspace-slide.svg*', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#17345f"/><rect x="80" y="90" width="1440" height="720" rx="20" fill="#fff"/><text x="150" y="210" font-family="Segoe UI" font-size="68" font-weight="700" fill="#1d1d1f">行业现状与市场规模</text><text x="150" y="330" font-family="Segoe UI" font-size="38" fill="#5f5f66">市场持续增长 · 多模态成为主流</text></svg>',
  }))
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } })
    if (path === '/api/projects/workspace-image') return route.fulfill({ json: { success: true, data: imageProject } })
    if (path === '/api/projects/workspace-native') return route.fulfill({ json: { success: true, data: nativeProject } })
    if (path === '/api/projects/workspace-renovation') return route.fulfill({ json: { success: true, data: renovationProject } })
    if (path.startsWith('/api/content-projects/workspace-')) {
      const project = path.endsWith('workspace-native')
        ? nativeProject
        : path.endsWith('workspace-renovation')
          ? renovationProject
          : imageProject
      return route.fulfill({ json: {
        success: true,
        data: {
          project_id: project.id,
          last_workspace: 'ppt',
          pending_sync_count: 0,
          spine: {
            id: `spine-${project.id}`,
            project_id: project.id,
            revision: 1,
            status: 'confirmed',
            content_hash: 'workspace-hash',
            document: { topic: { value: project.project_title }, sections: [] },
          },
          workspaces: [
            { id: `ppt-${project.id}`, project_id: project.id, kind: 'ppt', state: 'draft', revision: 1, source_kind: 'spine' },
            { id: `video-${project.id}`, project_id: project.id, kind: 'video', state: 'uninitialized', revision: 0, source_kind: 'spine' },
            { id: `podcast-${project.id}`, project_id: project.id, kind: 'podcast', state: 'uninitialized', revision: 0, source_kind: 'spine' },
          ],
        },
      } })
    }
    if (path.endsWith('/image-versions') || path.endsWith('/native/versions')) return route.fulfill({ json: { success: true, data: { versions: [] } } })
    if (path === '/api/settings') return route.fulfill({ json: { success: true, data: { language: 'zh', output_language: 'zh', image_resolution: '2K' } } })
    if (path === '/api/output-language') return route.fulfill({ json: { success: true, data: { language: 'zh' } } })
    if (path === '/api/user-templates') return route.fulfill({ json: { success: true, data: { templates: [] } } })
    return route.fulfill({ json: { success: true, data: {} } })
  })
}

function percentile(samples: number[], quantile: number) {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)]
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  for (const mode of ['image', 'native', 'renovation'] as const) {
    test(`${mode} workspace fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await mockWorkspaceApis(page)
      await page.goto(`/project/workspace-${mode}/ppt/editor`)
      await expect(page.getByRole('complementary', { name: '项目工作区导航' })).toBeVisible()
      await expect(page.locator('[data-content-project-nav]')).toHaveCount(1)
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('complementary', { name: '页面栏' })).toBeVisible()
      await expect(page.getByRole('complementary', { name: '属性栏' })).toBeVisible()
      await expect(page.getByRole('contentinfo')).toContainText(mode === 'native' ? '原生可编辑模式' : '图片模式')
      if (mode !== 'native') {
        await expect(page.getByTestId('slide-preview-canvas').locator('img')).toHaveJSProperty('complete', true)
      }
      else {
        await expect(page.getByRole('main')).toContainText('行业现状与市场规模')
        const canvasBounds = await page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>('[data-testid="native-canvas-viewport"]')!.getBoundingClientRect()
          const renderLayer = document.querySelector<HTMLElement>('[data-testid="native-canvas-render-layer"]')!.getBoundingClientRect()
          return {
            viewport: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom },
            renderLayer: { left: renderLayer.left, right: renderLayer.right, top: renderLayer.top, bottom: renderLayer.bottom },
          }
        })
        expect(canvasBounds.renderLayer.left, JSON.stringify(canvasBounds)).toBeGreaterThanOrEqual(canvasBounds.viewport.left)
        expect(canvasBounds.renderLayer.right, JSON.stringify(canvasBounds)).toBeLessThanOrEqual(canvasBounds.viewport.right)
        expect(canvasBounds.renderLayer.top, JSON.stringify(canvasBounds)).toBeGreaterThanOrEqual(canvasBounds.viewport.top)
        expect(canvasBounds.renderLayer.bottom, JSON.stringify(canvasBounds)).toBeLessThanOrEqual(canvasBounds.viewport.bottom)
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      await mkdir('../output/playwright', { recursive: true })
      await page.screenshot({ path: `../output/playwright/workspace-${mode}-${viewport.width}.png`, fullPage: true })
    })
  }
}

test('global project settings use the embedded wide layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockWorkspaceApis(page)
  await page.goto('/project/workspace-image/preview')
  await page.getByRole('button', { name: '项目设置' }).click()
  const dialog = page.getByRole('dialog', { name: '设置' })
  await dialog.getByRole('tab', { name: '全局设置' }).click()
  await expect(dialog.locator('nav[data-layout="embedded"]')).toBeVisible()
  await expect(dialog.locator('aside')).toHaveCount(1)
  await mkdir('../output/playwright', { recursive: true })
  await page.screenshot({ path: '../output/playwright/project-settings-global-1440.png', fullPage: true })
})

test('global project settings opens within the panel performance budget', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockWorkspaceApis(page)
  await page.goto('/project/workspace-image/preview')

  await page.getByRole('button', { name: '项目设置' }).click()
  let dialog = page.getByRole('dialog', { name: '设置' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(dialog).toBeHidden()

  const samples: number[] = []
  for (let index = 0; index < 8; index += 1) {
    const started = performance.now()
    await page.getByRole('button', { name: '项目设置' }).click()
    dialog = page.getByRole('dialog', { name: '设置' })
    await expect(dialog).toBeVisible()
    samples.push(performance.now() - started)
    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toBeHidden()
  }

  const result = {
    project_settings_open_p50_ms: Number(percentile(samples, 0.5).toFixed(2)),
    project_settings_open_p95_ms: Number(percentile(samples, 0.95).toFixed(2)),
  }
  console.log(`UI_PANEL_PERF=${JSON.stringify(result)}`)

  expect(result.project_settings_open_p95_ms).toBeLessThan(200)
})

test('image inspector becomes an operable drawer below 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await mockWorkspaceApis(page)
  await page.goto('/project/workspace-image/preview')
  const inspector = page.locator('aside[aria-label="属性栏"]')
  await expect(inspector).toHaveAttribute('data-collapsed', 'true')
  await page.getByRole('button', { name: '打开属性栏' }).click()
  await expect(inspector).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveAttribute('data-collapsed', 'true')
})
