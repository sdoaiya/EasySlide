import { NativeSlideRenderer } from './NativeSlideRenderer'
import { useNativeExportRuntime } from '@/native-deck/useNativeExportRuntime'
import type { NativeSlideSpec } from '@/native-deck/types'

export function NativeDeckExportSurface({ slides }: { slides: NativeSlideSpec[] }) {
  useNativeExportRuntime(slides.length)

  return (
    <div
      id="deck"
      aria-hidden="true"
      style={{ position: 'fixed', left: -100000, top: 0, width: 1920, height: 1080 }}
    >
      {slides.map((slide, index) => (
        <section
          key={slide.pageId}
          className={`slide${index === 0 ? ' active' : ''}`}
          data-deck-active={index === 0 ? '' : undefined}
          style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, overflow: 'hidden' }}
        >
          <NativeSlideRenderer slide={slide} initializeEffects={false} />
        </section>
      ))}
    </div>
  )
}
