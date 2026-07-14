import { apiClient } from '@/api/client'
import type { NativeSlideSpec } from '@/native-deck/types'
import { create } from 'zustand'

type NativeDeckState = {
  slides: NativeSlideSpec[]
  selectedPageId: string | null
  dirtyPageIds: Set<string>
  savePage: (projectId: string, pageId: string) => Promise<void>
}

export const useNativeDeckStore = create<NativeDeckState>((set, get) => ({
  slides: [],
  selectedPageId: null,
  dirtyPageIds: new Set(),
  savePage: async (projectId, pageId) => {
    const slide = get().slides.find((item) => item.pageId === pageId)
    if (!slide) return

    const payload = { layout: slide.layout, props: slide.props }
    await apiClient.put(`/api/projects/${projectId}/pages/${pageId}/native`, payload)

    set((state) => {
      const current = state.slides.find((item) => item.pageId === pageId)
      if (!current || current.layout !== payload.layout || current.props !== payload.props) return state
      const dirtyPageIds = new Set(state.dirtyPageIds)
      dirtyPageIds.delete(pageId)
      return { dirtyPageIds }
    })
  },
}))
