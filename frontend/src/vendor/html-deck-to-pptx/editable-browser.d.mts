export interface EditablePptxReport {
  slideCount: number
  textObjects: number
  shapeObjects: number
  imageObjects: number
  slideSummaries: Array<{ index: number; [key: string]: unknown }>
  warnings: Array<Record<string, unknown>>
}

export function exportEditablePptxInBrowser(options?: Record<string, unknown>): Promise<{
  blob: Blob
  report: EditablePptxReport
}>
