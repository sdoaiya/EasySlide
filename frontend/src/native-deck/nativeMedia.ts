import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeImageSettings } from '@/types'
import type { NativeSlideSpec } from './types'

export type NativeMediaSlot = {
  id: string
  pageId: string
  key: string
  index?: number
  aspectRatio?: string
  composition?: NativeImageSettings['composition']
}

export function collectNativeMediaSlots(
  slides: readonly NativeSlideSpec[],
  contracts: readonly NativeLayoutContract[],
  settings: NativeImageSettings,
) {
  const contractsByLayout = new Map(contracts.map((contract) => [contract.layout, contract]))
  const slots: NativeMediaSlot[] = []
  for (const slide of slides) {
    const contract = contractsByLayout.get(slide.layout)
    if (!contract) continue
    for (const slot of contract.mediaSlots) {
      const shape = contract.propShapes[slot.key]
      const max = Math.max(1, Number(slot.max ?? slot.maxCount ?? slot.defaultVisibleCount ?? slot.defaultCount ?? 1))
      const target = targetCount(slide, contract, settings, max)
      if (Array.isArray(shape)) {
        const values = Array.isArray(slide.props[slot.key]) ? slide.props[slot.key] as unknown[] : []
        for (let index = 0; index < target; index += 1) {
          if (!mediaValue(values[index])) slots.push(createNativeMediaSlot(slide, slot.key, index))
        }
      } else if (target > 0 && !mediaValue(slide.props[slot.key])) {
        slots.push(createNativeMediaSlot(slide, slot.key))
      }
    }
  }
  return slots
}

export function setNativeMediaValue(props: Record<string, unknown>, key: string, index: number | undefined, value: string) {
  if (index == null) return { ...props, [key]: value }
  const values = Array.isArray(props[key]) ? [...props[key] as unknown[]] : []
  while (values.length <= index) values.push('')
  values[index] = value
  return { ...props, [key]: values }
}

export function getNativeMediaValue(props: Record<string, unknown>, key: string, index?: number) {
  const value = index == null ? props[key] : Array.isArray(props[key]) ? props[key][index] : undefined
  return mediaValue(value)
}

export async function compressNativeMediaUpload(file: File) {
  if (!file.type.startsWith('image/') || file.type === 'image/png' || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 1920
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  }
}

export async function runNativeMediaQueue<T>(
  jobs: readonly T[],
  worker: (job: T) => Promise<void>,
  options: { concurrency?: number; isPaused?: () => boolean } = {},
) {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, jobs.length || 1))
  let cursor = 0
  const run = async () => {
    while (cursor < jobs.length && !options.isPaused?.()) {
      const job = jobs[cursor]
      cursor += 1
      await worker(job)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run))
}

export function buildNativeMediaPrompt(slide: NativeSlideSpec, settings: NativeImageSettings, slotPrompt = '', slot?: NativeMediaSlot) {
  const content = collectText(slide.props).slice(0, 8).join('；')
  const style = {
    theme: '视觉风格与当前 PPT 页面主题保持一致',
    photo: '写实摄影，真实光影和材质',
    '3d': '精致 3D 插画，主体清晰，背景简洁',
    flat: '现代扁平插画，色块清晰，构图简洁',
    tech: '科技概念视觉，具有未来感但不添加文字',
    custom: settings.custom_prompt,
  }[settings.style]
  const intent = slide.props.__design_intent && typeof slide.props.__design_intent === 'object'
    ? slide.props.__design_intent as Record<string, unknown>
    : {}
  const pagePlan = intent.page_plan && typeof intent.page_plan === 'object' ? intent.page_plan as Record<string, unknown> : {}
  const composition = settings.composition === 'auto' ? slot?.composition || 'center' : settings.composition
  const compositionText = {
    center: '主体居中，四周保留安全裁剪空间',
    'text-left': '主体放在画面右侧，左侧保留干净留白',
    'text-right': '主体放在画面左侧，右侧保留干净留白',
    'full-bleed': '画面铺满，主体清晰，边缘可安全裁剪',
    auto: '根据页面内容安排主体位置',
  }[composition]
  return [
    `为 PPT 页面生成一张不含文字的主体配图。页面内容：${content || '通用主题'}`,
    style,
    compositionText,
    slot?.aspectRatio ? `画面比例 ${slot.aspectRatio}` : '',
    pagePlan.media_direction ? `媒体角色：${String(pagePlan.media_direction)}` : '',
    typeof intent.media_strategy === 'string' ? intent.media_strategy : '',
    '不要生成文字、数字、Logo、水印、边框或无意义装饰',
    settings.custom_prompt,
    slotPrompt,
  ]
    .filter(Boolean)
    .join('。')
}

export function createNativeMediaSlot(slide: NativeSlideSpec, key: string, index?: number): NativeMediaSlot {
  const path = index == null ? key : `${key}[${index}]`
  const rule = MEDIA_LAYOUT_RULES[slide.layout]
  return {
    id: `${slide.pageId}:${path}`,
    pageId: slide.pageId,
    key,
    index,
    aspectRatio: rule?.aspectRatio,
    composition: rule?.composition || 'center',
  }
}

const MEDIA_LAYOUT_RULES: Record<string, { aspectRatio: string; composition: NativeImageSettings['composition'] }> = {
  core01_case: { aspectRatio: '4:5', composition: 'center' },
  core01_image_story: { aspectRatio: '4:3', composition: 'center' },
  core01_profile: { aspectRatio: '4:5', composition: 'center' },
}

function targetCount(slide: NativeSlideSpec, contract: NativeLayoutContract, settings: NativeImageSettings, max: number) {
  if (settings.density === 'rich') return max
  if (settings.density === 'custom') return Math.min(max, settings.custom_counts[slide.pageId] ?? 0)
  if (settings.density === 'sparse') {
    return (contract.roles || []).some((role) => ['cover', 'transition', 'image', 'case'].includes(role)) ? 1 : 0
  }
  return 1
}

function mediaValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) return String((value as { src?: unknown }).src || '')
  return ''
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('/files/') || value.startsWith('assets/') ? [] : [value]
  if (Array.isArray(value)) return value.flatMap(collectText)
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !key.startsWith('__')).flatMap(([, child]) => collectText(child))
  return []
}
