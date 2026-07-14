import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const source = path.resolve(process.env.DASHIAI_PPT_ROOT || path.join(os.homedir(), '.codex', 'skills', 'dashiai-ppt', 'project'))
const runtimeSource = path.join(source, 'dist', 'theme-runtime')
const runtimeTarget = path.join(root, 'frontend', 'src', 'vendor', 'dashiai-ppt', 'theme-runtime')
const vendorTarget = path.join(root, 'frontend', 'src', 'vendor', 'dashiai-ppt')
const assetTarget = path.join(root, 'frontend', 'public', 'assets')
const manifestTarget = path.join(root, 'shared', 'native-deck', 'layout-manifest.json')

for (const required of [runtimeSource, path.join(source, 'assets'), path.join(source, 'src', 'components', 'themes')]) {
  if (!fs.existsSync(required)) throw new Error(`DashiAI PPT source is incomplete: ${required}`)
}

fs.mkdirSync(runtimeTarget, { recursive: true })
fs.mkdirSync(assetTarget, { recursive: true })
fs.cpSync(path.join(source, 'src', 'components', 'themes'), path.join(vendorTarget, 'source', 'themes'), { recursive: true, force: true })
fs.cpSync(path.join(source, 'assets'), assetTarget, { recursive: true, force: true })
for (const theme of fs.readdirSync(path.join(source, 'src', 'components', 'themes'), { withFileTypes: true })) {
  const privateAssets = path.join(source, 'src', 'components', 'themes', theme.name, 'source', 'assets')
  if (!theme.isDirectory() || !fs.existsSync(privateAssets)) continue
  for (const entry of fs.readdirSync(privateAssets)) {
    fs.cpSync(path.join(privateAssets, entry), path.join(assetTarget, entry), { recursive: true, force: true })
  }
}
fs.copyFileSync(path.join(source, 'layout-manifest.json'), path.join(vendorTarget, 'layout-manifest.source.json'))

const runtimePages = new Map()
for (let index = 1; index <= 12; index += 1) {
  const theme = `theme${String(index).padStart(2, '0')}`
  const filename = `${theme}.module.mjs`
  fs.copyFileSync(path.join(runtimeSource, filename), path.join(runtimeTarget, filename))
  const runtime = await import(`${pathToFileURL(path.join(runtimeTarget, filename)).href}?import=${Date.now()}`)
  for (const page of runtime.runtimePages) runtimePages.set(page.key, page)
}

const workflow = await import(pathToFileURL(path.join(source, 'scripts', 'skill-workflow-utils.mjs')).href)
const current = JSON.parse(fs.readFileSync(manifestTarget, 'utf8'))
const coreLayouts = current.layouts.filter((layout) => layout.theme === 'core01')
const dashiaiLayouts = []

for (const layout of Object.keys(JSON.parse(fs.readFileSync(path.join(source, 'layout-manifest.json'), 'utf8')).layouts)) {
  const inspected = workflow.inspectLayout(layout, { compact: false })
  const runtime = runtimePages.get(layout)
  if (!inspected || !runtime) throw new Error(`Cannot inspect DashiAI layout: ${layout}`)
  const mediaSlots = inspected.mediaSlots.map((slot) => ({
    ...slot,
    key: slot.key || String(slot.presetProp || slot.writableProp || slot.field || '').replace(/^props\./, '').split('.')[0],
    required: false,
  }))
  const propShapes = { ...inspected.propShapes }
  for (const slot of mediaSlots) {
    if (slot.key && !propShapes[slot.key]) propShapes[slot.key] = String(slot.valueShape || '').startsWith('Array') ? ['media'] : 'media'
  }
  const controls = inspected.controls.map((control) => {
    const runtimeControl = runtime.controls.find((item) => (item.publicKey || item.key) === (control.publicKey || control.key)) || {}
    const type = runtimeControl.type === 'slider' ? 'range' : runtimeControl.type || control.type
    return { ...runtimeControl, ...control, type, options: runtimeControl.options || control.options }
  })
  dashiaiLayouts.push({
    layout: inspected.layout,
    theme: inspected.theme,
    themeDisplayName: inspected.themeDisplayName,
    themeScenario: inspected.themeScenario,
    themeAudience: inspected.themeAudience,
    pageNumber: inspected.pageNumber,
    label: inspected.label,
    slot: inspected.slot,
    roles: inspected.roles,
    copyKeys: inspected.copyKeys,
    copyBudgets: inspected.copyBudgets,
    propShapes,
    arrayMeta: inspected.arrayMeta,
    fillPlan: inspected.fillPlan,
    mediaSlots,
    countBindings: inspected.countBindings,
    controls,
    defaultVisibleCounts: inspected.defaultVisibleCounts,
    defaultProps: runtime.defaultProps,
  })
}

const themes = [...new Map(dashiaiLayouts.map((layout) => [layout.theme, {
  key: layout.theme,
  label: layout.themeDisplayName,
  scenario: layout.themeScenario,
  audience: layout.themeAudience,
}])).values()]

fs.writeFileSync(manifestTarget, `${JSON.stringify({ schemaVersion: 2, themes, layouts: [...coreLayouts, ...dashiaiLayouts] }, null, 2)}\n`)
console.log(`Imported ${dashiaiLayouts.length} DashiAI layouts, ${runtimePages.size} runtime pages, and ${themes.length} themes`)
