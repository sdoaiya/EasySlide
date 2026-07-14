import { NativeSlideRenderer } from './NativeSlideRenderer'
import type { NativeSlideSpec } from '@/native-deck/types'
import { ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from 'lucide-react'

type NativeDeckPageRailProps = {
  slides: NativeSlideSpec[]
  selectedPageId: string | null
  onSelect: (pageId: string) => void
  onAdd: () => void
  onDuplicate: (pageId: string) => void
  onDelete: (pageId: string) => void
  onMove: (pageId: string, direction: -1 | 1) => void
  imageAction?: { label: string; disabled?: boolean; onClick: () => void }
}

function slideTitle(slide: NativeSlideSpec, index: number) {
  const title = slide.props.title
  return typeof title === 'string' && title ? title : `第 ${index + 1} 页`
}

export function NativeDeckPageRail({ slides, selectedPageId, onSelect, onAdd, onDuplicate, onDelete, onMove, imageAction }: NativeDeckPageRailProps) {
  return (
    <nav className="space-y-3 p-3" aria-label="原生页面">
      {imageAction && (
          <button type="button" aria-label={imageAction.label} title={imageAction.label} disabled={imageAction.disabled} onClick={imageAction.onClick} className="mb-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-400 text-sm font-semibold text-white shadow-md shadow-sky-200/60 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          <Sparkles size={18} aria-hidden="true" />{imageAction.label}
        </button>
      )}
      <button type="button" aria-label="添加页面" title="添加页面" onClick={onAdd} className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-background-elevated text-xs hover:bg-background-hover">
        <Plus size={15} aria-hidden="true" />添加页面
      </button>
      {slides.map((slide, index) => {
        const title = slideTitle(slide, index)
        const selected = slide.pageId === selectedPageId
        return (
          <div key={slide.pageId} className={`rounded-xl border p-2 transition-shadow ${selected ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20' : 'border-border-primary bg-background-elevated hover:shadow-sm'}`}>
            <button
              type="button"
              aria-label={`第 ${index + 1} 页：${title}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(slide.pageId)}
              className="w-full text-left"
            >
              <span className="mb-1 block truncate text-xs text-foreground-secondary">{index + 1}. {title}</span>
              <span className="relative block aspect-video overflow-hidden bg-white" aria-hidden="true">
                <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: 'scale(0.1)' }}>
                  <NativeSlideRenderer key={slide.layout} slide={slide} initializeEffects={false} />
                </span>
              </span>
            </button>
            {selected && (
              <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border-primary pt-2">
                <PageAction label={`复制第 ${index + 1} 页`} onClick={() => onDuplicate(slide.pageId)}><Copy size={14} /></PageAction>
                <PageAction label={`上移第 ${index + 1} 页`} disabled={index === 0} onClick={() => onMove(slide.pageId, -1)}><ArrowUp size={14} /></PageAction>
                <PageAction label={`下移第 ${index + 1} 页`} disabled={index === slides.length - 1} onClick={() => onMove(slide.pageId, 1)}><ArrowDown size={14} /></PageAction>
                <PageAction label={`删除第 ${index + 1} 页`} disabled={slides.length === 1} onClick={() => onDelete(slide.pageId)}><Trash2 size={14} /></PageAction>
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
