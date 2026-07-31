import { test, expect } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'

test.describe('Settings navigation and preview multi-select', () => {
  test('mock: settings home navigation works and preview multi-select bar stays outside the scroller', async ({ page }) => {
    const projectId = 'preview-settings-mock'
    const pages = Array.from({ length: 14 }, (_, index) => ({
      id: `p${index + 1}`,
      page_id: `p${index + 1}`,
      order_index: index,
      status: 'COMPLETED',
      generated_image_path: `/files/mock/${index + 1}.png`,
      generated_image_url: `/files/mock/${index + 1}.png`,
      outline_content: {
        title: `Slide ${index + 1}`,
        points: index === 12 ? Array.from({ length: 16 }, (_, pointIndex) => `第 ${pointIndex + 1} 条较长的大纲内容，用来验证固定宽度下的自动换行`) : [],
      },
      description_content: {
        text: index === 12 ? '这是一段较长的页面描述内容，用来验证属性栏宽度固定且文字只在区域内部换行。'.repeat(5) : `Desc ${index + 1}`,
      },
    }))

    await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
      const url = new URL(route.request().url())

      if (url.pathname === '/api/access-code/check') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { enabled: false } }),
        })
      }

      if (url.pathname === '/api/settings') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              ai_provider_format: 'gemini',
              image_resolution: '2K',
              max_description_workers: 5,
              max_image_workers: 8,
              output_language: 'zh',
            },
          }),
        })
      }

      if (url.pathname === '/api/output-language') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { language: 'zh' } }),
        })
      }

      if (url.pathname === `/api/projects/${projectId}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              project_id: projectId,
              id: projectId,
              idea_prompt: '多选固定条测试',
              status: 'COMPLETED',
              pages,
            },
          }),
        })
      }

      if (url.pathname === `/api/content-projects/${projectId}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              project_id: projectId,
              project_title: '多选固定条测试',
              spine: {
                revision: 1,
                status: 'confirmed',
                document: {
                  topic: { value: '多选固定条测试' },
                  sources: [{ kind: 'prompt', content: '多选固定条测试' }],
                  sections: [],
                },
              },
              workspaces: [{
                id: `${projectId}-ppt`,
                project_id: projectId,
                kind: 'ppt',
                state: 'ready',
                stage: 'COMPLETED',
                revision: 1,
                current_version_id: `${projectId}-v1`,
                source_kind: 'manual',
                source_revision: 1,
                settings: { render_mode: 'image', image_aspect_ratio: '16:9' },
              }],
            },
          }),
        })
      }

      if (url.pathname === '/api/user-templates') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { templates: [] } }),
        })
      }

      if (url.pathname.includes('/materials') || url.pathname.includes('/image-versions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: {} }),
        })
      }

      if (url.pathname.includes('/export/video')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { task_id: 'video-task-1' } }),
        })
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      })
    })

    await page.route('**/files/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(128) })
    })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForLoadState('networkidle')

    await page.goto('/settings')

    await expect(page).toHaveURL(/\/settings$/)
    await page.getByRole('button', { name: '首页' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await page.goto(`/project/${projectId}/preview`)

    const pageRail = page.getByRole('complementary', { name: '页面栏' })
    const thumbScroller = pageRail.getByTestId('slide-thumbnail-scroll')
    const multiSelectBar = pageRail.getByTestId('slide-multiselect-toolbar')
    const before = await multiSelectBar.boundingBox()
    expect(before).not.toBeNull()
    await expect(thumbScroller.getByTestId('slide-multiselect-toolbar')).toHaveCount(0)
    await expect(multiSelectBar).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

    await thumbScroller.evaluate((el) => { el.scrollTop = 800 })
    await page.waitForTimeout(150)

    await multiSelectBar.getByRole('button', { name: '多选' }).click()
    const after = await multiSelectBar.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(4)
  })

  test('integration: settings home navigation works and multi-select stays outside the scroller', async ({ page }) => {
    const frontendUrl = process.env.BASE_URL || 'http://localhost:3011'
    const frontendPort = parseInt(new URL(frontendUrl).port || '3011', 10)
    const backendUrl = `http://localhost:${frontendPort + 2000}`
    const backendAvailable = await fetch(`${backendUrl}/api/settings`)
      .then(() => true)
      .catch(() => false)
    test.skip(!backendAvailable, 'backend server is not available for integration seeding')

    const { projectId } = await seedProjectWithImages(backendUrl, 14)

    try {
      await page.goto(`/project/${projectId}/preview`)
      await page.waitForLoadState('networkidle')

      await page.goto('/settings')

      await expect(page).toHaveURL(/\/settings$/)
      await page.getByRole('button', { name: '首页' }).click()
      await expect(page).toHaveURL(/\/home$/)
      await page.goto(`/project/${projectId}/preview`)

      const pageRail = page.getByRole('complementary', { name: '页面栏' })
      const thumbScroller = pageRail.getByTestId('slide-thumbnail-scroll')
      const multiSelectBar = pageRail.getByTestId('slide-multiselect-toolbar')
      const before = await multiSelectBar.boundingBox()
      expect(before).not.toBeNull()
      await expect(thumbScroller.getByTestId('slide-multiselect-toolbar')).toHaveCount(0)
      await expect(multiSelectBar).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

      await thumbScroller.evaluate((el) => { el.scrollTop = 900 })
      await page.waitForTimeout(150)

      const after = await multiSelectBar.boundingBox()
      expect(after).not.toBeNull()
      expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(4)
    } finally {
      await fetch(`${backendUrl}/api/projects/${projectId}`, { method: 'DELETE' })
    }
  })
})
