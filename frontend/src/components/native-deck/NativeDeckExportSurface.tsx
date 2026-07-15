import { NativeSlideRenderer } from './NativeSlideRenderer'
import { useNativeExportRuntime } from '@/native-deck/useNativeExportRuntime'
import type { NativeSlideSpec } from '@/native-deck/types'

export function NativeDeckExportSurface({ slides }: { slides: NativeSlideSpec[] }) {
  useNativeExportRuntime(slides.length)

  return (
    <div
      id="deck"
      aria-hidden="true"
      className="native-export-surface"
      style={{ position: 'fixed', left: -100000, top: 0, width: 1920, height: 1080 }}
    >
      {slides.map((slide, index) => (
        <section
          key={slide.pageId}
          className={`slide${index === 0 ? ' active' : ''}`}
          data-deck-active={index === 0 ? '' : undefined}
          data-native-transition={typeof (slide.props.__animation as { transition?: unknown } | undefined)?.transition === 'string' ? String((slide.props.__animation as { transition?: string }).transition) : undefined}
          data-native-transition-speed={typeof (slide.props.__animation as { transitionSpeed?: unknown } | undefined)?.transitionSpeed === 'string' ? String((slide.props.__animation as { transitionSpeed?: string }).transitionSpeed) : undefined}
          data-native-transition-direction={typeof (slide.props.__animation as { transitionDirection?: unknown } | undefined)?.transitionDirection === 'string' ? String((slide.props.__animation as { transitionDirection?: string }).transitionDirection) : undefined}
          data-native-advance-after={typeof (slide.props.__animation as { advanceAfter?: unknown } | undefined)?.advanceAfter === 'number' ? String((slide.props.__animation as { advanceAfter?: number }).advanceAfter) : undefined}
          data-native-animation={JSON.stringify(slide.props.__animation || {}).replace(/[<>&]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' })[character]!)}
          style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, overflow: 'hidden' }}
        >
          <NativeSlideRenderer slide={slide} initializeEffects={false} animate={false} />
        </section>
      ))}
    </div>
  )
}
