import { useEffect, useRef, useState } from 'react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { NativeSlideRenderer } from './NativeSlideRenderer'

type NativeDeckCanvasProps = {
  slide: NativeSlideSpec | undefined
  zoom?: number
}

export function NativeDeckCanvas({ slide, zoom = 1 }: NativeDeckCanvasProps) {
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
    <div ref={frameRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background-primary p-4">
      <div className="relative shrink-0 shadow-lg" style={{ width: 1920 * scale, height: 1080 * scale }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
          <NativeSlideRenderer key={slide.layout} slide={slide} />
        </div>
      </div>
    </div>
  )
}
