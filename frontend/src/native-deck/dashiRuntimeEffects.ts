import { getImageUrl } from '@/api/client'

type UnicornScene = { destroy?: () => void }
type UnicornWindow = Window & {
  UnicornStudio?: { addScene: (config: Record<string, unknown>) => Promise<UnicornScene> }
}
type UnicornFrame = HTMLElement & { __unicornScene?: UnicornScene }

let unicornSdk: Promise<void> | undefined

export function resolveDashiAssetUrl(value: string) {
  if (value.startsWith('/files/')) return getImageUrl(value)
  if (!value.startsWith('assets/')) return value
  if (window.location.protocol === 'file:') return new URL(value, window.location.href.split('#')[0]).href
  return new URL(`/${value}`, window.location.origin).href
}

export function resolveDashiAssetProps(value: unknown): unknown {
  if (typeof value === 'string') return resolveDashiAssetUrl(value)
  if (Array.isArray(value)) return value.map(resolveDashiAssetProps)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveDashiAssetProps(child)]))
  return value
}

export async function prepareDashiRuntime(root: HTMLElement, options: { initializeUnicorn?: boolean } = {}) {
  rewriteAssetAttributes(root)
  if (options.initializeUnicorn === false) return
  const frames = Array.from(root.querySelectorAll<UnicornFrame>('.bt-unicorn-frame[data-unicorn-json-file-path],.bt-unicorn-frame[data-unicorn-project-id]'))
  if (!frames.length) return
  try {
    await loadUnicornSdk(frames[0].dataset.unicornSdkUrl || 'assets/vendor/unicornstudio.umd.js')
    await Promise.allSettled(frames.map(initUnicornFrame))
  } catch {
    frames.forEach((frame) => { frame.dataset.unicornFallback = 'runtime-load' })
  }
}

export function disposeDashiRuntime(root: HTMLElement) {
  root.querySelectorAll<UnicornFrame>('.bt-unicorn-frame').forEach((frame) => {
    frame.__unicornScene?.destroy?.()
    frame.__unicornScene = undefined
    frame.removeAttribute('data-unicorn-ready')
  })
}

function rewriteAssetAttributes(root: HTMLElement) {
  const attributes = ['src', 'href', 'poster', 'data-unicorn-json-file-path', 'data-unicorn-sdk-url']
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute)
      if (value?.startsWith('assets/')) element.setAttribute(attribute, resolveDashiAssetUrl(value))
    }
  })
}

function loadUnicornSdk(source: string) {
  const target = window as UnicornWindow
  if (target.UnicornStudio?.addScene) return Promise.resolve()
  if (unicornSdk) return unicornSdk
  unicornSdk = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = resolveDashiAssetUrl(source)
    script.async = true
    script.onload = () => target.UnicornStudio?.addScene ? resolve() : reject(new Error('UnicornStudio.addScene not found'))
    script.onerror = () => reject(new Error(`Failed to load Unicorn SDK: ${script.src}`))
    document.head.appendChild(script)
  }).catch((error) => {
    unicornSdk = undefined
    throw error
  })
  return unicornSdk
}

async function initUnicornFrame(frame: UnicornFrame) {
  if (frame.dataset.unicornReady) return
  const scene = frame.querySelector<HTMLElement>('.bt-unicorn-scene')
  const studio = (window as UnicornWindow).UnicornStudio
  if (!scene || !studio?.addScene) return
  scene.id ||= `unicorn-${Math.random().toString(36).slice(2, 11)}`
  const config: Record<string, unknown> = {
    elementId: scene.id,
    scale: Number(frame.dataset.unicornScale || 1),
    dpi: Number(frame.dataset.unicornDpi || 1.5),
    lazyLoad: false,
    production: true,
    altText: 'Shader scene',
    ariaLabel: 'Shader scene',
  }
  if (frame.dataset.unicornJsonFilePath) config.filePath = frame.dataset.unicornJsonFilePath
  else config.projectId = frame.dataset.unicornProjectId
  frame.dataset.unicornReady = 'true'
  try {
    frame.__unicornScene = await studio.addScene(config)
  } catch (error) {
    frame.removeAttribute('data-unicorn-ready')
    throw error
  }
}
