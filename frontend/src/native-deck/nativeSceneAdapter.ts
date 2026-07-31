import type { NativeSlideSpec } from './types'

export type SceneElementKind = 'title' | 'body' | 'image' | 'number' | 'chart'

export interface SceneManifestElement {
  id: string
  kind: SceneElementKind
  role: 'headline' | 'supporting' | 'visual' | 'evidence'
  bbox: [number, number, number, number]
  z_index: number
  asset_path: string | null
  text: string | null
  motion_capabilities: string[]
}

export interface NativeSceneManifest {
  schema_version: 1
  page_id: string
  render_mode: 'native'
  width: 1920
  height: 1080
  visual_style: {
    theme_id: string
    colors: string[]
    font_families: string[]
  }
  elements: SceneManifestElement[]
  fallback_preview_path: string | null
  quality: { score: number; warnings: string[] }
}

type Candidate = {
  id: string
  kind: SceneElementKind
  value: string | number | unknown[] | Record<string, unknown>
}

const textSelector = 'h1,h2,h3,h4,p,li,span,strong,em,small,figcaption,td,th'
const chartSelector = '[data-flint-chart],canvas,svg,[class*="chart"]'
const sceneElementKinds = new Set<SceneElementKind>(['title', 'body', 'image', 'number', 'chart'])
const sceneElementRoles = new Set<SceneManifestElement['role']>(['headline', 'supporting', 'visual', 'evidence'])
const sceneMotionCapabilities: Record<SceneElementKind, Set<string>> = {
  title: new Set(['reveal', 'highlight']),
  body: new Set(['reveal', 'highlight']),
  image: new Set(['reveal', 'scale', 'pan']),
  number: new Set(['reveal', 'highlight', 'count']),
  chart: new Set(['reveal', 'highlight', 'scale', 'pan']),
}

export function annotateNativeMotionElements(root: HTMLElement, props: Record<string, unknown>) {
  return matchCandidates(root, collectCandidates(props)).map(({ candidate, target }) => {
    target.dataset.motionId = candidate.id
    target.dataset.motionKind = candidate.kind
    return { candidate, target }
  })
}

export function buildNativeSceneManifest(
  root: HTMLElement,
  slide: NativeSlideSpec,
  fallbackPreviewPath: string | null = null,
): NativeSceneManifest {
  const rootRect = root.getBoundingClientRect()
  const scaleX = rootRect.width > 0 ? 1920 / rootRect.width : 1
  const scaleY = rootRect.height > 0 ? 1080 / rootRect.height : 1
  const matches = annotateNativeMotionElements(root, slide.props)
  const warnings: string[] = []
  if (!matches.length) warnings.push('no_scene_elements')

  const elements = matches.map(({ candidate, target }): SceneManifestElement => {
    const rect = target.getBoundingClientRect()
    const style = window.getComputedStyle(target)
    return {
      id: candidate.id,
      kind: candidate.kind,
      role: roleFor(candidate.kind),
      bbox: [
        round((rect.left - rootRect.left) * scaleX),
        round((rect.top - rootRect.top) * scaleY),
        round(rect.width * scaleX),
        round(rect.height * scaleY),
      ],
      z_index: Number.parseInt(style.zIndex, 10) || 0,
      asset_path: candidate.kind === 'image' ? String(candidate.value) : null,
      text: candidate.kind === 'image' || candidate.kind === 'chart' ? null : String(candidate.value),
      motion_capabilities: capabilitiesFor(candidate.kind),
    }
  })
  const rootStyle = window.getComputedStyle(root)
  const styles = [rootStyle, ...matches.map(({ target }) => window.getComputedStyle(target))]

  return {
    schema_version: 1,
    page_id: slide.pageId,
    render_mode: 'native',
    width: 1920,
    height: 1080,
    visual_style: {
      theme_id: slide.layout,
      colors: unique(styles.flatMap((style) => [style.color, style.backgroundColor]).filter(isVisibleColor)),
      font_families: unique(styles.flatMap((style) => style.fontFamily.split(',').map(cleanFont)).filter(Boolean)),
    },
    elements,
    fallback_preview_path: fallbackPreviewPath,
    quality: { score: matches.length ? 1 : 0, warnings },
  }
}

export function validateNativeSceneManifest(manifest: NativeSceneManifest) {
  const errors: string[] = []
  if (manifest.schema_version !== 1) errors.push('schema_version must be 1')
  if (!manifest.page_id) errors.push('page_id is required')
  if (manifest.render_mode !== 'native') errors.push('render_mode must be native')
  if (manifest.width !== 1920 || manifest.height !== 1080) errors.push('native scene must be 1920x1080')
  if (!isRecord(manifest.visual_style)) {
    errors.push('visual_style must be an object')
  } else {
    if (typeof manifest.visual_style.theme_id !== 'string' || !manifest.visual_style.theme_id) errors.push('visual_style.theme_id must be a non-empty string')
    errors.push(...validateStringArray(manifest.visual_style.colors, 'visual_style.colors'))
    errors.push(...validateStringArray(manifest.visual_style.font_families, 'visual_style.font_families', true))
  }
  const ids = new Set<string>()
  if (!Array.isArray(manifest.elements)) {
    errors.push('elements must be an array')
  } else {
    for (const [index, element] of manifest.elements.entries()) {
      if (!isRecord(element)) {
        errors.push(`elements[${index}] must be an object`)
        continue
      }
      const id = typeof element.id === 'string' ? element.id : ''
      const path = `elements[${index}]`
      if (!id || ids.has(id)) errors.push(`duplicate or empty element id: ${id}`)
      ids.add(id)
      const kind = element.kind as SceneElementKind
      if (!sceneElementKinds.has(kind)) errors.push(`${path}.kind is invalid`)
      if (!sceneElementRoles.has(element.role as SceneManifestElement['role'])) errors.push(`${path}.role is invalid`)
      if (!Array.isArray(element.motion_capabilities)) {
        errors.push(`${path}.motion_capabilities must be an array`)
      } else {
        const allowedCapabilities = sceneMotionCapabilities[kind]
        if (element.motion_capabilities.some((capability) => typeof capability !== 'string' || !allowedCapabilities?.has(capability))) errors.push(`${path}.motion_capabilities contains an invalid capability`)
        if (new Set(element.motion_capabilities).size !== element.motion_capabilities.length) errors.push(`${path}.motion_capabilities must contain unique values`)
      }
      if (!Array.isArray(element.bbox) || element.bbox.length !== 4) {
        errors.push(`invalid bbox: ${id}`)
        continue
      }
      const [x, y, width, height] = element.bbox
      if ([x, y, width, height].some((value) => typeof value !== 'number' || !Number.isFinite(value)) || width <= 0 || height <= 0) {
        errors.push(`invalid bbox: ${id}`)
      } else if (x < 0 || y < 0 || x + width > manifest.width || y + height > manifest.height) {
        errors.push(`bbox outside scene: ${id}`)
      }
    }
  }
  if (!isRecord(manifest.quality)) {
    errors.push('quality must be an object')
  } else {
    if (typeof manifest.quality.score !== 'number' || !Number.isFinite(manifest.quality.score) || manifest.quality.score < 0 || manifest.quality.score > 1) errors.push('quality.score must be a number between 0 and 1')
    errors.push(...validateStringArray(manifest.quality.warnings, 'quality.warnings'))
  }
  return errors
}

function validateStringArray(value: unknown, path: string, nonEmpty = false) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || (nonEmpty && !item))) return [`${path} must be an array of ${nonEmpty ? 'non-empty ' : ''}strings`]
  return new Set(value).size === value.length ? [] : [`${path} must contain unique values`]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectCandidates(props: Record<string, unknown>) {
  const candidates: Candidate[] = []
  const visit = (value: unknown, path: Array<string | number>) => {
    if (!path.length || path.some((part) => String(part).startsWith('__'))) return
    const key = String(path[path.length - 1])
    if (isChartKey(key) && value && typeof value === 'object') {
      candidates.push({ id: motionId(path), kind: 'chart', value: value as unknown[] | Record<string, unknown> })
      return
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const kind = classify(path, value)
      if (kind && String(value).trim()) candidates.push({ id: motionId(path), kind, value })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]))
      return
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, [...path, childKey]))
    }
  }
  Object.entries(props).forEach(([key, value]) => visit(value, [key]))
  return candidates
}

function matchCandidates(root: HTMLElement, candidates: Candidate[]) {
  const claimed = new Set<HTMLElement>()
  const textElements = Array.from(root.querySelectorAll<HTMLElement>(textSelector))
  const chartElements = Array.from(root.querySelectorAll<HTMLElement>(chartSelector))
  const mediaElements = Array.from(root.querySelectorAll<HTMLElement>('img,video'))
  const matches: Array<{ candidate: Candidate; target: HTMLElement }> = []
  for (const candidate of candidates) {
    const pool = candidate.kind === 'chart' ? chartElements : candidate.kind === 'image' ? mediaElements : textElements
    const target = pool.find((element) => !claimed.has(element) && candidateMatches(candidate, element))
    if (!target) continue
    claimed.add(target)
    matches.push({ candidate, target })
  }
  return matches
}

function candidateMatches(candidate: Candidate, element: HTMLElement) {
  if (candidate.kind === 'chart') return true
  if (candidate.kind === 'image') {
    const source = element instanceof HTMLImageElement
      ? element.currentSrc || element.src
      : element instanceof HTMLVideoElement
        ? element.currentSrc || element.src || element.poster
        : ''
    const expected = String(candidate.value).replace(/\\/g, '/')
    const normalizedSource = source.replace(/\\/g, '/')
    return Boolean(source) && (normalizedSource.endsWith(expected) || normalizedSource.includes(expected))
  }
  return normalizeText(element.textContent || '') === normalizeText(String(candidate.value))
}

function classify(path: Array<string | number>, value: string | number): SceneElementKind | undefined {
  const key = path.map(String).join('.').toLowerCase()
  if (isMediaValue(String(value)) || /image|photo|logo|avatar|poster|cover/.test(key)) return 'image'
  if (/title|headline|heading/.test(key)) return 'title'
  if (typeof value === 'number' || /number|metric|stat|amount|percent|value/.test(key)) return 'number'
  if (/text|body|copy|description|subtitle|caption|label|point|item|name/.test(key)) return 'body'
  return undefined
}

function motionId(path: Array<string | number>) {
  return path.map((part) => String(part).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean).join('--')
}

function isChartKey(key: string) {
  return /chart|series|dataset/i.test(key)
}

function isMediaValue(value: string) {
  return /^(?:data:image\/|data:video\/|https?:\/\/|\/files\/|assets\/)/i.test(value) || /\.(?:png|jpe?g|webp|gif|svg|mp4|webm)(?:\?|$)/i.test(value)
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function roleFor(kind: SceneElementKind): SceneManifestElement['role'] {
  if (kind === 'title') return 'headline'
  if (kind === 'body') return 'supporting'
  if (kind === 'image') return 'visual'
  return 'evidence'
}

function capabilitiesFor(kind: SceneElementKind) {
  if (kind === 'image') return ['reveal', 'scale', 'pan']
  if (kind === 'chart') return ['reveal', 'highlight', 'scale', 'pan']
  if (kind === 'number') return ['reveal', 'highlight', 'count']
  return ['reveal', 'highlight']
}

function cleanFont(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function isVisibleColor(value: string) {
  return Boolean(value) && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent'
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
