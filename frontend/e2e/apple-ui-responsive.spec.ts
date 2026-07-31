import { expect, test, type Page } from '@playwright/test'

type LayoutIssue = {
  kind: 'viewport-overflow' | 'clipped-text' | 'undersized-control'
  element: string
  text: string
  metrics: string
}

async function mockShellApis(page: Page) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access-code/check') return route.fulfill({ json: { success: true, data: { enabled: false } } })
    if (path === '/api/projects') return route.fulfill({ json: { success: true, data: { projects: [], total: 0 } } })
    if (path === '/api/settings') return route.fulfill({ json: { success: true, data: { language: 'zh', output_language: 'zh' } } })
    if (path === '/api/output-language') return route.fulfill({ json: { success: true, data: { language: 'zh' } } })
    if (path === '/api/user-templates') return route.fulfill({ json: { success: true, data: { templates: [] } } })
    return route.fulfill({ json: { success: true, data: {} } })
  })
}

async function auditVisibleLayout(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate(() => {
    const issues: LayoutIssue[] = []
    const viewportWidth = document.documentElement.clientWidth

    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0

      if (!visible) continue

      const label = (element.getAttribute('aria-label') || element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48)
      const elementName = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`

      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        issues.push({
          kind: 'viewport-overflow',
          element: elementName,
          text: label,
          metrics: `left=${rect.left.toFixed(1)}, right=${rect.right.toFixed(1)}, viewport=${viewportWidth}`,
        })
      }

      const directText = Array.from(element.childNodes).some(node =>
        node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      )
      const intentionallyTruncated = element.classList.contains('truncate')
        || element.classList.contains('sr-only')
        || Boolean(element.title)
      const clipsHorizontally = style.overflowX === 'hidden' || style.overflowX === 'clip'
      if (directText && clipsHorizontally && !intentionallyTruncated && element.scrollWidth > element.clientWidth + 1) {
        issues.push({
          kind: 'clipped-text',
          element: elementName,
          text: label,
          metrics: `scrollWidth=${element.scrollWidth}, clientWidth=${element.clientWidth}`,
        })
      }

      const isAuditedControl = element.matches('button, [role="button"], [role="tab"], [role="menuitemradio"]')
      if (isAuditedControl && !element.hasAttribute('disabled') && (rect.width < 31.5 || rect.height < 31.5)) {
        issues.push({
          kind: 'undersized-control',
          element: elementName,
          text: label,
          metrics: `${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`,
        })
      }
    }

    return issues.slice(0, 30)
  })
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  for (const route of ['/home', '/create', '/history', '/settings']) {
    test(`${route} fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await mockShellApis(page)
      await page.goto(route)
      await expect(page.locator('body')).toBeVisible()
      const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, bodyX: document.body.scrollWidth - window.innerWidth }))
      expect(overflow.x).toBeLessThanOrEqual(1)
      expect(overflow.bodyX).toBeLessThanOrEqual(1)
      expect(await auditVisibleLayout(page)).toEqual([])
    })
  }
}

