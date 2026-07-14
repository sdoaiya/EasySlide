import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('exports a two-slide DOM deck with editable text', async ({ page }) => {
  await page.goto('/native-export-fixture.html')
  await page.addScriptTag({
    path: path.join(frontendDir, 'node_modules', 'pptxgenjs', 'dist', 'pptxgen.bundle.js'),
  })
  await page.waitForFunction(() => window.__nativeExporterReady === true)

  const result = await page.evaluate(() => window.testExportNativeDeck())

  expect(result.slideCount).toBe(2)
  expect(result.textObjects).toBeGreaterThanOrEqual(2)
  expect(result.fullSlideFallbacks).toBe(0)
  expect(result.pptxSignature).toBe('PK')
  expect(result.pptxBytes).toBeGreaterThan(1000)
})

declare global {
  interface Window {
    __nativeExporterReady?: boolean
    testExportNativeDeck: () => Promise<{
      slideCount: number
      textObjects: number
      fullSlideFallbacks: number
      pptxSignature: string
      pptxBytes: number
    }>
  }
}
