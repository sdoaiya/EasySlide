import { NativeSlideRenderer } from './NativeSlideRenderer'
import type { NativeSlideSpec } from '@/native-deck/types'
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from 'lucide-react'

type NativeDeckPageRailProps = {
  slides: NativeSlideSpec[]
  selectedPageId: string | null
  onSelect: (pageId: string) => void
  onAdd: () => void
  onDuplicate: (pageId: string) => void
  onDelete: (pageId: string) => void
  onMove: (pageId: string, direction: -1 | 1) => void
  pageAction?: { label: string; onClick: () => void }
  pageGenerationAction?: { label: string; disabled?: boolean; onClick: (pageId: string) => void }
}

function slideTitle(slide: NativeSlideSpec, index: number) {
  const title = slide.props.title
  return typeof title === 'string' && title ? title : `第 ${index + 1} 页`
}

export function NativeDeckPageRail({ slides, selectedPageId, onSelect, onAdd, onDuplicate, onDelete, onMove, pageAction, pageGenerationAction }: NativeDeckPageRailProps) {
  return (
    <nav className="h-full space-y-3 overflow-y-auto bg-white p-4 dark:bg-background-secondary" aria-label="原生页面">
      {pageAction && (
        <button type="button" aria-label={pageAction.label} title={pageAction.label} onClick={pageAction.onClick} className="mb-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-400 text-sm font-semibold text-white shadow-md shadow-sky-200/60 transition hover:brightness-105">
          <Sparkles size={18} aria-hidden="true" />{pageAction.label}
        </button>
      )}
      <button type="button" aria-label="添加页面" title="添加页面" onClick={onAdd} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:border-sky-200 hover:bg-sky-50 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover">
        <Plus size={15} aria-hidden="true" />添加页面
      </button>
      {slides.map((slide, index) => {
        const title = slideTitle(slide, index)
        const selected = slide.pageId === selectedPageId
        const qualityWarning = hasQualityWarning(slide)
        return (
          <div key={slide.pageId} className={`rounded-xl border bg-white p-2 transition-shadow dark:bg-background-secondary ${selected ? 'border-cyan-400 shadow-sm ring-2 ring-cyan-400/20' : qualityWarning ? 'border-amber-300 hover:border-amber-400' : 'border-slate-200 hover:border-sky-200 hover:shadow-sm dark:border-border-primary'}`}>
            <button
              type="button"
              aria-label={`第 ${index + 1} 页：${title}${qualityWarning ? '，存在质量警告' : ''}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(slide.pageId)}
              className="w-full text-left"
            >
              <span className="mb-1 block truncate text-xs text-foreground-secondary">{index + 1}. {title}</span>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-slate-50" aria-hidden="true">
                <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: 'scale(0.1)' }}>
                    <NativeSlideRenderer key={`${slide.pageId}:${slide.layout}`} slide={slide} initializeEffects={false} animate={false} />
                </span>
                {qualityWarning && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow"><AlertTriangle size={13} /></span>}
              </span>
            </button>
            {selected && (
              <div className={`mt-2 grid gap-1 border-t border-border-primary pt-2 ${pageGenerationAction ? 'grid-cols-5' : 'grid-cols-4'}`}>
                <PageAction label={`复制第 ${index + 1} 页`} onClick={() => onDuplicate(slide.pageId)}><Copy size={14} /></PageAction>
                <PageAction label={`上移第 ${index + 1} 页`} disabled={index === 0} onClick={() => onMove(slide.pageId, -1)}><ArrowUp size={14} /></PageAction>
                <PageAction label={`下移第 ${index + 1} 页`} disabled={index === slides.length - 1} onClick={() => onMove(slide.pageId, 1)}><ArrowDown size={14} /></PageAction>
                <PageAction label={`删除第 ${index + 1} 页`} disabled={slides.length === 1} onClick={() => onDelete(slide.pageId)}><Trash2 size={14} /></PageAction>
                {pageGenerationAction && <PageAction label={`${pageGenerationAction.label}（第 ${index + 1} 页）`} disabled={pageGenerationAction.disabled} onClick={() => pageGenerationAction.onClick(slide.pageId)}><Sparkles size={14} /></PageAction>}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function PageAction({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-9 items-center justify-center rounded-md hover:bg-background-hover disabled:opacity-35">{children}</button>
}

function hasQualityWarning(slide: NativeSlideSpec) {
  const intent = slide.props.__design_intent
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const report = (intent as Record<string, unknown>).quality_report
  return Boolean(report && typeof report === 'object' && !Array.isArray(report) && (report as Record<string, unknown>).status === 'warning')
}
