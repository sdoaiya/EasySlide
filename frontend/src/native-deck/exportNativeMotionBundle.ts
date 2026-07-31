import type { NativeSlideSpec } from './types'

const WIDTH = 1920 as const
const HEIGHT = 1080 as const
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const RESOURCE_ATTRIBUTES = [
  ['img', 'src'],
  ['img', 'srcset'],
  ['video', 'src'],
  ['video', 'poster'],
  ['audio', 'src'],
  ['source', 'src'],
  ['source', 'srcset'],
  ['track', 'src'],
  ['image', 'href'],
  ['image', 'xlink:href'],
] as const

export interface NativeSceneManifestRef {
  page_id: string
  sha256: string
}

export interface NativeMotionBundleAsset {
  asset_id: string
  source: string
  data_url: string
  mime_type: string
}

export interface NativeMotionSceneBundle {
  schema_version: 1
  page_id: string
  scene_manifest_sha256: string
  width: 1920
  height: 1080
  html: string
  css: string
  assets: NativeMotionBundleAsset[]
  warnings: string[]
}

export interface NativeMotionAssetContext {
  pageId: string
  location: string
  resolvedUrl: string
}

export type NativeMotionAssetResolver = (
  source: string,
  context: NativeMotionAssetContext,
) => Promise<string | null>

export interface CaptureNativeMotionBundleOptions {
  resolveAsset?: NativeMotionAssetResolver
}

/** Freeze the same hidden export DOM used for frame and Scene Manifest capture. */
export async function captureNativeMotionBundles(
  slides: NativeSlideSpec[],
  sceneManifestRefs: NativeSceneManifestRef[],
  root: ParentNode = document,
  options: CaptureNativeMotionBundleOptions = {},
): Promise<NativeMotionSceneBundle[]> {
  const renderedSlides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (renderedSlides.length !== slides.length) throw new Error('场景包页面数量与导出页面不一致')
  if (sceneManifestRefs.length !== slides.length) throw new Error('场景清单引用数量与导出页面不一致')

  const ownerDocument = renderedSlides[0]?.ownerDocument || document
  const globalCss = collectAccessibleStylesheets(ownerDocument, renderedSlides)
  const bundles: NativeMotionSceneBundle[] = []

  for (const [index, container] of renderedSlides.entries()) {
    const slide = slides[index]
    const ref = sceneManifestRefs[index]
    const sceneRoot = container.querySelector<HTMLElement>('.native-slide')
    if (!sceneRoot) throw new Error(`第 ${index + 1} 页缺少原生场景根节点`)
    if (sceneRoot.dataset.pageId !== slide.pageId) throw new Error(`第 ${index + 1} 页场景顺序与导出页面不一致`)
    if (ref?.page_id !== slide.pageId) throw new Error(`第 ${index + 1} 页场景清单引用顺序不一致`)

    const warnings = [...globalCss.warnings]
    const clone = sceneRoot.cloneNode(true) as HTMLElement
    sanitizeClone(clone)
    const pageCss = Array.from(sceneRoot.querySelectorAll('style')).map((style) => style.textContent || '')
    clone.querySelectorAll('style').forEach((style) => style.remove())

    const assetState: AssetState = {
      pageId: slide.pageId,
      document: ownerDocument,
      resolver: options.resolveAsset || defaultAssetResolver,
      assets: [],
      assetBySource: new Map(),
      warnings,
    }
    await inlineElementResources(clone, assetState)
    const css = await inlineCssResources(
      unique([...globalCss.blocks, ...pageCss]).filter(Boolean).join('\n'),
      assetState,
      'css',
    )

    const bundle: NativeMotionSceneBundle = {
      schema_version: 1,
      page_id: slide.pageId,
      scene_manifest_sha256: ref.sha256,
      width: WIDTH,
      height: HEIGHT,
      html: clone.outerHTML,
      css,
      assets: assetState.assets,
      warnings: unique(warnings),
    }
    const errors = validateNativeMotionSceneBundle(bundle)
    if (errors.length) throw new Error(`第 ${index + 1} 页场景包无效：${errors.join('；')}`)
    bundles.push(bundle)
  }

  const collectionErrors = validateNativeMotionBundleCollection(bundles, slides, sceneManifestRefs)
  if (collectionErrors.length) throw new Error(`场景包集合无效：${collectionErrors.join('；')}`)
  return bundles
}

export function validateNativeMotionSceneBundle(bundle: NativeMotionSceneBundle) {
  const errors: string[] = []
  if (!bundle || typeof bundle !== 'object') return ['bundle must be an object']
  if (bundle.schema_version !== 1) errors.push('schema_version must be 1')
  if (!bundle.page_id) errors.push('page_id is required')
  if (!SHA256_PATTERN.test(bundle.scene_manifest_sha256 || '')) errors.push('scene_manifest_sha256 must be a SHA-256 hex digest')
  if (bundle.width !== WIDTH || bundle.height !== HEIGHT) errors.push('native motion scene must be 1920x1080')
  if (typeof bundle.html !== 'string' || !bundle.html) errors.push('html is required')
  if (typeof bundle.css !== 'string') errors.push('css must be a string')
  if (!Array.isArray(bundle.assets)) errors.push('assets must be an array')
  if (!Array.isArray(bundle.warnings) || bundle.warnings.some((warning) => typeof warning !== 'string')) errors.push('warnings must be an array of strings')
  if (errors.some((error) => error === 'html is required')) return errors

  const template = document.createElement('template')
  template.innerHTML = bundle.html
  const sceneRoot = template.content.firstElementChild
  if (!(sceneRoot instanceof HTMLElement) || !sceneRoot.classList.contains('native-slide')) {
    errors.push('html must contain one native scene root')
    return errors
  }
  if (template.content.children.length !== 1) errors.push('html must contain one native scene root')
  if (sceneRoot.dataset.pageId !== bundle.page_id) errors.push('html page_id does not match bundle')
  if (sceneRoot.querySelector('script,iframe,object,embed')) errors.push('html contains executable content')

  const motionElements = Array.from(sceneRoot.querySelectorAll<HTMLElement>('[data-motion-id]'))
  const motionIds = motionElements.map((element) => element.dataset.motionId || '')
  if (!motionIds.length) errors.push('html must contain at least one data-motion-id')
  if (motionIds.some((id) => !id)) errors.push('data-motion-id must be non-empty')
  if (new Set(motionIds).size !== motionIds.length) errors.push('data-motion-id values must be unique')
  for (const element of [sceneRoot, ...Array.from(sceneRoot.querySelectorAll<HTMLElement>('*'))]) {
    const attributeNames = Array.from(element.attributes).map((attribute) => attribute.name.toLowerCase())
    if (attributeNames.some((name) => name.startsWith('on'))) errors.push('html contains event handler attributes')
    if (attributeNames.some(isEditorAttribute)) errors.push('html contains editor state attributes')
  }
  if (containsRemoteResource(sceneRoot) || containsRemoteCss(bundle.css)) errors.push('bundle contains a remote resource URL')
  if (Array.isArray(bundle.assets)) {
    const assetIds = bundle.assets.map((asset) => asset.asset_id)
    if (assetIds.some((id) => !id) || new Set(assetIds).size !== assetIds.length) errors.push('asset_id values must be non-empty and unique')
    if (bundle.assets.some((asset) => !asset.data_url.startsWith('data:'))) errors.push('assets must contain data URLs only')
  }
  return unique(errors)
}

export function validateNativeMotionBundleCollection(
  bundles: NativeMotionSceneBundle[],
  slides: NativeSlideSpec[],
  refs: NativeSceneManifestRef[],
) {
  const errors: string[] = []
  if (bundles.length !== slides.length) errors.push('bundle count does not match slides')
  if (refs.length !== slides.length) errors.push('scene manifest reference count does not match slides')
  slides.forEach((slide, index) => {
    if (bundles[index]?.page_id !== slide.pageId) errors.push(`bundles[${index}].page_id is out of order`)
    if (refs[index]?.page_id !== slide.pageId) errors.push(`refs[${index}].page_id is out of order`)
    if (bundles[index]?.scene_manifest_sha256 !== refs[index]?.sha256) errors.push(`bundles[${index}].scene_manifest_sha256 does not match reference`)
  })
  return errors
}

interface AssetState {
  pageId: string
  document: Document
  resolver: NativeMotionAssetResolver
  assets: NativeMotionBundleAsset[]
  assetBySource: Map<string, NativeMotionBundleAsset>
  warnings: string[]
}

function collectAccessibleStylesheets(ownerDocument: Document, containers: HTMLElement[]) {
  const blocks: string[] = []
  const warnings: string[] = []
  const sceneRoots = containers.map((container) => container.querySelector('.native-slide')).filter(Boolean) as Element[]
  Array.from(ownerDocument.styleSheets).forEach((sheet, index) => {
    const ownerNode = (sheet as CSSStyleSheet & { ownerNode?: Node | null }).ownerNode
    if (ownerNode && sceneRoots.some((sceneRoot) => sceneRoot.contains(ownerNode))) return
    try {
      blocks.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n'))
    } catch {
      warnings.push(`unresolved_stylesheet:${index}:${sheet.href || 'inline'}`)
    }
  })
  return { blocks: unique(blocks).filter(Boolean), warnings }
}

function sanitizeClone(root: HTMLElement) {
  root.querySelectorAll('script,iframe,object,embed').forEach((element) => element.remove())
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (
        name.startsWith('on')
        || name === 'srcdoc'
        || isEditorAttribute(name)
      ) element.removeAttribute(attribute.name)
      if (['href', 'action', 'formaction'].includes(name) && /^\s*javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name)
    }
  }
}

async function inlineElementResources(root: HTMLElement, state: AssetState) {
  for (const [selector, attribute] of RESOURCE_ATTRIBUTES) {
    for (const element of Array.from(root.querySelectorAll<Element>(`${selector}[${cssEscape(attribute)}]`))) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const location = `${selector}[${attribute}]`
      if (attribute === 'srcset') {
        const inlined = await inlineSrcset(value, state, location)
        if (inlined) element.setAttribute(attribute, inlined)
        else element.removeAttribute(attribute)
      } else {
        const inlined = await resolveAsset(value, state, location)
        if (inlined) element.setAttribute(attribute, inlined)
        else element.removeAttribute(attribute)
      }
    }
  }
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('[style]'))]) {
    if (!element.hasAttribute('style')) continue
    const style = element.getAttribute('style') || ''
    element.setAttribute('style', await inlineCssResources(style, state, `${element.tagName.toLowerCase()}[style]`))
  }
}

async function inlineSrcset(value: string, state: AssetState, location: string) {
  const candidates = value.split(',').map((candidate) => candidate.trim()).filter(Boolean)
  const output: string[] = []
  for (const candidate of candidates) {
    const [source, ...descriptor] = candidate.split(/\s+/)
    const dataUrl = await resolveAsset(source, state, location)
    if (dataUrl) output.push([dataUrl, ...descriptor].join(' '))
  }
  return output.join(', ')
}

async function inlineCssResources(css: string, state: AssetState, location: string) {
  let sanitized = css.replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, (rule) => {
    state.warnings.push(`removed_css_import:${state.pageId}:${location}:${normalizeWarningValue(rule)}`)
    return ''
  })
  const matches = Array.from(sanitized.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi))
  for (const match of matches) {
    const source = match[2].trim()
    if (!source || source.startsWith('#')) continue
    const dataUrl = await resolveAsset(source, state, location)
    sanitized = sanitized.replace(match[0], dataUrl ? `url("${dataUrl}")` : 'url("")')
  }
  return sanitized
}

async function resolveAsset(source: string, state: AssetState, location: string) {
  const normalized = source.trim()
  const existing = state.assetBySource.get(normalized)
  if (existing) return existing.data_url
  const resolvedUrl = resolveUrl(normalized, state.document.baseURI)
  if (!resolvedUrl || isRemoteUrl(resolvedUrl, state.document)) {
    state.warnings.push(`unresolved_asset:${state.pageId}:${location}:${normalizeWarningValue(normalized)}`)
    return null
  }
  try {
    const dataUrl = normalized.startsWith('data:')
      ? normalized
      : await state.resolver(normalized, { pageId: state.pageId, location, resolvedUrl })
    if (!dataUrl?.startsWith('data:')) throw new Error('resolver did not return a data URL')
    const asset: NativeMotionBundleAsset = {
      asset_id: `asset-${String(state.assets.length + 1).padStart(3, '0')}`,
      source: normalized,
      data_url: dataUrl,
      mime_type: /^data:([^;,]+)/i.exec(dataUrl)?.[1] || 'application/octet-stream',
    }
    state.assets.push(asset)
    state.assetBySource.set(normalized, asset)
    return dataUrl
  } catch {
    state.warnings.push(`unresolved_asset:${state.pageId}:${location}:${normalizeWarningValue(normalized)}`)
    return null
  }
}

async function defaultAssetResolver(_source: string, context: NativeMotionAssetContext) {
  const response = await fetch(context.resolvedUrl)
  if (!response.ok) return null
  return blobToDataUrl(await response.blob())
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

function resolveUrl(source: string, baseUrl: string) {
  if (/^(?:data:|blob:)/i.test(source)) return source
  try {
    const url = new URL(source, baseUrl)
    return ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function isRemoteUrl(url: string, ownerDocument: Document) {
  if (!/^https?:/i.test(url)) return false
  try {
    return new URL(url).origin !== new URL(ownerDocument.baseURI).origin
  } catch {
    return true
  }
}

function containsRemoteResource(root: HTMLElement) {
  return RESOURCE_ATTRIBUTES.some(([selector, attribute]) => Array.from(root.querySelectorAll<Element>(`${selector}[${cssEscape(attribute)}]`)).some((element) => {
    const value = element.getAttribute(attribute) || ''
    return /https?:\/\//i.test(value)
  }))
}

function containsRemoteCss(css: string) {
  return /(?:url\(\s*["']?https?:\/\/|@import\s+[^;]*https?:\/\/)/i.test(css)
}

function cssEscape(attribute: string) {
  return attribute.replace(':', '\\:')
}

function isEditorAttribute(name: string) {
  return name === 'contenteditable'
    || name === 'spellcheck'
    || name === 'draggable'
    || /^data-(?:selected|editing|editor(?:-.+)?|resizing|dragging|focused)$/.test(name)
}

function normalizeWarningValue(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}
