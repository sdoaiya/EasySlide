import { useEffect } from 'react'
import { prepareDashiRuntime } from './dashiRuntimeEffects'

declare global {
  interface Window {
    __getVisibleSlides?: () => HTMLElement[]
    __layoutDeck?: () => void
    go?: (index: number, options?: { animate?: boolean; force?: boolean }) => void
    __ensureRuntimeSlideRendered?: (slide?: Element) => void | Promise<void>
  }
}

export function useNativeExportRuntime(slideCount: number) {
  useEffect(() => {
    const previous = {
      getVisibleSlides: window.__getVisibleSlides,
      layoutDeck: window.__layoutDeck,
      go: window.go,
      ensureRuntimeSlideRendered: window.__ensureRuntimeSlideRendered,
    }
    const getSlides = () => Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide'))

    window.__getVisibleSlides = getSlides
    window.__layoutDeck = () => undefined
    window.go = (index) => {
      getSlides().forEach((slide, slideIndex) => {
        const active = slideIndex === index
        slide.classList.toggle('active', active)
        slide.toggleAttribute('data-deck-active', active)
      })
    }
    window.__ensureRuntimeSlideRendered = async (slide) => {
      if (slide instanceof HTMLElement) await prepareDashiRuntime(slide)
    }
    window.go(0)

    return () => {
      window.__getVisibleSlides = previous.getVisibleSlides
      window.__layoutDeck = previous.layoutDeck
      window.go = previous.go
      window.__ensureRuntimeSlideRendered = previous.ensureRuntimeSlideRendered
    }
  }, [slideCount])
}
