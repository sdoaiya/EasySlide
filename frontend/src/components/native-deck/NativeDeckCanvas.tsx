import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { NativeSlideRenderer } from './NativeSlideRenderer'

type NativeDeckCanvasProps = {
  slide: NativeSlideSpec | undefined
  zoom?: number
  pageIndex?: number
  pageCount?: number
  onPrevious?: () => void
  onNext?: () => void
}

export function NativeDeckCanvas({ slide, zoom = 1, pageIndex = 0, pageCount = 1, onPrevious, onNext }: NativeDeckCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(0.5)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const resize = () => {
      const next = Math.min(frame.clientWidth / 1920, frame.clientHeight / 1080)
      if (next > 0) setFitScale(next)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  if (!slide) {
    return <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">暂无原生页面</div>
  }
  const scale = fitScale * zoom

  return (
    <div ref={frameRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gray-50 p-6 pb-20 dark:bg-background-primary">
      <div className="relative shrink-0 shadow-lg" style={{ width: 1920 * scale, height: 1080 * scale }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
          <NativeSlideRenderer key={slide.layout} slide={slide} />
        </div>
      </div>
      {pageCount > 1 && (
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-black/5 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
          <button type="button" aria-label="上一页" title="上一页" disabled={pageIndex <= 0} onClick={onPrevious} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button>
          <span className="min-w-14 text-center font-mono text-xs font-semibold text-slate-700">{String(pageIndex + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span>
          <button type="button" aria-label="下一页" title="下一页" disabled={pageIndex >= pageCount - 1} onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  )
}
