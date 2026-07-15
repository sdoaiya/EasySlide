import type { ComponentType } from 'react'

export type RenderMode = 'image' | 'native'

export interface NativeSlideSpec {
  pageId: string
  layout: string
  props: Record<string, unknown>
  pending?: boolean
}

export interface NativeLayoutComponentProps {
  props: Record<string, unknown>
}

export type NativeLayoutComponent = ComponentType<NativeLayoutComponentProps>
