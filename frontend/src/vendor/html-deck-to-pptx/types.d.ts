declare module '@/vendor/html-deck-to-pptx/collector-functions.mjs' {
  export function isExportNoiseText(value: unknown): boolean
  export function shouldSkipEditableExportElement(element: Element | null): boolean
}

declare module '@/vendor/html-deck-to-pptx/editable-core.mjs' {
  export function fontFaceForText(fontFamily?: string, text?: string): string
  export function pptxSafeFontFace(fontFace?: string): string
  export function textOutlineForStyle(style?: Record<string, unknown>): { color: string; size: number } | undefined
  export function textShadowForStyle(style?: Record<string, unknown>): Record<string, unknown> | undefined
}

declare module '@/vendor/html-deck-to-pptx/editable-browser.mjs' {
  export type EditablePptxReport = import('@/types').NativeExportQualityReport

  export function exportEditablePptxInBrowser(options: Record<string, unknown>): Promise<{
    blob: Blob
    report: EditablePptxReport
  }>

  export function applyEditablePptxSnapshot(...args: unknown[]): unknown
}
