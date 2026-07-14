import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeImageSettings } from '@/types'
import type { NativeSlideSpec } from './types'

export type NativeMediaSlot = {
  id: string
  pageId: string
  key: string
  index?: number
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
          if (!mediaValue(values[index])) slots.push({ id: `${slide.pageId}:${slot.key}:${index}`, pageId: slide.pageId, key: slot.key, index })
        }
      } else if (target > 0 && !mediaValue(slide.props[slot.key])) {
        slots.push({ id: `${slide.pageId}:${slot.key}`, pageId: slide.pageId, key: slot.key })
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

export function buildNativeMediaPrompt(slide: NativeSlideSpec, settings: NativeImageSettings, slotPrompt = '') {
  const content = collectText(slide.props).slice(0, 8).join('；')
  const style = {
    theme: '视觉风格与当前 PPT 页面主题保持一致',
    photo: '写实摄影，真实光影和材质',
    '3d': '精致 3D 插画，主体清晰，背景简洁',
    flat: '现代扁平插画，色块清晰，构图简洁',
    tech: '科技概念视觉，具有未来感但不添加文字',
    custom: settings.custom_prompt,
  }[settings.style]
  return [`为 PPT 页面生成一张不含文字的主体配图。页面内容：${content || '通用主题'}`, style, settings.custom_prompt, slotPrompt]
    .filter(Boolean)
    .join('。')
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
