import { expect, test, type Page } from '@playwright/test'

const projects = Array.from({ length: 4 }, (_, index) => ({
  project_id: `project-${index + 1}`,
  project_title: `内容项目 ${index + 1}`,
  idea_prompt: `项目主题 ${index + 1}`,
  creation_type: 'idea',
  render_mode: 'image',
  status: index === 0 ? 'COMPLETED' : 'DRAFT',
  created_at: '2026-07-26T08:00:00Z',
  updated_at: `2026-07-26T${String(index + 8).padStart(2, '0')}:00:00Z`,
  pages: [],
  last_workspace: index === 1 ? 'video' : 'ppt',
  workspaces: [
    { id: `ppt-${index}`, project_id: `project-${index + 1}`, kind: 'ppt', state: 'draft', revision: 1, source_kind: 'spine' },
    { id: `video-${index}`, project_id: `project-${index + 1}`, kind: 'video', state: index === 1 ? 'draft' : 'uninitialized', revision: index === 1 ? 1 : 0, source_kind: 'spine' },
    { id: `podcast-${index}`, project_id: `project-${index + 1}`, kind: 'podcast', state: index === 2 ? 'draft' : 'uninitialized', revision: index === 2 ? 1 : 0, source_kind: 'spine' },
  ],
}))

async function mockApis(page: Page) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } })
    if (path === '/api/projects') return route.fulfill({ json: { success: true, data: { projects, total: 4 } } })
    if (path === '/api/content-projects/project-1') return route.fulfill({ json: {
      success: true,
      data: {
        project_id: 'project-1',
        last_workspace: 'video',
        spine: {
          id: 'spine-1',
          project_id: 'project-1',
          revision: 1,
          status: 'confirmed',
          content_hash: 'hash',
          document: { topic: { value: '内容项目 1' }, audience: { value: '团队' }, objective: { value: '形成成稿' }, sections: [] },
        },
        workspaces: projects[0].workspaces,
      },
    } })
    if (path === '/api/settings') return route.fulfill({ json: { success: true, data: { language: 'zh' } } })
    return route.fulfill({ json: { success: true, data: {} } })
  })
}

test('content project keeps a single stationary primary tool rack', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockApis(page)
  await page.goto('/project/project-1/video')

  const projectNav = page.getByRole('complementary', { name: '项目工作区导航' })
  await expect(projectNav).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工作台导航' })).toHaveCount(0)
  for (const name of ['内容主线', 'PPT', '视频', '播客']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
  }
  const before = await projectNav.boundingBox()
  await page.getByRole('link', { name: /播客/ }).click()
  await expect(page.getByRole('heading', { name: '播客 工作区' })).toBeVisible()
  expect(await projectNav.boundingBox()).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('project cards expose a more menu without hover', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  await mockApis(page)
  await page.goto('/home')
  const more = page.locator('summary[aria-label="更多操作"]').first()
  await expect(more).toBeVisible()
  await more.click()
  await expect(page.getByRole('menuitem', { name: '编辑' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '删除' })).toBeVisible()
  await context.close()
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`editorial project wall fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockApis(page)
    await page.goto('/home')

    await expect(page.getByRole('heading', { name: '作品工作台' })).toBeVisible()
    await expect(page.getByText('从想法到成稿')).toHaveCount(0)
    const grid = page.getByTestId('project-grid')
    await expect(grid).toBeVisible()
    expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)

    const inspiration = page.getByRole('heading', { name: '灵感墙' })
    await expect(inspiration).toBeVisible()
    expect((await inspiration.boundingBox())!.y).toBeLessThan(viewport.height)

    const firstCard = page.getByRole('button', { name: /内容项目 1/ })
    await firstCard.focus()
    await expect(page.getByRole('button', { name: '编辑' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '删除' }).first()).toBeVisible()
  })

  test(`editorial project wall has no horizontal overflow at 125% on ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockApis(page)
    await page.goto('/home')
    await page.evaluate(() => { document.documentElement.style.zoom = '1.25' })
    await expect(page.getByRole('heading', { name: '作品工作台' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('navigation', { name: '工作台导航' })).toBeVisible()
  })
}
