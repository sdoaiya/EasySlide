import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'shared/native-deck/layout-manifest.json'), 'utf8'))
const allowedShapes = new Set(['string', 'string[]', 'number', 'boolean', 'media'])
const ids = new Set()

if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.layouts) || manifest.layouts.length < 1028) {
  throw new Error('Native layout manifest must contain schema version 2 and all DashiAI layouts')
}

for (const item of manifest.layouts) {
  if (!item.layout || ids.has(item.layout)) throw new Error(`Duplicate or missing layout: ${item.layout}`)
  ids.add(item.layout)
  if (!item.theme || !Array.isArray(item.roles)) throw new Error(`Invalid metadata: ${item.layout}`)
  if (!item.propShapes || !Array.isArray(item.copyKeys) || !Array.isArray(item.mediaSlots)) throw new Error(`Invalid contract: ${item.layout}`)
  for (const [key, shape] of Object.entries(item.propShapes)) validateShape(shape, `${item.layout}.${key}`)
  for (const key of item.copyKeys) {
    const rootKey = key.split(/[.[]/, 1)[0]
    if (!item.propShapes[rootKey]) throw new Error(`Unknown copy key ${item.layout}.${key}`)
  }
  for (const slot of item.mediaSlots) {
    if (!containsMedia(item.propShapes[slot.key])) throw new Error(`Invalid media slot ${item.layout}.${slot.key}`)
  }
}

const dashiai = manifest.layouts.filter((item) => /^theme(?:0[1-9]|1[0-2])$/.test(item.theme))
if (dashiai.length !== 1020 || new Set(dashiai.map((item) => item.theme)).size !== 12) {
  throw new Error('Native layout manifest must contain 1020 layouts across 12 DashiAI themes')
}

console.log(`Validated ${ids.size} native layouts`)

function validateShape(shape, path) {
  if (typeof shape === 'string') {
    if (!allowedShapes.has(shape)) throw new Error(`Invalid shape ${shape} for ${path}`)
    return
  }
  if (Array.isArray(shape)) {
    if (!shape.length) throw new Error(`Array shape cannot be empty for ${path}`)
    shape.forEach((item, index) => validateShape(item, `${path}[${index}]`))
    return
  }
  if (shape && typeof shape === 'object') {
    for (const [key, value] of Object.entries(shape)) validateShape(value, `${path}.${key}`)
    return
  }
  throw new Error(`Invalid shape for ${path}`)
}

function containsMedia(shape) {
  if (shape === 'media') return true
  if (Array.isArray(shape)) return shape.some(containsMedia)
  if (shape && typeof shape === 'object') return Object.values(shape).some(containsMedia)
  return false
}
