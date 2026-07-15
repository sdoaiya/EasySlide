import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FilePlus2 } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { NativeSlideRenderer } from './NativeSlideRenderer'

const ELEMENT_ANIMATION_RELEASED = 1

type NativeDeckCanvasProps = {
  slide: NativeSlideSpec | undefined
  zoom?: number
  pageIndex?: number
  pageCount?: number
  onPrevious?: () => void
  onNext?: () => void
  presenting?: boolean
  emptyAction?: { label: string; onClick: () => void }
}

export function NativeDeckCanvas({ slide, zoom = 1, pageIndex = 0, pageCount = 1, onPrevious, onNext, presenting = false, emptyAction }: NativeDeckCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const previousPageId = useRef<string>()
  const previousReplay = useRef<string>()
  const previousSlide = useRef<NativeSlideSpec>()
  const [outgoingSlide, setOutgoingSlide] = useState<NativeSlideSpec>()
  const [transitionClass, setTransitionClass] = useState('')
  const [fitScale, setFitScale] = useState(0.5)
  const [elementAnimationStep, setElementAnimationStep] = useState(ELEMENT_ANIMATION_RELEASED)
  const [elementAnimationActive, setElementAnimationActive] = useState(true)

  const elementTrigger = (slide?.props.__animation as { elementTrigger?: string } | undefined)?.elementTrigger

  useEffect(() => {
    setElementAnimationActive(elementTrigger !== 'click')
    setElementAnimationStep(elementTrigger === 'click' ? 0 : ELEMENT_ANIMATION_RELEASED)
  }, [slide?.pageId, slide?.props.__animation])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const resize = () => {
      // Fit inside the content box so the fixed canvas stays centered and never
      // grows underneath the navigation controls or the workspace padding.
      const next = Math.min(Math.max(0, frame.clientWidth - 48) / 1920, Math.max(0, frame.clientHeight - 80) / 1080)
      if (next > 0) setFitScale(next)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!slide) return
    const replay = slide.props.__animation && typeof slide.props.__animation === 'object'
      ? String((slide.props.__animation as { replay?: unknown }).replay || '')
      : ''
    const isPageChange = previousPageId.current && previousPageId.current !== slide.pageId
    const isReplay = previousPageId.current === slide.pageId && previousReplay.current !== replay && Boolean(replay)
    previousPageId.current = slide.pageId
    previousReplay.current = replay
    const outgoing = previousSlide.current
    previousSlide.current = slide
    if (!isPageChange && !isReplay) return
    const animation = slide.props.__animation && typeof slide.props.__animation === 'object'
      ? slide.props.__animation as { transition?: string; transitionSpeed?: string; transitionDirection?: string }
      : undefined
    const transition = animation?.transition
    if (!transition || transition === 'none' || transition === 'cut') {
      setTransitionClass('')
      setOutgoingSlide(undefined)
      return
    }
    const speed = animation?.transitionSpeed === 'slow' ? 'slow' : animation?.transitionSpeed === 'fast' ? 'fast' : 'med'
    const direction = animation?.transitionDirection && animation.transitionDirection !== 'default' ? animation.transitionDirection : transition === 'wipe' || transition === 'uncover' ? 'r' : 'l'
    const className = `native-page-transition-${transition} native-page-transition-${speed} native-page-transition-dir-${direction}`
    const play = () => {
      if (outgoing) setOutgoingSlide(outgoing)
      setTransitionClass(className)
      return window.setTimeout(() => setTransitionClass(''), speed === 'slow' ? 900 : speed === 'fast' ? 260 : 520)
    }
    const ready = frameRef.current?.querySelector('[data-native-layout-ready="true"]')
    if (ready) {
      const timer = play()
      return () => window.clearTimeout(timer)
    }
    const observer = new MutationObserver(() => {
      if (!frameRef.current?.querySelector('[data-native-layout-ready="true"]')) return
      observer.disconnect()
      timer = play()
    })
    let timer: number | undefined
    observer.observe(frameRef.current || document.body, { attributes: true, subtree: true, attributeFilter: ['data-native-layout-ready'] })
    const fallback = window.setTimeout(() => {
      observer.disconnect()
      if (timer === undefined) timer = play()
    }, 15000)
    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [slide?.pageId, slide?.props.__animation])

  useEffect(() => {
    if (!outgoingSlide || transitionClass) return
    setOutgoingSlide(undefined)
  }, [outgoingSlide, transitionClass])

  useEffect(() => {
    const seconds = Number((slide?.props.__animation as { advanceAfter?: number } | undefined)?.advanceAfter || 0)
    if (!presenting || seconds <= 0 || pageIndex >= pageCount - 1 || !onNext) return
    // Click-triggered decks start their timer only after the first click has
    // released the element sequence; otherwise the page can advance before it
    // is ever shown.
    if (elementTrigger === 'click' && elementAnimationStep < ELEMENT_ANIMATION_RELEASED) return
    const timer = window.setTimeout(() => {
      onNext()
    }, seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [elementAnimationStep, elementTrigger, pageCount, pageIndex, onNext, presenting, slide?.props.__animation])

  useEffect(() => {
    if (!presenting || elementTrigger !== 'click' || elementAnimationStep >= ELEMENT_ANIMATION_RELEASED) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'ArrowRight') return
      event.preventDefault()
      event.stopPropagation()
      setElementAnimationStep(ELEMENT_ANIMATION_RELEASED)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [elementAnimationStep, elementTrigger, presenting])

  if (!slide) {
    return (
      <div className="flex h-full items-center justify-center bg-[#eef7fb] p-6 dark:bg-background-primary">
        <div className="flex max-w-md flex-col items-center rounded-2xl border border-sky-100 bg-white px-8 py-10 text-center shadow-[0_14px_38px_rgba(15,23,42,0.10)] dark:border-border-primary dark:bg-background-secondary">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-900/20 dark:text-sky-300">
            <FilePlus2 size={28} aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-foreground-primary">还没有原生页面</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-foreground-secondary">先生成页面，之后可以在这里逐页编辑、配图和导出。</p>
          {emptyAction && (
            <button type="button" onClick={emptyAction.onClick} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-sky-200/60 transition hover:brightness-105">
              <FilePlus2 size={17} aria-hidden="true" />{emptyAction.label}
            </button>
          )}
        </div>
      </div>
    )
  }
  const scale = fitScale * zoom

  return (
    <div ref={frameRef} className="relative flex h-full min-w-0 w-full items-center justify-center overflow-hidden bg-[#eef7fb] p-6 pb-20 dark:bg-background-primary">
      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_14px_38px_rgba(15,23,42,0.14)] ring-1 ring-sky-100 ${transitionClass}`} style={{ width: 1920 * scale, height: 1080 * scale }}>
        {outgoingSlide && (
          <div aria-hidden="true" className="absolute inset-0 z-0 native-page-outgoing">
            <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
              <NativeSlideRenderer slide={outgoingSlide} initializeEffects={false} animate={false} />
            </div>
          </div>
        )}
        <div className="absolute left-0 top-0 z-[1] origin-top-left" style={{ transform: `scale(${scale})` }} onClick={() => elementTrigger === 'click' && setElementAnimationStep(ELEMENT_ANIMATION_RELEASED)}>
          <NativeSlideRenderer key={`${slide.pageId}:${slide.layout}`} slide={slide} elementAnimationActive={elementAnimationStep >= ELEMENT_ANIMATION_RELEASED} elementAnimationStep={elementAnimationStep} />
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
