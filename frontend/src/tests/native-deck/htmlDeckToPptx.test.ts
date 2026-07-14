import { describe, expect, it } from 'vitest'
import { isExportNoiseText, shouldSkipEditableExportElement } from '@/vendor/html-deck-to-pptx/collector-functions.mjs'
import { fontFaceForText, pptxSafeFontFace, textOutlineForStyle, textShadowForStyle } from '@/vendor/html-deck-to-pptx/editable-core.mjs'

describe('html deck to pptx export guards', () => {
  it('skips font probe pangram text', () => {
    expect(isExportNoiseText('The quick brown fox jumps over the lazy dog.')).toBe(true)
    expect(isExportNoiseText('业务增长复盘')).toBe(false)
  })

  it('skips elements explicitly marked as non-editable export content', () => {
    document.body.innerHTML = '<section><span data-editable-skip="true"><b id="page">1 / 10</b></span></section>'

    expect(shouldSkipEditableExportElement(document.getElementById('page'))).toBe(true)
  })

  it('keeps named font families for WPS font resolution', () => {
    expect(pptxSafeFontFace('Archivo')).toBe('Archivo')
    expect(fontFaceForText('"Space Mono", ui-monospace, monospace', '2026')).toBe('Space Mono')
    expect(fontFaceForText('Noto Sans SC, sans-serif', '中文标题')).toBe('Noto Sans SC')
  })

  it('converts css text outline and shadow into pptx text effects', () => {
    expect(textOutlineForStyle({
      webkitTextStrokeWidth: '2px',
      webkitTextStrokeColor: 'rgb(255, 0, 0)',
    })).toEqual({ color: 'FF0000', size: 1.5 })

    expect(textShadowForStyle({ textShadow: '2px 3px 4px rgba(0, 0, 0, 0.5)' })).toMatchObject({
      type: 'outer',
      color: '000000',
      opacity: 0.5,
    })
  })
})
