declare module '*.module.mjs' {
  import type { ComponentType } from 'react'

  export const runtimePages: Array<{
    key: string
    themeKey: string
    Component: ComponentType<Record<string, unknown>>
    controls: Array<Record<string, unknown>>
    defaultProps: Record<string, unknown>
    label: string
    slot: string
    bgClass?: string
  }>
}
