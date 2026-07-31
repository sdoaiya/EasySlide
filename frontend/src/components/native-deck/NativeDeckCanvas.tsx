import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, FilePlus2, X } from 'lucide-react'
import { getImageUrl } from '@/api/client'
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
  generationStatus?: { status: string; completed: number; failed: number; total: number; error?: string; onPause?: () => void; onResume?: () => void }
  onPropsChange?: (props: Record<string, unknown>) => void
  mediaContract?: {
    propShapes: Record<string, unknown>
    mediaSlots: Array<{ key: string } & Record<string, unknown>>
    copyBudgets?: Record<string, { maxChars: number }>
    arrayLimits?: Record<string, { itemMaxChars: number }>
  }
  onMediaSelect?: (key: string, index: number | undefined) => void
  onMediaUpload?: (key: string, index: number | undefined, file: File) => void
}

type TextEditState = {
  path: Array<string | number>
  value: string
  rect: { left: number; top: number; width: number; height: number }
  textStyle?: Pick<CSSProperties, 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'lineHeight' | 'letterSpacing' | 'textAlign'>
}
type TextSelectionState = Pick<TextEditState, 'path' | 'rect'>

export function NativeDeckCanvas({ slide, zoom = 1, pageIndex = 0, pageCount = 1, onPrevious, onNext, presenting = false, emptyAction, generationStatus, onPropsChange, mediaContract, onMediaSelect, onMediaUpload }: NativeDeckCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const editorToolbarRef = useRef<HTMLDivElement>(null)
  const previousPageId = useRef<string>()
  const previousReplay = useRef<string>()
  const previousSlide = useRef<NativeSlideSpec>()
  const [outgoingSlide, setOutgoingSlide] = useState<NativeSlideSpec>()
  const [transitionClass, setTransitionClass] = useState('')
  const [fitScale, setFitScale] = useState(0.5)
  const [elementAnimationStep, setElementAnimationStep] = useState(ELEMENT_ANIMATION_RELEASED)
  const [textEdit, setTextEdit] = useState<TextEditState>()
  const [textSelection, setTextSelection] = useState<TextSelectionState>()

  const hasSlide = Boolean(slide)
  const elementTrigger = (slide?.props.__animation as { elementTrigger?: string } | undefined)?.elementTrigger

  useEffect(() => {
    const waitForClick = presenting && elementTrigger === 'click'
    setElementAnimationStep(waitForClick ? 0 : ELEMENT_ANIMATION_RELEASED)
  }, [elementTrigger, presenting, slide?.pageId, slide?.props.__animation])

  useEffect(() => {
    setTextEdit(undefined)
    setTextSelection(undefined)
  }, [slide?.pageId, slide?.layout])

  useEffect(() => {
    if (!textEdit) return
    editorRef.current?.focus()
    editorRef.current?.select()
  }, [textEdit])

  useEffect(() => {
    if (!textEdit) return
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setTextEdit(undefined)
      setTextSelection(undefined)
    }
    window.addEventListener('keydown', cancelOnEscape, true)
    return () => window.removeEventListener('keydown', cancelOnEscape, true)
  }, [textEdit])

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
  }, [hasSlide])

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
      <div className="flex h-full items-center justify-center bg-[var(--app-canvas)] p-6">
        <div className="flex max-w-md flex-col items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-8 py-10 text-center shadow-[var(--app-shadow-soft)]">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[var(--app-surface-muted)] text-[var(--app-accent)]">
            <FilePlus2 size={28} aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-[var(--app-text)]">还没有原生页面</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-text-secondary)]">先生成页面，之后可以在这里逐页编辑、配图和导出。</p>
          {emptyAction && (
            <button type="button" onClick={emptyAction.onClick} className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--app-primary-action)] px-5 text-sm font-semibold text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] active:scale-[0.98]">
              <FilePlus2 size={17} aria-hidden="true" />{emptyAction.label}
            </button>
          )}
        </div>
      </div>
    )
  }
  const renderScale = fitScale * zoom
  const textEditStyle = textEdit ? scaleCanvasTextStyle(textEdit.textStyle, renderScale) : undefined
  const hasGenerationStatus = Boolean(generationStatus && generationStatus.status !== 'COMPLETED')
  const generationText = !generationStatus ? ''
    : generationStatus.status === 'FAILED' ? `生成失败：${generationStatus.error || '请稍后重试'}`
      : generationStatus.status === 'PAUSED' ? `已暂停 ${generationStatus.completed}/${generationStatus.total}`
        : `正在生成 ${generationStatus.completed}/${generationStatus.total}`
  const textLimit = textEdit ? textLimitForPath(mediaContract, textEdit.path) : undefined
  const commitTextEdit = () => {
    if (!slide || !textEdit || !onPropsChange) return
    onPropsChange(writeTextPath(slide.props, textEdit.path, textEdit.value))
    setTextEdit(undefined)
  }
  const cancelTextEdit = () => setTextEdit(undefined)
  const findCanvasTextTarget = (event: MouseEvent<HTMLDivElement>) => {
    if (presenting || !slide || !onPropsChange) return
    const target = event.target instanceof Element ? event.target : undefined
    if (!target || target.closest('button,input,textarea,select,[contenteditable="true"]')) return
    const text = normalizeEditableText(target.textContent || '')
    if (!text) return
    const path = findTextPathForCanvas(slide.props, text, target, frameRef.current)
    if (!path) return
    const root = frameRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    return {
      path,
      value: text,
      rect: {
        left: targetRect.left - rootRect.left,
        top: targetRect.top - rootRect.top,
        width: Math.max(180, targetRect.width),
        height: Math.max(44, targetRect.height),
      },
      textStyle: (() => {
        const computed = window.getComputedStyle(target)
        return {
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          fontStyle: computed.fontStyle,
          lineHeight: computed.lineHeight,
          letterSpacing: computed.letterSpacing,
          textAlign: computed.textAlign as CSSProperties['textAlign'],
        }
      })(),
    }
  }
  const selectMediaFromCanvas = (event: MouseEvent<HTMLDivElement>) => {
    if (presenting || !slide || !mediaContract || !onMediaSelect) return false
    const target = event.target instanceof Element ? event.target.closest('img,video') : undefined
    const source = target instanceof HTMLImageElement
      ? target.currentSrc || target.src
      : target instanceof HTMLVideoElement
        ? target.currentSrc || target.src || target.poster
        : ''
    if (!source) return false
    const slot = findMediaSlotForSource(slide.props, mediaContract, source)
    if (!slot) return false
    event.preventDefault()
    event.stopPropagation()
    onMediaSelect(slot.key, slot.index)
    return true
  }
  const handleCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (selectMediaFromCanvas(event)) return
    const target = findCanvasTextTarget(event)
    if (target) setTextSelection({ path: target.path, rect: target.rect })
    if (elementTrigger === 'click') setElementAnimationStep(ELEMENT_ANIMATION_RELEASED)
  }
  const handleCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    const file = event.dataTransfer.files?.[0]
    if (presenting || !slide || !mediaContract || !onMediaUpload || !file) return
    const target = event.target instanceof Element ? event.target.closest('img,video') : undefined
    const source = target instanceof HTMLImageElement
      ? target.currentSrc || target.src
      : target instanceof HTMLVideoElement
        ? target.currentSrc || target.src || target.poster
        : ''
    const slot = source ? findMediaSlotForSource(slide.props, mediaContract, source) : undefined
    if (!slot || (file.type && !file.type.startsWith(`${slot.kind}/`))) return
    event.preventDefault()
    event.stopPropagation()
    onMediaUpload(slot.key, slot.index, file)
  }
  const beginTextEdit = (event: MouseEvent<HTMLDivElement>) => {
    const target = findCanvasTextTarget(event)
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    setTextSelection({ path: target.path, rect: target.rect })
    setTextEdit(target)
  }

  return (
    <div ref={frameRef} data-testid="native-canvas-viewport" className="relative flex h-full min-w-0 w-full items-center justify-center overflow-auto p-6 pb-20" style={{ background: 'var(--app-canvas)' }}>
      <div data-testid="native-canvas-footprint" className={`relative shrink-0 overflow-visible rounded-lg bg-[var(--app-surface)] shadow-[var(--app-shadow-soft)] ring-1 ring-[var(--app-border)] ${transitionClass}`} style={{ width: 1920 * fitScale, height: 1080 * fitScale }}>
        {outgoingSlide && (
          <div aria-hidden="true" className="absolute inset-0 z-0 native-page-outgoing">
            <div className="absolute left-1/2 top-1/2 origin-center" style={{ transform: `translate(-50%, -50%) scale(${renderScale})` }}>
              <NativeSlideRenderer slide={outgoingSlide} initializeEffects={false} animate={false} />
            </div>
          </div>
        )}
        <div data-testid="native-canvas-render-layer" className="absolute left-1/2 top-1/2 z-[1] origin-center" style={{ transform: `translate(-50%, -50%) scale(${renderScale})` }} onClick={handleCanvasClick} onDoubleClick={beginTextEdit} onDragOver={(event) => event.preventDefault()} onDrop={handleCanvasDrop}>
          <NativeSlideRenderer key={`${slide.pageId}:${slide.layout}`} slide={slide} elementAnimationStep={elementAnimationStep} />
        </div>
      </div>
      {textSelection && !textEdit && (
        <div
          data-testid="native-canvas-text-selection"
          className="pointer-events-none absolute z-20 rounded-md border-2 border-[var(--app-accent)] bg-[color:var(--app-accent-soft)]"
          style={{
            left: textSelection.rect.left,
            top: textSelection.rect.top,
            width: textSelection.rect.width,
            height: textSelection.rect.height,
          }}
        />
      )}
      {textEdit && (
        <>
          <textarea
            ref={editorRef}
            aria-label="画布文字编辑"
            value={textEdit.value}
            maxLength={textLimit}
            onChange={(event) => setTextEdit({ ...textEdit, value: event.target.value })}
            onBlur={(event) => {
              const nextFocus = event.relatedTarget
              if (nextFocus instanceof Node && editorToolbarRef.current?.contains(nextFocus)) return
              commitTextEdit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelTextEdit()
              } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                commitTextEdit()
              }
            }}
            className="absolute z-30 box-border resize-none rounded-md border-2 border-[var(--app-accent)] bg-[var(--app-surface)]/95 px-2 py-1 text-[var(--app-text)] shadow-[var(--app-shadow-soft)] outline-none"
            style={{
              left: textEdit.rect.left,
              top: textEdit.rect.top,
              width: textEdit.rect.width,
              minHeight: textEdit.rect.height,
              ...textEditStyle,
            }}
          />
          <div
            ref={editorToolbarRef}
            className="absolute z-30 flex h-9 items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)]/95 p-1 shadow-[var(--app-shadow-soft)] backdrop-blur"
            style={{
              left: textEdit.rect.left,
              top: textEdit.rect.top + Math.max(44, textEdit.rect.height) + 8,
            }}
          >
            <span className="text-[11px] tabular-nums text-[var(--app-text-tertiary)]" aria-label={textLimit ? `文字长度 ${textEdit.value.length}/${textLimit}` : undefined}>{textLimit ? `${textEdit.value.length}/${textLimit}` : ''}</span>
            <span className="sr-only">Ctrl Enter 保存文字修改，Escape 取消文字修改</span>
            <button
              type="button"
              aria-label="保存文字修改"
              title="保存"
              onPointerDown={(event) => {
                event.preventDefault()
              }}
              onClick={commitTextEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-accent)] transition hover:bg-[var(--app-surface-hover)]"
            >
              <Check size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="取消文字修改"
              title="取消"
              onPointerDown={(event) => {
                event.preventDefault()
              }}
              onClick={cancelTextEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-tertiary)] transition hover:bg-[var(--app-surface-hover)]"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
      {(pageCount > 1 || hasGenerationStatus) && (
        <div data-testid="native-page-navigator" className="absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)]/95 px-3 py-2 text-sm shadow-[var(--app-shadow-soft)] backdrop-blur">
          {pageCount > 1 && <>
            <button type="button" aria-label="上一页" title="上一页" disabled={pageIndex <= 0} onClick={onPrevious} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--app-surface-hover)] disabled:opacity-30"><ChevronLeft size={18} /></button>
            <span className="min-w-14 text-center font-mono text-xs font-semibold text-[var(--app-text-secondary)]">{String(pageIndex + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span>
            <button type="button" aria-label="下一页" title="下一页" disabled={pageIndex >= pageCount - 1} onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--app-surface-hover)] disabled:opacity-30"><ChevronRight size={18} /></button>
          </>}
          {hasGenerationStatus && generationStatus && <>
            {pageCount > 1 && <span className="h-4 w-px bg-[var(--app-border)]" aria-hidden="true" />}
            <span role={generationStatus.status === 'FAILED' ? 'alert' : 'status'} className={`whitespace-nowrap text-xs font-semibold ${generationStatus.status === 'FAILED' ? 'text-[var(--app-error)]' : 'text-[var(--app-accent)]'}`}>{generationText}{generationStatus.failed > 0 && `，失败 ${generationStatus.failed}`}</span>
          {generationStatus.status === 'FAILED' && generationStatus.onResume && <button type="button" onClick={generationStatus.onResume} className="rounded-md bg-[var(--app-primary-action)] px-2 py-1 text-xs font-semibold text-[var(--app-surface)]">重试失败页</button>}
          {generationStatus.status === 'PAUSED' && generationStatus.onResume && <button type="button" onClick={generationStatus.onResume} className="rounded-md bg-[var(--app-primary-action)] px-2 py-1 text-xs font-semibold text-[var(--app-surface)]">继续</button>}
            {(generationStatus.status === 'PENDING' || generationStatus.status === 'PROCESSING') && generationStatus.onPause && <button type="button" onClick={generationStatus.onPause} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]">暂停</button>}
          </>}
        </div>
      )}
    </div>
  )
}

function normalizeEditableText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function findTextPathForCanvas(props: Record<string, unknown>, text: string, target: Element, root: HTMLElement | null) {
  const matches: Array<Array<string | number>> = []
  const visit = (value: unknown, path: Array<string | number>) => {
    if (matches.length > 1) return
    if (typeof value === 'string') {
      if (!isMediaString(value) && normalizeEditableText(value) === text) matches.push(path)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]))
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key.startsWith('__')) continue
        visit(child, [...path, key])
      }
    }
  }
  visit(props, [])
  if (matches.length === 1) return matches[0]
  if (!root) return undefined
  const occurrences = Array.from(root.querySelectorAll<HTMLElement>('.native-slide *'))
    .filter((element) => element.children.length === 0 && normalizeEditableText(element.textContent || '') === text)
  const index = occurrences.indexOf(target as HTMLElement)
  return index >= 0 ? matches[index] : undefined
}

function writeTextPath(props: Record<string, unknown>, path: Array<string | number>, value: string): Record<string, unknown> {
  const write = (current: unknown, cursor: number): unknown => {
    if (cursor >= path.length) return value
    const key = path[cursor]
    if (typeof key === 'number') {
      const items = Array.isArray(current) ? [...current] : []
      items[key] = write(items[key], cursor + 1)
      return items
    }
    const object = current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {}
    return { ...object, [key]: write(object[key], cursor + 1) }
  }
  return write(props, 0) as Record<string, unknown>
}

function scaleCanvasTextStyle(style: TextEditState['textStyle'] | undefined, scale: number): CSSProperties {
  if (!style) return {}
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return { ...style }
  return {
    ...style,
    fontSize: scaleCssPxValue(style.fontSize, scale),
    lineHeight: scaleCssPxValue(style.lineHeight, scale),
    letterSpacing: scaleCssPxValue(style.letterSpacing, scale),
  }
}

function scaleCssPxValue(value: CSSProperties['fontSize'] | CSSProperties['lineHeight'] | CSSProperties['letterSpacing'] | undefined, scale: number) {
  if (typeof value === 'number') return value * scale
  if (typeof value !== 'string') return value
  if (value === 'normal') return value
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric)) return value
  if (value.endsWith('px')) return `${numeric * scale}px`
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${numeric * scale}`
  return value
}

function isMediaString(value: string) {
  return value.startsWith('/files/') || value.startsWith('assets/') || value.startsWith('data:image/') || value.startsWith('data:video/')
}

function findMediaSlotForSource(
  props: Record<string, unknown>,
  contract: { propShapes: Record<string, unknown>; mediaSlots: Array<{ key: string } & Record<string, unknown>> },
  source: string,
) {
  for (const slot of contract.mediaSlots) {
    const shape = contract.propShapes[slot.key]
    if (Array.isArray(shape)) {
      const values = Array.isArray(props[slot.key]) ? props[slot.key] as unknown[] : []
      const index = values.findIndex((value) => typeof value === 'string' && sameMediaSource(value, source))
      if (index >= 0) return { key: slot.key, index, kind: mediaSlotKind(slot) }
    } else {
      const value = props[slot.key]
      if (typeof value === 'string' && sameMediaSource(value, source)) return { key: slot.key, index: undefined, kind: mediaSlotKind(slot) }
    }
  }
  return undefined
}

function sameMediaSource(value: string, source: string) {
  const normalizedSource = normalizeMediaSource(source)
  return normalizeMediaSource(value) === normalizedSource || normalizeMediaSource(getImageUrl(value)) === normalizedSource
}

function normalizeMediaSource(value: string) {
  try {
    const url = new URL(value, window.location.origin)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0]
  }
}

function mediaSlotKind(slot: Record<string, unknown>) {
  return String(slot.kind || slot.type || slot.mediaType || '').toLowerCase().includes('video') ? 'video' : 'image'
}

function textLimitForPath(
  contract: NativeDeckCanvasProps['mediaContract'],
  path: Array<string | number>,
) {
  const key = typeof path[0] === 'string' ? path[0] : ''
  if (!key) return undefined
  return contract?.copyBudgets?.[key]?.maxChars || contract?.arrayLimits?.[key]?.itemMaxChars
}
