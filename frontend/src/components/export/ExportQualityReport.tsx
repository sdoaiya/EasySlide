import { useState } from 'react'
import { X } from 'lucide-react'
import type { NativeExportQualityReport } from '@/types'

type Tab = 'summary' | 'pages' | 'warnings'

export function ExportQualityReport({ report, onClose }: { report: NativeExportQualityReport; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('summary')
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'summary', label: '概览' },
    { id: 'pages', label: '页面' },
    { id: 'warnings', label: '警告' },
  ]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="导出质量报告"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-background-secondary"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 items-center border-b border-border-primary px-4">
          <h2 className="font-semibold">导出质量报告</h2>
          <button type="button" aria-label="关闭质量报告" title="关闭" onClick={onClose} className="ml-auto flex h-10 w-10 items-center justify-center rounded-md hover:bg-background-hover">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex border-b border-border-primary px-4" role="tablist" aria-label="质量报告视图">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`h-10 border-b-2 px-4 text-sm ${tab === item.id ? 'border-banana text-foreground-primary' : 'border-transparent text-foreground-secondary'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {tab === 'summary' && (
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <Metric label="页面" value={`${report.slideCount} 页`} />
              <Metric label="可编辑文字" value={report.textObjects} />
              <Metric label="形状" value={report.shapeObjects} />
              <Metric label="图片" value={report.imageObjects} />
            </dl>
          )}
          {tab === 'pages' && (
            <div className="divide-y divide-border-primary">
              {report.slideSummaries.map((page) => (
                <div key={page.index} className="grid grid-cols-4 gap-3 py-3">
                  <strong>第 {page.index} 页</strong>
                  <span>文字 {page.renderedTextObjects ?? 0}</span>
                  <span>形状 {page.renderedShapeObjects ?? 0}</span>
                  <span>图片 {page.renderedImageObjects ?? 0}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'warnings' && (
            report.warnings.length ? (
              <div className="space-y-2">
                {report.warnings.map((warning, index) => <pre key={index} className="whitespace-pre-wrap rounded-md bg-amber-50 p-2 text-xs text-amber-900">{JSON.stringify(warning)}</pre>)}
              </div>
            ) : <p className="text-foreground-secondary">没有警告</p>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs text-foreground-secondary">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>
}
