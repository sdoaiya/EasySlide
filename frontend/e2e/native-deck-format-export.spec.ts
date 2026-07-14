import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

test('native PDF and offline HTML outputs reopen with two slides', async ({ page, context }) => {
  await page.goto('/native-export-fixture.html')

  const result = await page.evaluate(async () => {
    const { exportNativeDeckPdf } = await import('/src/native-deck/exportNativeDeckPdf.ts')
    const { exportNativeDeckHtml } = await import('/src/native-deck/exportNativeDeckHtml.ts')
    const slides = [
      { pageId: 'native-slide-1', layout: 'core01_cover', props: { title: '第一页' } },
      { pageId: 'native-slide-2', layout: 'core01_end', props: { title: '第二页' } },
    ]
    const pdf = await exportNativeDeckPdf({ title: 'EasySlide native formats' })
    const html = exportNativeDeckHtml({ title: 'EasySlide native formats', slides })
    return {
      pdfBytes: Array.from(new Uint8Array(await pdf.arrayBuffer())),
      html: await html.text(),
    }
  })

  const pdf = await PDFDocument.load(Uint8Array.from(result.pdfBytes))
  expect(pdf.getPageCount()).toBe(2)

  const offline = await context.newPage()
  await offline.setContent(result.html)
  await expect(offline.locator('#counter')).toHaveText('1 / 2')
  await offline.getByRole('button', { name: '下一页' }).click()
  await expect(offline.locator('#counter')).toHaveText('2 / 2')
})
