import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { NarrationQualityReport, NativeExportQualityReport } from '@/types'

type Tab = 'summary' | 'pages' | 'warnings'

export function ExportQualityReport({ report, onClose }: { report: NativeExportQualityReport | NarrationQualityReport; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('summary')
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const narration = 'provider' in report ? report : undefined
  const native = !narration ? report as NativeExportQualityReport : undefined
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'summary', label: '概览' },
    { id: 'pages', label: '页面' },
    { id: 'warnings', label: '警告' },
  ]

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus({ preventScroll: true })
      previousFocusRef.current = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--app-surface)]/80 p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-quality-report-title"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--app-radius-card)] bg-[var(--app-surface)] shadow-[var(--app-shadow-floating)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 items-center border-b border-[var(--app-border)] px-4">
          <h2 id="export-quality-report-title" className="font-semibold">导出质量报告</h2>
          <button ref={closeButtonRef} type="button" aria-label="关闭质量报告" title="关闭" onClick={onClose} className="ml-auto flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex border-b border-[var(--app-border)] px-4" role="tablist" aria-label="质量报告视图">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`h-10 border-b-2 px-4 text-sm ${tab === item.id ? 'border-[var(--app-accent)] text-[var(--app-text-primary)]' : 'border-transparent text-[var(--app-text-secondary)]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {tab === 'summary' && (
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {narration ? <>
                <Metric label="字符" value={narration.characters} />
                <Metric label="请求" value={narration.requests} />
                <Metric label="音频时长" value={`${narration.duration_seconds}s`} />
                <Metric label="合成耗时" value={`${narration.elapsed_seconds}s`} />
              </> : native && <>
                <Metric label="页面" value={`${native.slideCount} 页`} />
                <Metric label="可编辑文字" value={native.textObjects} />
                <Metric label="形状" value={native.shapeObjects} />
                <Metric label="图片" value={native.imageObjects} />
              </>}
            </dl>
          )}
          {tab === 'pages' && (
            <div className="divide-y divide-[var(--app-border)]">
              {narration ? narration.quality_pages.map((page) => <div key={page.page_index} className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-4"><strong>第 {page.page_index + 1} 页</strong><span>{timingQualityLabel(page.timing_quality)}</span><span title={page.fallback_reason}>{visualRendererLabel(page.visual_renderer)}{page.fallback_from ? `（由${visualRendererLabel(page.fallback_from)}降级）` : ''}</span><span>{pageQualityLabel(page)}</span></div>) : native?.slideSummaries.map((page) => (
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
                {report.warnings.map((warning, index) => <pre key={index} className="whitespace-pre-wrap rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] p-2 text-xs text-[var(--app-warning)]">{typeof warning === 'string' ? warning : JSON.stringify(warning)}</pre>)}
              </div>
            ) : <p className="text-[var(--app-text-secondary)]">没有警告</p>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs text-[var(--app-text-secondary)]">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>
}

function timingQualityLabel(value?: NarrationQualityReport['quality_pages'][number]['timing_quality']) {
  return value ? ({ word_exact: '词级精确', segment_exact: '段级精确', aligned: '语音对齐', estimated: '时间估算' } as const)[value] : '未记录'
}

function visualRendererLabel(value?: NarrationQualityReport['quality_pages'][number]['visual_renderer']) {
  return value ? ({ hyperframes: '元素动画', browser_frames: '阶段帧动画', ken_burns: '镜头运动', static_frame: '静态画面' } as const)[value] : '未记录'
}

function pageQualityLabel(page: NarrationQualityReport['quality_pages'][number]) {
  if (page.issues?.length) return page.issues.join('、')
  if (typeof page.similarity === 'number') return `相似度 ${Math.round(page.similarity * 100)}%`
  return page.matched === false ? '未通过' : '通过'
}
