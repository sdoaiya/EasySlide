import { toPng } from 'html-to-image'
import { PDFDocument } from 'pdf-lib'

type NativeDeckPdfOptions = {
  title: string
  root?: ParentNode
}

const WIDTH = 1920
const HEIGHT = 1080
const PDF_WIDTH = 960
const PDF_HEIGHT = 540

export async function exportNativeDeckPdf({ title, root = document }: NativeDeckPdfOptions) {
  const slides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (!slides.length) throw new Error('没有可导出的原生页面')

  await document.fonts?.ready
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)

  for (const slide of slides) {
    const dataUrl = await toPng(slide, {
      width: WIDTH,
      height: HEIGHT,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      pixelRatio: 1,
      cacheBust: true,
    })
    const image = await pdf.embedPng(dataUrlBytes(dataUrl))
    pdf.addPage([PDF_WIDTH, PDF_HEIGHT]).drawImage(image, {
      x: 0,
      y: 0,
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
    })
  }

  const bytes = await pdf.save()
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: 'application/pdf' })
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',', 2)[1]
  if (!base64) throw new Error('页面 PNG 编码无效')
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
