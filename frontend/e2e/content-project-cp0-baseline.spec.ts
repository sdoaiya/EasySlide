import { expect, test, type Page } from '@playwright/test'

const legacyProject = {
  id: 'cp0-legacy',
  project_id: 'cp0-legacy',
  project_title: 'CP0 旧项目',
  creation_type: 'idea',
  render_mode: 'image',
  image_aspect_ratio: '16:9',
  status: 'COMPLETED',
  pages: Array.from({ length: 20 }, (_, index) => ({
    id: `page-${index + 1}`,
    page_id: `page-${index + 1}`,
    order_index: index,
    status: 'COMPLETED',
    outline_content: { title: `第 ${index + 1} 页`, points: ['基线要点'] },
    description_content: { title: `第 ${index + 1} 页`, text_content: ['基线描述'] },
  })),
}

const legacyContentProject = {
  ...legacyProject,
  spine: {
    revision: 1,
    status: 'confirmed',
    document: {
      topic: { value: legacyProject.project_title },
      sources: [{ kind: 'prompt', content: legacyProject.project_title }],
      sections: [],
    },
  },
  workspaces: [
    {
      id: 'cp0-legacy-ppt',
      project_id: legacyProject.project_id,
      kind: 'ppt',
      state: 'ready',
      stage: 'COMPLETED',
      revision: 1,
      current_version_id: 'cp0-legacy-ppt-v1',
      source_kind: 'manual',
      source_revision: 1,
      settings: { render_mode: 'image', image_aspect_ratio: '16:9' },
    },
  ],
}

async function mockBaselineApis(page: Page) {
  let legacyProjectReads = 0
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } })
    if (path === '/api/projects/cp0-legacy') {
      legacyProjectReads += 1
      return route.fulfill({ json: { success: true, data: legacyProject } })
    }
    if (path === '/api/content-projects/cp0-legacy') {
      return route.fulfill({ json: { success: true, data: legacyContentProject } })
    }
    if (path === '/api/projects') {
      return route.fulfill({ json: { success: true, data: { projects: [legacyProject], total: 1, stats: {} } } })
    }
    if (path === '/api/settings') return route.fulfill({ json: { success: true, data: { language: 'zh', output_language: 'zh' } } })
    if (path === '/api/output-language') return route.fulfill({ json: { success: true, data: { language: 'zh' } } })
    if (path === '/api/user-templates') return route.fulfill({ json: { success: true, data: { templates: [] } } })
    if (path.endsWith('/image-versions') || path.endsWith('/native/versions')) {
      return route.fulfill({ json: { success: true, data: { versions: [] } } })
    }
    return route.fulfill({ json: { success: true, data: {} } })
  })
  return () => legacyProjectReads
}

function percentile(samples: number[], quantile: number) {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)]
}

test('records home open and workspace route-switch baselines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockBaselineApis(page)

  const openSamples: number[] = []
  for (let index = 0; index < 8; index += 1) {
    const started = performance.now()
    await page.goto('/home')
    await expect(page.getByRole('navigation', { name: '工作台导航' })).toBeVisible()
    await expect(page.locator('[data-workspace-content]')).toBeVisible()
    openSamples.push(performance.now() - started)
  }

  const switchSamples: number[] = []
  for (let index = 0; index < 10; index += 1) {
    let started = performance.now()
    await page.getByRole('button', { name: '创建项目' }).click()
    await expect(page).toHaveURL(/\/create$/)
    await expect(page.getByRole('heading', { level: 1, name: '创建项目' })).toBeVisible()
    switchSamples.push(performance.now() - started)

    started = performance.now()
    await page.getByRole('button', { name: '首页' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.locator('[data-workspace-content]')).toBeVisible()
    switchSamples.push(performance.now() - started)
  }

  const result = {
    home_open_p50_ms: Number(percentile(openSamples, 0.5).toFixed(2)),
    home_open_p95_ms: Number(percentile(openSamples, 0.95).toFixed(2)),
    route_switch_p50_ms: Number(percentile(switchSamples, 0.5).toFixed(2)),
    route_switch_p95_ms: Number(percentile(switchSamples, 0.95).toFixed(2)),
  }
  console.log(`CP0_BROWSER_BASELINE=${JSON.stringify(result)}`)

  expect(result.home_open_p95_ms).toBeLessThan(8000)
  expect(result.route_switch_p95_ms).toBeLessThan(2000)
})

const canonicalStagePath = {
  outline: 'ppt/outline',
  detail: 'ppt/detail',
  preview: 'ppt/editor',
}

for (const stage of ['outline', 'detail', 'preview'] as const) {
  test(`legacy ${stage} URL loads the same project`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const getLegacyProjectReads = await mockBaselineApis(page)

    await page.goto(`/project/cp0-legacy/${stage}`)

    await expect(page).toHaveURL(new RegExp(`/project/cp0-legacy/${canonicalStagePath[stage]}$`))
    await expect(page.locator('body')).toContainText({
      outline: '编辑大纲',
      detail: '编辑页面描述',
      preview: '视觉成稿',
    }[stage])
    await expect(page.locator('body')).toContainText('第 20 页')
    await expect.poll(getLegacyProjectReads).toBeGreaterThan(0)
  })
}
