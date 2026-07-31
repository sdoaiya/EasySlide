import { test, expect } from '@playwright/test'

test.describe('Video export narration config', () => {
  test('sends narration strategy from the final export panel', async ({ page }) => {
    const projectId = 'mock-video-export-config'
    let exportPayload: any = null

    await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
      const url = new URL(route.request().url())

      if (url.pathname === `/api/projects/${projectId}/export/video`) {
        exportPayload = route.request().postDataJSON()
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { task_id: 'video-task-1' } }),
        })
      }

      if (url.pathname === `/api/projects/${projectId}/export/video/preflight`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              can_export: true,
              errors: [],
              warnings: [],
              total_pages: 1,
              pages_with_narration: 1,
              missing_images: [],
              missing_narration: [],
            },
          }),
        })
      }

      if (url.pathname === `/api/projects/${projectId}/narrations`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              pages: [
                {
                  page_id: 'p1',
                  current_version_id: 'narration-version-p1',
                  locked: false,
                },
              ],
            },
          }),
        })
      }

      if (url.pathname === `/api/projects/${projectId}/tasks/video-task-1`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              task_id: 'video-task-1',
              status: 'RUNNING',
              progress: { total: 100, completed: 20 },
            },
          }),
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
              idea_prompt: 'Nvidia annual report and roadmap',
              status: 'COMPLETED',
              template_style: 'default',
              export_allow_partial: true,
              pages: [
                {
                  id: 'p1',
                  page_id: 'p1',
                  order_index: 0,
                  generated_image_path: '/files/mock/1.png',
                  outline_content: { title: 'Revenue breakout', points: ['AI', 'Data center'] },
                  description_content: { text: 'Revenue keeps accelerating.' },
                  status: 'COMPLETED',
                },
              ],
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
              last_workspace: 'ppt',
              pending_sync_count: 0,
              spine: {
                id: 'spine-video-export-config',
                project_id: projectId,
                revision: 1,
                status: 'confirmed',
                content_hash: 'video-export-config-hash',
                document: {
                  topic: { value: 'Nvidia annual report and roadmap' },
                  sections: [],
                },
              },
              workspaces: [
                {
                  id: 'ppt-video-export-config',
                  project_id: projectId,
                  kind: 'ppt',
                  state: 'confirmed',
                  revision: 1,
                  source_kind: 'legacy',
                  settings: {},
                },
              ],
            },
          }),
        })
      }

      if (url.pathname === '/api/settings') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
      }
      if (url.pathname === '/api/output-language') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
      }
      if (url.pathname === '/api/user-templates') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { templates: [] } }) })
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
    })

    await page.route('**/files/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(100) })
    })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })

    await page.locator('button:has-text("导出")').first().click()
    await page.locator('button:has-text("导出为讲解视频")').click()

    await page.locator('select:has(option[value="confident corporate executive"])').selectOption('confident corporate executive')
    await page.locator('select:has(option[value="potential investors and venture capitalists"])').selectOption('potential investors and venture capitalists')
    await page.locator('select:has(option[value="inspiring, passionate, and persuasive"])').selectOption('inspiring, passionate, and persuasive')
    await page.locator('button:has-text("高级配置")').click()
    await page.locator('input[type="text"]').fill('our company 2025 annual financial report and 2026 strategic plan')
    await page.locator('input[type="number"]').nth(0).fill('80')
    await page.locator('input[type="number"]').nth(1).fill('140')
    await page.locator('button:has-text("开始导出")').click()

    await expect.poll(() => exportPayload).not.toBeNull()
    expect(exportPayload.generate_narration).toBe(false)
    expect(exportPayload.narration_policy).toBe('confirmed_only')
    expect(exportPayload.narration_version_map).toEqual({ p1: 'narration-version-p1' })
    expect(exportPayload.presentation_topic).toBe('our company 2025 annual financial report and 2026 strategic plan')
    expect(exportPayload.narration_config).toMatchObject({
      speaker_persona: 'confident corporate executive',
      target_audience: 'potential investors and venture capitalists',
      speech_tone: 'inspiring, passionate, and persuasive',
      presentation_topic: 'our company 2025 annual financial report and 2026 strategic plan',
      min_words: 80,
      max_words: 140,
    })
  })
})
