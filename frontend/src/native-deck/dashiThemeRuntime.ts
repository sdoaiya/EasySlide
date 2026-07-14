import type { ComponentType } from 'react'

export type DashiRuntimePage = {
  key: string
  themeKey: string
  Component: ComponentType<Record<string, unknown>>
  controls: Array<Record<string, unknown>>
  defaultProps: Record<string, unknown>
  label: string
  slot: string
  bgClass?: string
}

type DashiRuntimeModule = { runtimePages: DashiRuntimePage[] }

const loaders: Record<string, () => Promise<DashiRuntimeModule>> = {
  theme01: () => import('@/vendor/dashiai-ppt/theme-runtime/theme01.module.mjs'),
  theme02: () => import('@/vendor/dashiai-ppt/theme-runtime/theme02.module.mjs'),
  theme03: () => import('@/vendor/dashiai-ppt/theme-runtime/theme03.module.mjs'),
  theme04: () => import('@/vendor/dashiai-ppt/theme-runtime/theme04.module.mjs'),
  theme05: () => import('@/vendor/dashiai-ppt/theme-runtime/theme05.module.mjs'),
  theme06: () => import('@/vendor/dashiai-ppt/theme-runtime/theme06.module.mjs'),
  theme07: () => import('@/vendor/dashiai-ppt/theme-runtime/theme07.module.mjs'),
  theme08: () => import('@/vendor/dashiai-ppt/theme-runtime/theme08.module.mjs'),
  theme09: () => import('@/vendor/dashiai-ppt/theme-runtime/theme09.module.mjs'),
  theme10: () => import('@/vendor/dashiai-ppt/theme-runtime/theme10.module.mjs'),
  theme11: () => import('@/vendor/dashiai-ppt/theme-runtime/theme11.module.mjs'),
  theme12: () => import('@/vendor/dashiai-ppt/theme-runtime/theme12.module.mjs'),
}

const modules = new Map<string, Promise<DashiRuntimeModule>>()

export function isDashiLayout(layout: string) {
  return /^theme(?:0[1-9]|1[0-2])_page\d{3}$/.test(layout)
}

export async function loadDashiRuntimePage(layout: string) {
  const theme = layout.slice(0, 7)
  const loader = loaders[theme]
  if (!loader) return undefined
  const module = await (modules.get(theme) || cacheModule(theme, loader()))
  return module.runtimePages.find((page) => page.key === layout)
}

function cacheModule(theme: string, module: Promise<DashiRuntimeModule>) {
  modules.set(theme, module)
  return module
}
