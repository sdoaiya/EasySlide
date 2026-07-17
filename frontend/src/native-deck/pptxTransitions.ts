import JSZip from 'jszip'

export type NativeTransition = 'cut' | 'fade' | 'push' | 'wipe' | 'split' | 'cover' | 'uncover' | 'zoom' | 'dissolve'
export type NativeTransitionSpeed = 'slow' | 'med' | 'fast'
export type NativeTransitionDirection = 'l' | 'r' | 'u' | 'd'
export type NativeElementAnimation = {
  enter?: string
  duration?: number
  delay?: number
  stagger?: number
  easing?: string
  trigger?: 'auto' | 'click'
}

export async function assertNativePptxPackage(blob: Blob) {
  const zip = await JSZip.loadAsync(blob)
  const required = ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']
  const missing = required.filter((name) => !zip.file(name))
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  if (missing.length || !slides.length) {
    throw new Error(`PPTX 包结构不完整${missing.length ? `：缺少 ${missing.join('、')}` : ''}`)
  }
  for (const name of slides) {
    const xml = await zip.file(name)?.async('string')
    if (!xml?.includes('<p:sld')) throw new Error(`PPTX 页面结构无效：${name}`)
    if ((xml.match(/<p:transition\b/g) || []).length > 1) throw new Error(`PPTX 页面包含重复转场：${name}`)
    if (xml.includes('<p:timing')) {
      const shapeIds = new Set(extractNativeShapeIds(xml))
      const targets = Array.from(xml.matchAll(/<p:spTgt\s+spid="(\d+)"\s*\/?>(?:<\/p:spTgt>)?/g), (match) => match[1])
      const invalidTargets = targets.filter((target) => !shapeIds.has(target))
      if (invalidTargets.length) throw new Error(`PPTX 动画目标无效：${name} 中不存在形状 ${[...new Set(invalidTargets)].join('、')}`)
      if ((xml.match(/<p:timing\b/g) || []).length !== 1 || !xml.includes('<p:tnLst>')) {
        throw new Error(`PPTX 页面时间线结构无效：${name}`)
      }
    }
  }
}

export async function applyNativePptxTransitions(blob: Blob, transitions: Array<NativeTransition | string | undefined>, speeds: Array<NativeTransitionSpeed | string | undefined> = [], directions: Array<NativeTransitionDirection | string | undefined> = [], advances: number[] = [], elementAnimations: NativeElementAnimation[] = []) {
  if (!transitions.some((transition) => transition && transition !== 'none') && !advances.some((advance) => Number.isFinite(advance) && advance > 0) && !elementAnimations.some((animation) => animation?.enter && animation.enter !== 'none')) return blob
  const zip = await JSZip.loadAsync(blob)
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = normalizeTransition(transitions[index])
    const file = zip.file(`ppt/slides/slide${index + 1}.xml`)
    if (!file) continue
    const xml = await file.async('string')
    let next = xml
    const advanceAfter = advances[index]
    if (transition && !xml.includes('<p:transition')) {
      next = insertTransition(next, transition, normalizeSpeed(speeds[index]), normalizeDirection(directions[index]), advanceAfter)
    } else if (Number.isFinite(advanceAfter) && advanceAfter > 0) {
      next = xml.includes('<p:transition')
        ? updateTransitionAdvance(next, advanceAfter)
        : insertTransition(next, transition || 'cut', normalizeSpeed(speeds[index]), normalizeDirection(directions[index]), advanceAfter)
    }
    const elementAnimation = elementAnimations[index]
    if (elementAnimation?.enter && elementAnimation.enter !== 'none' && !next.includes('<p:timing')) {
      next = insertTiming(next, elementAnimation)
    }
    if (next !== xml) zip.file(file.name, next)
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

function insertTiming(xml: string, animation: NativeElementAnimation) {
  const shapeIds = extractNativeShapeIds(xml).slice(0, 60)
  if (!shapeIds.length) return xml
  const duration = Math.max(80, Math.min(2000, Math.round(Number(animation.duration) || 360)))
  const delay = Math.max(0, Math.min(5000, Math.round(Number(animation.delay) || 0)))
  const stagger = Math.max(0, Math.min(1000, Math.round(Number(animation.stagger) || 70)))
  const requestedFilter = animation.enter === 'wipe'
    ? 'wipe(right)'
      : animation.enter === 'zoom-in'
      ? 'box(in)'
      : animation.enter === 'rotate-in'
        ? 'wheel(1)'
      : animation.enter === 'slide-up'
        ? 'slide(fromBottom)'
        : animation.enter === 'slide-down'
          ? 'slide(fromTop)'
        : animation.enter === 'slide-left'
          ? 'slide(fromRight)'
          : animation.enter === 'slide-right'
            ? 'slide(fromLeft)'
        : 'fade'
  const filter = ['fade', 'wipe(right)', 'box(in)', 'wheel(1)', 'slide(fromBottom)', 'slide(fromRight)', 'slide(fromLeft)'].includes(requestedFilter) ? requestedFilter : 'fade'
  const clickTrigger = animation.trigger === 'click'
  const easing = timingEasingAttributes(animation.easing)
  const effects = shapeIds.map((shapeId, index) => {
    const id = 10 + index * 3
    const itemDelay = delay + index * stagger
    const condition = clickTrigger && index === 0 ? `<p:cond evt="onClick" delay="${itemDelay}"/>` : `<p:cond delay="${itemDelay}"/>`
    const nodeType = clickTrigger && index === 0 ? 'clickEffect' : 'withEffect'
    return `<p:par><p:cTn id="${id}" fill="hold"${easing} nodeType="${nodeType}"><p:stCondLst>${condition}</p:stCondLst><p:childTnLst><p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${id + 1}" dur="${duration}" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`
  }).join('')
  const timing = `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
  const extStart = xml.indexOf('<p:extLst')
  if (extStart >= 0) return `${xml.slice(0, extStart)}${timing}${xml.slice(extStart)}`
  return xml.replace('</p:sld>', `${timing}</p:sld>`)
}

function timingEasingAttributes(value: string | undefined) {
  const attributes = {
    linear: [0, 0],
    ease: [25000, 25000],
    'ease-in': [60000, 0],
    'ease-out': [0, 60000],
    'ease-in-out': [50000, 50000],
  }[value || 'ease'] || [25000, 25000]
  return ` accel="${attributes[0]}" decel="${attributes[1]}"`
}

function extractNativeShapeIds(xml: string) {
  const nonVisualParents = new Set(['nvSpPr', 'nvPicPr', 'nvGraphicFramePr', 'nvCxnSpPr', 'nvGrpSpPr'])
  try {
    if (typeof DOMParser !== 'undefined') {
      const document = new DOMParser().parseFromString(xml, 'application/xml')
      if (!document.querySelector('parsererror')) {
        const ids = Array.from(document.getElementsByTagNameNS('*', 'cNvPr'))
          .filter((node) => nonVisualParents.has(node.parentElement?.localName || ''))
          .map((node) => node.getAttribute('id') || '')
          .filter(Boolean)
        if (ids.length) return ids
      }
    }
  } catch { /* Fall back to the XML expression below. */ }
  return Array.from(xml.matchAll(/<p:(?:sp|pic|graphicFrame|cxn|grpSp)\b[\s\S]*?<p:cNvPr\b[^>]*\bid="(\d+)"/g), (match) => match[1])
}

function normalizeTransition(value: string | undefined): NativeTransition | undefined {
  if (value === 'cut' || value === 'fade' || value === 'push' || value === 'wipe' || value === 'split' || value === 'cover' || value === 'uncover' || value === 'zoom' || value === 'dissolve') return value
  return undefined
}

function normalizeSpeed(value: string | undefined): NativeTransitionSpeed {
  return value === 'slow' || value === 'fast' ? value : 'med'
}

function normalizeDirection(value: string | undefined): NativeTransitionDirection | undefined {
  return value === 'l' || value === 'r' || value === 'u' || value === 'd' ? value : undefined
}

function insertTransition(xml: string, transition: NativeTransition, speed: NativeTransitionSpeed, direction?: NativeTransitionDirection, advanceAfter = 0) {
  const resolvedDirection = direction || (transition === 'wipe' || transition === 'uncover' ? 'r' : 'l')
  const body = {
    cut: '<p:cut thruBlk="0"/>',
    fade: '<p:fade thruBlk="0"/>',
    push: `<p:push dir="${resolvedDirection}"/>`,
    wipe: `<p:wipe dir="${resolvedDirection}"/>`,
    split: `<p:split orient="${resolvedDirection === 'l' || resolvedDirection === 'r' ? 'vert' : 'horz'}" dir="out"/>`,
    cover: `<p:cover dir="${resolvedDirection}"/>`,
    uncover: `<p:uncover dir="${resolvedDirection}"/>`,
    zoom: '<p:zoom dir="in"/>',
    dissolve: '<p:dissolve/>',
  }[transition]
  const advance = Number.isFinite(advanceAfter) && advanceAfter > 0 ? ` advClick="0" advTm="${Math.round(advanceAfter * 1000)}"` : ' advClick="1"'
  const node = `<p:transition spd="${speed}"${advance}>${body}</p:transition>`
  const colorMapEnd = xml.indexOf('</p:clrMapOvr>')
  if (colorMapEnd >= 0) {
    const position = colorMapEnd + '</p:clrMapOvr>'.length
    return `${xml.slice(0, position)}${node}${xml.slice(position)}`
  }
  const timingStart = xml.indexOf('<p:timing')
  if (timingStart >= 0) return `${xml.slice(0, timingStart)}${node}${xml.slice(timingStart)}`
  return xml.replace('</p:sld>', `${node}</p:sld>`)
}

function updateTransitionAdvance(xml: string, advanceAfter: number) {
  const milliseconds = Math.round(advanceAfter * 1000)
  return xml.replace(/<p:transition\b([^>]*)>/, (_match, attributes: string) => {
    const withoutAdvance = attributes
      .replace(/\s+advClick="[^"]*"/g, '')
      .replace(/\s+advTm="[^"]*"/g, '')
    return `<p:transition${withoutAdvance} advClick="0" advTm="${milliseconds}">`
  })
}
