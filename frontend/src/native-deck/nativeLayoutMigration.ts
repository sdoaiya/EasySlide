import type { NativeLayoutContract, NativePropShape } from '@/components/native-deck/NativeDeckPropertyPanel'

type Entry = { key: string; shape: NativePropShape; value: unknown }

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

  const unmapped = Object.fromEntries(sourceEntries.filter((entry) => !consumed.has(entry.key)).map((entry) => [entry.key, entry.value]))
  if (Object.keys(unmapped).length) result.__unmapped_content = unmapped
  if (sourceProps.__media_prompts && typeof sourceProps.__media_prompts === 'object') {
    result.__media_prompts = structuredClone(sourceProps.__media_prompts)
  }
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
