import { toPng } from 'html-to-image'
import { waitForNativeLayouts } from './exportNativeDeck'

const WIDTH = 1920
const HEIGHT = 1080

export async function captureNativeDeckFrames(root: ParentNode = document) {
  await waitForNativeLayouts(root)
  await document.fonts?.ready
  const slides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (!slides.length) throw new Error('没有可导出的视频页面')

  const frames: Blob[] = []
  for (const slide of slides) {
    const dataUrl = await toPng(slide, {
      width: WIDTH,
      height: HEIGHT,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      pixelRatio: 1,
      cacheBust: true,
    })
    frames.push(dataUrlBlob(dataUrl))
  }
  return frames
}

function dataUrlBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',', 2)
  if (!base64) throw new Error('页面 PNG 编码无效')
  const type = /data:([^;]+)/.exec(header)?.[1] || 'image/png'
  const binary = atob(base64)
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type })
}
