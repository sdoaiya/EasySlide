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
          data-native-generation-fallback={isGenerationFallback(slide) ? 'true' : undefined}
          data-native-quality-report={qualityReport(slide)}
          style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, overflow: 'hidden' }}
        >
          <NativeSlideRenderer slide={slide} initializeEffects={false} animate={false} />
        </section>
      ))}
    </div>
  )
}

function qualityReport(slide: NativeSlideSpec) {
  const intent = slide.props.__design_intent
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return undefined
  const report = (intent as Record<string, unknown>).quality_report
  return report && typeof report === 'object' && !Array.isArray(report)
    ? JSON.stringify(report).replace(/[<>&]/g, (character) => ({ '<': '\u003c', '>': '\u003e', '&': '\u0026' })[character]!)
    : undefined
}

function isGenerationFallback(slide: NativeSlideSpec) {
  const intent = slide.props.__design_intent
  return Boolean(intent && typeof intent === 'object' && (intent as Record<string, unknown>).generation_fallback)
}
