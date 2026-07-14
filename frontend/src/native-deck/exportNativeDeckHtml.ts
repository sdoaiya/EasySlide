import nativeDeckCss from './native-deck.css?raw'
import type { NativeSlideSpec } from './types'

type NativeDeckHtmlOptions = {
  title: string
  slides: NativeSlideSpec[]
  root?: ParentNode
}

export function exportNativeDeckHtml({ title, slides, root = document }: NativeDeckHtmlOptions) {
  const projectMedia = findProjectMedia(slides)
  if (projectMedia) throw new Error(`离线 HTML 无法包含项目素材路径：${projectMedia}。请先转换为 data URL。`)

  const pages = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (!pages.length) throw new Error('没有可导出的原生页面')
  const externalMedia = pages
    .flatMap((page) => Array.from(page.querySelectorAll<HTMLElement>('[src],[href]')))
    .map((element) => element.getAttribute('src') || element.getAttribute('href') || '')
    .find((value) => value && !value.startsWith('data:') && !value.startsWith('#'))
  if (externalMedia) throw new Error(`离线 HTML 无法包含外部资源：${externalMedia}。请先转换为 data URL。`)
  const externalCss = nativeDeckCss.match(/url\(\s*["']?((?!data:|#)[^)"']+)/i)?.[1]
  if (externalCss) throw new Error(`离线 HTML 无法包含外部样式资源：${externalCss}。请先转换为 data URL。`)

  const renderedPages = pages.map((page, index) => {
    const clone = page.cloneNode(true) as HTMLElement
    clone.removeAttribute('aria-hidden')
    clone.removeAttribute('style')
    clone.className = `slide${index === 0 ? ' active' : ''}`
    clone.dataset.pageIndex = String(index)
    return clone.outerHTML
  }).join('\n')
  const data = JSON.stringify(slides).replace(/[<>&]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' })[character]!)

  return new Blob([`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${nativeDeckCss}
html,body{height:100%;margin:0;background:#111827;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}body{display:grid;grid-template-rows:1fr 52px;overflow:hidden}#deck{display:grid;place-items:center;min-height:0;overflow:hidden}.slide{display:none;position:relative;width:1920px;height:1080px;overflow:hidden;transform-origin:center}.slide.active{display:block}nav{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:16px;color:#fff;background:#17202b}button{min-width:88px;height:36px;border:1px solid #52606d;border-radius:6px;color:#fff;background:#263442;cursor:pointer}button:disabled{opacity:.45;cursor:default}@media(max-aspect-ratio:16/9){.slide{transform:scale(calc((100vw - 24px)/1920))}}@media(min-aspect-ratio:16/9){.slide{transform:scale(calc((100vh - 76px)/1080))}}
</style></head><body><main id="deck">${renderedPages}</main><nav aria-label="页面导航"><button id="prev" type="button">上一页</button><span id="counter"></span><button id="next" type="button">下一页</button></nav>
<script id="deck-data" type="application/json">${data}</script><script>(()=>{const pages=[...document.querySelectorAll('#deck>.slide')],counter=document.getElementById('counter'),prev=document.getElementById('prev'),next=document.getElementById('next');let current=0;function show(index){current=Math.max(0,Math.min(index,pages.length-1));pages.forEach((page,i)=>page.classList.toggle('active',i===current));counter.textContent=(current+1)+' / '+pages.length;prev.disabled=current===0;next.disabled=current===pages.length-1}prev.onclick=()=>show(current-1);next.onclick=()=>show(current+1);addEventListener('keydown',event=>{if(event.key==='ArrowLeft')show(current-1);if(event.key==='ArrowRight'||event.key===' ')show(current+1)});show(0)})()</script></body></html>`], { type: 'text/html;charset=utf-8' })
}

function findProjectMedia(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('/files/') ? value : undefined
  if (Array.isArray(value)) return value.map(findProjectMedia).find(Boolean)
  if (value && typeof value === 'object') return Object.values(value).map(findProjectMedia).find(Boolean)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
