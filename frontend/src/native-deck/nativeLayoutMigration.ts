import type { NativeLayoutContract, NativePropShape } from '@/components/native-deck/NativeDeckPropertyPanel'

type Entry = { key: string; shape: NativePropShape; value: unknown }
type LeafEntry = { key: string; path: string[]; shape: NativePropShape; value: unknown }

const pageEnterEffects = new Set(['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'blur-in', 'stagger-up', 'stagger-fade'])
const elementEnterEffects = new Set(['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'blur-in', 'wipe', 'rotate-in'])
const transitionEffects = new Set(['cut', 'fade', 'push', 'wipe', 'split', 'cover', 'uncover', 'zoom', 'dissolve'])
const transitionSpeeds = new Set(['slow', 'med', 'fast'])
const transitionDirections = new Set(['default', 'l', 'r', 'u', 'd'])
const easingValues = new Set(['linear', 'ease', 'ease-out', 'ease-in-out'])

export function selectThemeLayout(current: NativeLayoutContract, candidates: readonly NativeLayoutContract[]) {
  return [...candidates].sort((left, right) => scoreLayout(current, right) - scoreLayout(current, left))[0]
}

export function migrateNativeProps(
  source: NativeLayoutContract,
  target: NativeLayoutContract,
  sourceProps: Record<string, unknown>,
) {
  const controlKeys = new Set((target.controls || []).map((control) => control.publicKey || control.key))
  const result = structuredClone(target.defaultProps || {})
  const targetEntries = Object.entries(target.propShapes)
    .filter(([key]) => !controlKeys.has(key))
    .map(([key, shape]) => ({ key, shape, value: blankValue(shape) }))

  for (const entry of targetEntries) result[entry.key] = entry.value

  const sourceEntries = collectSourceEntries(source, sourceProps)
  const consumed = new Set<string>()

  for (const targetEntry of targetEntries) {
    const exact = sourceEntries.find((entry) => entry.key === targetEntry.key && compatible(entry.shape, targetEntry.shape, entry.value))
    if (!exact) continue
    result[targetEntry.key] = structuredClone(exact.value)
    consumed.add(exact.key)
  }

  for (const targetEntry of targetEntries) {
    if (!isBlank(result[targetEntry.key])) continue
    const family = keyFamily(targetEntry.key, targetEntry.shape)
    const candidate = sourceEntries.find((entry) => (
      !consumed.has(entry.key)
      && compatible(entry.shape, targetEntry.shape, entry.value)
      && keyFamily(entry.key, entry.shape) === family
    )) || sourceEntries.find((entry) => !consumed.has(entry.key) && compatible(entry.shape, targetEntry.shape, entry.value))
    if (!candidate) continue
    result[targetEntry.key] = structuredClone(candidate.value)
    consumed.add(candidate.key)
  }

  migrateNestedLeaves(result, source, target, sourceProps)

  const unmapped = Object.fromEntries(sourceEntries.filter((entry) => !consumed.has(entry.key)).map((entry) => [entry.key, entry.value]))
  if (Object.keys(unmapped).length) result.__unmapped_content = unmapped
  if (sourceProps.__media_prompts && typeof sourceProps.__media_prompts === 'object') {
    result.__media_prompts = structuredClone(sourceProps.__media_prompts)
  }
  if (sourceProps.__design_intent && typeof sourceProps.__design_intent === 'object') {
    result.__design_intent = structuredClone(sourceProps.__design_intent)
  }
  const animation = sanitizeNativeAnimation(sourceProps.__animation)
  if (animation) result.__animation = animation
  return result
}

function scoreLayout(current: NativeLayoutContract, candidate: NativeLayoutContract) {
  const currentRoles = new Set(current.roles || [])
  const roleOverlap = (candidate.roles || []).filter((role) => currentRoles.has(role)).length
  const currentKeys = new Set(topLevelCopyKeys(current))
  const copyOverlap = topLevelCopyKeys(candidate).filter((key) => currentKeys.has(key)).length
  const currentKinds = Object.values(current.propShapes).map(shapeKind)
  const kindOverlap = Object.values(candidate.propShapes).filter((shape) => currentKinds.includes(shapeKind(shape))).length
  return roleOverlap * 10_000 + copyOverlap * 100 + kindOverlap
}

function migrateNestedLeaves(
  result: Record<string, unknown>,
  source: NativeLayoutContract,
  target: NativeLayoutContract,
  sourceProps: Record<string, unknown>,
) {
  const sourceLeaves = collectLeafEntries(source.propShapes, sourceProps)
  const targetLeaves = collectTargetLeafEntries(target.propShapes, target.defaultProps || {})
  const consumed = new Set<number>()
  for (const targetLeaf of targetLeaves) {
    if (!isBlank(readPath(result, targetLeaf.path))) continue
    const family = keyFamily(targetLeaf.key, targetLeaf.shape)
    const sourceIndex = sourceLeaves.findIndex((leaf, index) => (
      !consumed.has(index)
      && compatibleShape(leaf.shape, targetLeaf.shape)
      && keyFamily(leaf.key, leaf.shape) === family
    ))
    const fallbackIndex = sourceIndex >= 0 ? sourceIndex : sourceLeaves.findIndex((leaf, index) => (
      !consumed.has(index)
      && compatibleShape(leaf.shape, targetLeaf.shape)
    ))
    if (fallbackIndex < 0) continue
    writePath(result, targetLeaf.path, structuredClone(sourceLeaves[fallbackIndex].value))
    consumed.add(fallbackIndex)
  }
}

function collectLeafEntries(shapes: Record<string, NativePropShape>, props: Record<string, unknown>) {
  const entries: LeafEntry[] = []
  for (const [key, shape] of Object.entries(shapes)) {
    collectLeafValue(entries, [key], key, shape, props[key])
  }
  return entries.filter((entry) => !isBlank(entry.value))
}

function collectTargetLeafEntries(shapes: Record<string, NativePropShape>, defaults: Record<string, unknown>) {
  const entries: LeafEntry[] = []
  for (const [key, shape] of Object.entries(shapes)) {
    if (shape === 'string[]' || Array.isArray(shape)) continue
    collectTargetLeafValue(entries, [key], key, shape, defaults[key])
  }
  return entries
}

function collectLeafValue(entries: LeafEntry[], path: string[], key: string, shape: NativePropShape, value: unknown) {
  if (shape === 'string' || shape === 'media' || shape === 'number' || shape === 'boolean') {
    entries.push({ key, path, shape, value })
    return
  }
  if (shape === 'string[]') {
    if (Array.isArray(value)) value.forEach((item, index) => entries.push({ key, path: [...path, String(index)], shape: 'string', value: item }))
    return
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return
    const itemShape = shape[0]
    value.forEach((item, index) => collectLeafValue(entries, [...path, String(index)], key, itemShape, item))
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  for (const [childKey, childShape] of Object.entries(shape)) {
    collectLeafValue(entries, [...path, childKey], childKey, childShape, (value as Record<string, unknown>)[childKey])
  }
}

function collectTargetLeafValue(entries: LeafEntry[], path: string[], key: string, shape: NativePropShape, defaultValue: unknown) {
  if (shape === 'string' || shape === 'media' || shape === 'number' || shape === 'boolean') {
    entries.push({ key, path, shape, value: undefined })
    return
  }
  if (shape === 'string[]') {
    const count = Array.isArray(defaultValue) && defaultValue.length ? defaultValue.length : 1
    for (let index = 0; index < count; index += 1) entries.push({ key, path: [...path, String(index)], shape: 'string', value: undefined })
    return
  }
  if (Array.isArray(shape)) {
    const itemShape = shape[0]
    const count = Array.isArray(defaultValue) && defaultValue.length ? defaultValue.length : 1
    for (let index = 0; index < count; index += 1) {
      collectTargetLeafValue(entries, [...path, String(index)], key, itemShape, Array.isArray(defaultValue) ? defaultValue[index] : undefined)
    }
    return
  }
  const defaultObject = defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue) ? defaultValue as Record<string, unknown> : {}
  for (const [childKey, childShape] of Object.entries(shape)) {
    collectTargetLeafValue(entries, [...path, childKey], childKey, childShape, defaultObject[childKey])
  }
}

function topLevelCopyKeys(contract: NativeLayoutContract) {
  return contract.copyKeys.map((key) => key.split(/[.[]/, 1)[0]).filter(Boolean)
}

function collectSourceEntries(contract: NativeLayoutContract, props: Record<string, unknown>) {
  const controlKeys = new Set((contract.controls || []).map((control) => control.publicKey || control.key))
  const entries: Entry[] = Object.entries(contract.propShapes)
    .filter(([key]) => !controlKeys.has(key) && !isBlank(props[key]))
    .map(([key, shape]) => ({ key, shape, value: props[key] }))
  const previous = props.__unmapped_content
  if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
    for (const [key, value] of Object.entries(previous)) {
      if (!entries.some((entry) => entry.key === key) && !isBlank(value)) entries.push({ key, shape: inferShape(value), value })
    }
  }
  return entries
}

function compatible(source: NativePropShape, target: NativePropShape, value: unknown) {
  if (isBlank(value)) return false
  const left: NativePropShape = source === 'string[]' ? ['string'] : source
  const right: NativePropShape = target === 'string[]' ? ['string'] : target
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((shape, index) => compatibleShape(shape, right[index]))
  }
  return compatibleShape(left, right)
}

function compatibleShape(source: NativePropShape, target: NativePropShape): boolean {
  if (typeof source === 'string' || typeof target === 'string') return source === target
  if (Array.isArray(source) || Array.isArray(target)) {
    return Array.isArray(source)
      && Array.isArray(target)
      && source.length === target.length
      && source.every((shape, index) => compatibleShape(shape, target[index]))
  }
  const sourceKeys = Object.keys(source)
  const targetKeys = Object.keys(target)
  return sourceKeys.length === targetKeys.length
    && sourceKeys.every((key) => key in target && compatibleShape(source[key], target[key]))
}

function shapeKind(shape: NativePropShape) {
  if (shape === 'string' || shape === 'media') return shape
  if (shape === 'number' || shape === 'boolean') return shape
  if (shape === 'string[]' || Array.isArray(shape)) return 'array'
  return 'object'
}

function keyFamily(key: string, shape: NativePropShape) {
  if (shapeKind(shape) === 'media') return 'media'
  if (/title|headline|heading|name/i.test(key)) return 'title'
  if (/summary|subtitle|description|body|lead|intro|copy|text|content/i.test(key)) return 'body'
  if (/^k$|key|label|tag|axis/i.test(key)) return 'label'
  if (/^v$|value|amount|metric|number/i.test(key)) return 'value'
  return shapeKind(shape)
}

function blankValue(shape: NativePropShape): unknown {
  if (shape === 'string' || shape === 'media') return ''
  if (shape === 'number') return 0
  if (shape === 'boolean') return false
  if (shape === 'string[]' || Array.isArray(shape)) return []
  return {}
}

function inferShape(value: unknown): NativePropShape {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return [inferShape(value.find((item) => !isBlank(item)))]
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inferShape(child)]))
  if (typeof value === 'string' && (/^\/files\//.test(value) || /^data:image\//.test(value))) return 'media'
  return 'string'
}

function isBlank(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function readPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value
  for (const segment of path) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[segment]
    else return undefined
  }
  return current
}

function writePath(value: Record<string, unknown>, path: string[], nextValue: unknown) {
  let current: unknown = value
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const nextSegment = path[index + 1]
    if (Array.isArray(current)) {
      const itemIndex = Number(segment)
      current[itemIndex] ??= /^\d+$/.test(nextSegment) ? [] : {}
      current = current[itemIndex]
    } else if (current && typeof current === 'object') {
      const object = current as Record<string, unknown>
      object[segment] ??= /^\d+$/.test(nextSegment) ? [] : {}
      current = object[segment]
    } else {
      return
    }
  }
  const last = path[path.length - 1]
  if (Array.isArray(current)) current[Number(last)] = nextValue
  else if (current && typeof current === 'object') (current as Record<string, unknown>)[last] = nextValue
}

function sanitizeNativeAnimation(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  assignSetValue(result, source, 'enter', pageEnterEffects)
  assignSetValue(result, source, 'elementEnter', elementEnterEffects)
  assignSetValue(result, source, 'elementTrigger', new Set(['auto', 'click']))
  assignSetValue(result, source, 'transition', transitionEffects)
  assignSetValue(result, source, 'transitionSpeed', transitionSpeeds)
  assignSetValue(result, source, 'transitionDirection', transitionDirections)
  assignSetValue(result, source, 'easing', easingValues)
  assignSetValue(result, source, 'elementEasing', easingValues)
  assignNumberValue(result, source, 'duration', 120, 2000)
  assignNumberValue(result, source, 'delay', 0, 1500)
  assignNumberValue(result, source, 'elementDuration', 80, 2000)
  assignNumberValue(result, source, 'elementDelay', 0, 5000)
  assignNumberValue(result, source, 'elementStagger', 0, 1000)
  assignNumberValue(result, source, 'advanceAfter', 0, 60)
  if (typeof source.internal === 'boolean') result.internal = source.internal
  return Object.keys(result).length ? result : undefined
}

function assignSetValue(result: Record<string, unknown>, source: Record<string, unknown>, key: string, allowed: Set<string>) {
  const value = source[key]
  if (typeof value === 'string' && allowed.has(value)) result[key] = value
}

function assignNumberValue(result: Record<string, unknown>, source: Record<string, unknown>, key: string, min: number, max: number) {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value))
}
