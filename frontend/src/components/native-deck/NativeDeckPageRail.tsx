import { useEffect, useRef, useState } from 'react'
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
    <nav className="h-full space-y-3 overflow-y-auto bg-[var(--app-surface-muted)] p-4" aria-label="原生页面">
      {pageAction && (
        <button type="button" aria-label={pageAction.label} title={pageAction.label} onClick={pageAction.onClick} className="mb-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--app-primary-action)] text-sm font-semibold text-[var(--app-surface)] shadow-[var(--app-shadow-soft)] transition-colors hover:bg-[var(--app-primary-action-hover)]">
          <Sparkles size={18} aria-hidden="true" />{pageAction.label}
        </button>
      )}
      <button type="button" aria-label="添加页面" title="添加页面" onClick={onAdd} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-sm font-medium text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)]">
        <Plus size={15} aria-hidden="true" />添加页面
      </button>
      {slides.map((slide, index) => {
        const title = slideTitle(slide, index)
        const selected = slide.pageId === selectedPageId
        const qualityWarning = hasQualityWarning(slide)
        return (
          <div key={slide.pageId} className={`rounded-lg border bg-[var(--app-surface)] p-2 transition-shadow ${selected ? 'border-[var(--app-accent)] shadow-[var(--app-shadow-card)]' : qualityWarning ? 'border-[var(--app-warning)] hover:border-[var(--app-warning)]' : 'border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] hover:shadow-[var(--app-shadow-card)]'}`}>
            <button
              type="button"
              aria-label={`第 ${index + 1} 页：${title}${qualityWarning ? '，存在质量警告' : ''}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(slide.pageId)}
              className="w-full text-left"
            >
              <span className="mb-1 block truncate text-xs text-[var(--app-text-secondary)]">{index + 1}. {title}</span>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-[var(--app-surface-muted)]" aria-hidden="true">
                <LazyThumbnail slide={slide} selected={selected} />
                {qualityWarning && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-warning)] text-[var(--app-on-color)] shadow-[var(--app-shadow-control)]"><AlertTriangle size={13} /></span>}
              </span>
            </button>
            {selected && (
              <div className={`mt-2 grid gap-1 border-t border-[var(--app-border)] pt-2 ${pageGenerationAction ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-9 items-center justify-center rounded-md text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-35">{children}</button>
}

function LazyThumbnail({ slide, selected }: { slide: NativeSlideSpec; selected: boolean }) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(selected)

  useEffect(() => {
    if (visible || !hostRef.current) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px 0px' })
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [visible])

  return (
    <span ref={hostRef} className="absolute inset-0 block">
      {(visible || selected) && (
        <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: 'scale(0.1)' }}>
          <NativeSlideRenderer key={`${slide.pageId}:${slide.layout}`} slide={slide} initializeEffects={false} animate={false} />
        </span>
      )}
    </span>
  )
}

function hasQualityWarning(slide: NativeSlideSpec) {
  const intent = slide.props.__design_intent
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return false
  const report = (intent as Record<string, unknown>).quality_report
  return Boolean(report && typeof report === 'object' && !Array.isArray(report) && (report as Record<string, unknown>).status === 'warning')
}
