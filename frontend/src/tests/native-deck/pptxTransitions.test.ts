import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { describe, expect, it } from 'vitest'
import { applyNativePptxTransitions, assertNativePptxPackage } from '@/native-deck/pptxTransitions'

describe('applyNativePptxTransitions', () => {
  it('adds a standard transition to configured slide XML only', async () => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', '<p:sld><p:cSld/><p:clrMapOvr/></p:sld>')
    zip.file('ppt/slides/slide2.xml', '<p:sld><p:cSld/><p:clrMapOvr/></p:sld>')
    zip.file('ppt/slides/slide3.xml', '<p:sld><p:cSld/><p:clrMapOvr/></p:sld>')
    zip.file('ppt/slides/slide4.xml', '<p:sld><p:cSld/><p:clrMapOvr/></p:sld>')
    const blob = await zip.generateAsync({ type: 'blob' })
    const result = await applyNativePptxTransitions(blob, ['fade', 'none', 'cover', 'wipe'], ['slow', undefined, 'fast', undefined], ['r', undefined, 'u', undefined], [0, 0, 7.5, 0])
    const output = await JSZip.loadAsync(result)
    const slide1 = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(slide1).toContain('<p:transition spd="slow" advClick="1"><p:fade thruBlk="0"/></p:transition>')
    expect(slide1!.indexOf('</p:clrMapOvr>')).toBeLessThan(slide1!.indexOf('<p:transition'))
    expect(await output.file('ppt/slides/slide2.xml')?.async('string')).not.toContain('<p:transition')
    expect(await output.file('ppt/slides/slide3.xml')?.async('string')).toContain('<p:transition spd="fast" advClick="0" advTm="7500"><p:cover dir="u"/></p:transition>')
    expect(await output.file('ppt/slides/slide4.xml')?.async('string')).toContain('<p:transition spd="med" advClick="1"><p:wipe dir="r"/></p:transition>')
  })

  it('supports zoom and dissolve transitions in PPTX XML', async () => {
    const source = new JSZip()
    source.file('ppt/slides/slide1.xml', '<p:sld><p:clrMapOvr/></p:sld>')
    source.file('ppt/slides/slide2.xml', '<p:sld><p:clrMapOvr/></p:sld>')
    const result = await applyNativePptxTransitions(await source.generateAsync({ type: 'blob' }), ['zoom', 'dissolve'])
    const output = await JSZip.loadAsync(result)
    expect(await output.file('ppt/slides/slide1.xml')?.async('string')).toContain('<p:zoom dir="in"/>')
    expect(await output.file('ppt/slides/slide2.xml')?.async('string')).toContain('<p:dissolve/>')
  })

  it('keeps auto-advance timing even when the slide transition is disabled', async () => {
    const source = new JSZip()
    source.file('ppt/slides/slide1.xml', '<p:sld><p:clrMapOvr/></p:sld>')
    const result = await applyNativePptxTransitions(await source.generateAsync({ type: 'blob' }), ['none'], [], [], [4.25])
    const output = await JSZip.loadAsync(result)
    const xml = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(xml).toContain('<p:transition spd="med" advClick="0" advTm="4250">')
    expect(xml).toContain('<p:cut thruBlk="0"/>')
  })

  it('merges auto-advance into an existing transition instead of dropping it', async () => {
    const source = new JSZip()
    source.file('ppt/slides/slide1.xml', '<p:sld><p:clrMapOvr/><p:transition spd="slow"><p:fade thruBlk="0"/></p:transition></p:sld>')
    const result = await applyNativePptxTransitions(await source.generateAsync({ type: 'blob' }), ['fade'], [], [], [3.6])
    const output = await JSZip.loadAsync(result)
    const xml = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(xml).toContain('<p:transition spd="slow" advClick="0" advTm="3600">')
    expect(xml).toContain('<p:fade thruBlk="0"/>')
  })

  it('writes optional element entrance timing against real shape ids', async () => {
    const source = new JSZip()
    source.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="7" name="Title"/></p:nvSpPr></p:sp><p:pic><p:nvPicPr><p:cNvPr id="9" name="Image"/></p:nvPicPr></p:pic></p:spTree></p:cSld></p:sld>')
    const result = await applyNativePptxTransitions(await source.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'fade', duration: 500, delay: 220, stagger: 90, easing: 'ease-in-out' }])
    const output = await JSZip.loadAsync(result)
    const xml = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(xml).toContain('<p:timing>')
    expect(xml).toContain('<p:spTgt spid="7"/>')
    expect(xml).toContain('<p:spTgt spid="9"/>')
    expect(xml).toContain('dur="500"')
    expect(xml).toContain('delay="220"')
    expect(xml).toContain('delay="310"')
    expect(xml).toContain('accel="50000" decel="50000"')

    const motionSource = new JSZip()
    motionSource.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr name="Card" descr="" id="11"/></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sld>')
    const motionResult = await applyNativePptxTransitions(await motionSource.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'slide-up' }])
    const motionXml = await (await JSZip.loadAsync(motionResult)).file('ppt/slides/slide1.xml')?.async('string')
    expect(motionXml).toContain('filter="slide(fromBottom)"')

    const rightSource = new JSZip()
    rightSource.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="12"/></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sld>')
    const rightResult = await applyNativePptxTransitions(await rightSource.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'slide-right' }])
    const rightXml = await (await JSZip.loadAsync(rightResult)).file('ppt/slides/slide1.xml')?.async('string')
    expect(rightXml).toContain('filter="slide(fromLeft)"')

    const fallbackSource = new JSZip()
    fallbackSource.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="13" name="Fallback"/></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sld>')
    const fallbackResult = await applyNativePptxTransitions(await fallbackSource.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'unknown-effect' }])
    const fallbackXml = await (await JSZip.loadAsync(fallbackResult)).file('ppt/slides/slide1.xml')?.async('string')
    expect(fallbackXml).toContain('filter="fade"')

    const clickSource = new JSZip()
    clickSource.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="15"/></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="16"/></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sld>')
    const clickResult = await applyNativePptxTransitions(await clickSource.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'fade', trigger: 'click', delay: 120 }])
    const clickXml = await (await JSZip.loadAsync(clickResult)).file('ppt/slides/slide1.xml')?.async('string')
    expect(clickXml).toContain('nodeType="clickEffect"')
    expect(clickXml).toContain('evt="onClick"')
    expect((clickXml!.match(/nodeType="clickEffect"/g) || []).length).toBe(1)
    expect((clickXml!.match(/nodeType="withEffect"/g) || []).length).toBe(1)
    expect(clickXml).toContain('evt="onClick" delay="120"')
    expect(clickXml).toContain('delay="190"')
  })

  it('rejects an incomplete PPTX package after post-processing', async () => {
    const source = new JSZip()
    source.file('[Content_Types].xml', '<Types/>')
    await expect(assertNativePptxPackage(await source.generateAsync({ type: 'blob' }))).rejects.toThrow('PPTX 包结构不完整')
  })

  it('rejects animation targets that do not exist in the slide shape tree', async () => {
    const source = new JSZip()
    source.file('[Content_Types].xml', '<Types/>')
    source.file('ppt/presentation.xml', '<p:presentation/>')
    source.file('ppt/_rels/presentation.xml.rels', '<Relationships/>')
    source.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="7"/></p:nvSpPr></p:sp></p:spTree></p:cSld><p:timing><p:spTgt spid="99"/></p:timing></p:sld>')
    await expect(assertNativePptxPackage(await source.generateAsync({ type: 'blob' }))).rejects.toThrow('动画目标无效')
  })

  it('rejects duplicate transition and malformed timing nodes', async () => {
    const duplicate = new JSZip()
    duplicate.file('[Content_Types].xml', '<Types/>')
    duplicate.file('ppt/presentation.xml', '<p:presentation/>')
    duplicate.file('ppt/_rels/presentation.xml.rels', '<Relationships/>')
    duplicate.file('ppt/slides/slide1.xml', '<p:sld><p:transition/><p:transition/></p:sld>')
    await expect(assertNativePptxPackage(await duplicate.generateAsync({ type: 'blob' }))).rejects.toThrow('重复转场')

    const malformed = new JSZip()
    malformed.file('[Content_Types].xml', '<Types/>')
    malformed.file('ppt/presentation.xml', '<p:presentation/>')
    malformed.file('ppt/_rels/presentation.xml.rels', '<Relationships/>')
    malformed.file('ppt/slides/slide1.xml', '<p:sld><p:timing/></p:sld>')
    await expect(assertNativePptxPackage(await malformed.generateAsync({ type: 'blob' }))).rejects.toThrow('时间线结构无效')
  })

  it('targets group and child shapes in XML order', async () => {
    const source = new JSZip()
    source.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:grpSp><p:nvGrpSpPr><p:cNvPr id="20"/><p:cNvGrpSpPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="21"/></p:nvSpPr></p:sp></p:grpSp></p:spTree></p:cSld></p:sld>')
    const result = await applyNativePptxTransitions(await source.generateAsync({ type: 'blob' }), ['none'], [], [], [], [{ enter: 'fade' }])
    const output = await JSZip.loadAsync(result)
    const xml = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(xml).toContain('<p:spTgt spid="20"/>')
    expect(xml).toContain('<p:spTgt spid="21"/>')
  })

  it('keeps a real PptxGenJS package valid after animation post-processing', async () => {
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    const slide = pptx.addSlide()
    slide.addText('真实 PPTX 动效校验', { x: 1, y: 1, w: 5, h: 1, fontSize: 24 })
    const original = await pptx.write({ outputType: 'blob' }) as Blob
    const result = await applyNativePptxTransitions(original, ['fade'], [], [], [2.5], [{ enter: 'fade', duration: 400, easing: 'ease-out' }])
    await expect(assertNativePptxPackage(result)).resolves.toBeUndefined()
    const output = await JSZip.loadAsync(result)
    const xml = await output.file('ppt/slides/slide1.xml')?.async('string')
    expect(xml).toContain('<p:timing>')
    expect(xml).toContain('advTm="2500"')
  })
})
