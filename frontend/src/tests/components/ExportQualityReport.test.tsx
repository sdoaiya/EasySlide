import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExportQualityReport } from '@/components/export/ExportQualityReport'

const report = {
  slideCount: 2,
  textObjects: 5,
  shapeObjects: 3,
  imageObjects: 1,
  slideSummaries: [
    { index: 1, renderedTextObjects: 3, renderedShapeObjects: 2, renderedImageObjects: 1 },
    { index: 2, renderedTextObjects: 2, renderedShapeObjects: 1, renderedImageObjects: 0 },
  ],
  warnings: [{ slide: 2, type: 'font-fallback' }],
}

describe('ExportQualityReport', () => {
  it('shows summary, pages, and warnings without exposing raw logs by default', () => {
    render(<ExportQualityReport report={report} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '导出质量报告' })).toHaveTextContent('2 页')
    fireEvent.click(screen.getByRole('tab', { name: '页面' }))
    expect(screen.getByText('第 1 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '警告' }))
    expect(screen.getByText(/font-fallback/)).toBeInTheDocument()
  })
})
