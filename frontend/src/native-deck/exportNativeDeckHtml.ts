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
    const animation = slides[index]?.props.__animation && typeof slides[index].props.__animation === 'object'
      ? slides[index].props.__animation as Record<string, unknown>
      : {}
    const easing = ['linear', 'ease', 'ease-out', 'ease-in-out'].includes(String(animation.elementEasing))
      ? String(animation.elementEasing)
      : 'ease'
    clone.style.setProperty('--native-element-easing', easing)
    const mappedElementEnter = typeof animation.elementEnter === 'string'
      ? animation.elementEnter
      : mapPageEnterToElementEnter(animation.enter)
    if (mappedElementEnter) {
      clone.dataset.nativeAnimation = JSON.stringify({ ...animation, elementEnter: mappedElementEnter })
    }
    clone.className = `slide${index === 0 ? ' active' : ''}`
    clone.dataset.pageIndex = String(index)
    clone.dataset.nativeInternal = animation.internal === false ? '0' : '1'
    return clone.outerHTML
  }).join('\n') + `<script>(()=>{addEventListener('DOMContentLoaded',()=>{const deck=document.getElementById('deck');if(!deck)return;let timer;const schedule=()=>{clearTimeout(timer);const active=deck.querySelector('.slide.active');const seconds=Number(active?.dataset.nativeAdvanceAfter||0);if(!active||seconds<=0||active===deck.lastElementChild)return;if(active.dataset.elementTrigger==='click'&&Number(active.dataset.elementStep||0)<1)return;timer=setTimeout(()=>{if(active===deck.querySelector('.slide.active'))document.getElementById('next')?.click()},seconds*1000)};new MutationObserver(schedule).observe(deck,{attributes:true,subtree:true,attributeFilter:['class','data-element-step']});schedule()})})()</script>`
  const data = JSON.stringify(slides).replace(/[<>&]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' })[character]!)

  return new Blob([`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${nativeDeckCss}
.slide[data-native-internal="0"] *{animation:none!important}
html,body{height:100%;margin:0;background:#111827;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}body{display:grid;grid-template-rows:1fr 52px;overflow:hidden}#deck{display:grid;place-items:center;min-height:0;overflow:hidden}.slide{display:none;position:relative;width:1920px;height:1080px;overflow:hidden;transform-origin:center}.slide.active{display:block}nav{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:16px;color:#fff;background:#17202b}button{min-width:88px;height:36px;border:1px solid #52606d;border-radius:6px;color:#fff;background:#263442;cursor:pointer}button:disabled{opacity:.45;cursor:default}@media(max-aspect-ratio:16/9){.slide{transform:scale(calc((100vw - 24px)/1920))}}@media(min-aspect-ratio:16/9){.slide{transform:scale(calc((100vh - 76px)/1080))}}
</style></head><body><main id="deck">${renderedPages}</main><nav aria-label="页面导航"><button id="prev" type="button">上一页</button><span id="counter"></span><button id="next" type="button">下一页</button></nav>
  <script id="deck-data" type="application/json">${data}</script><script>(()=>{const pages=[...document.querySelectorAll('#deck>.slide')],counter=document.getElementById('counter'),prev=document.getElementById('prev'),next=document.getElementById('next');let current=0;function mapPageEnter(value){if(value==='fade'||value==='stagger-fade')return'fade';if(value==='slide-up'||value==='stagger-up')return'slide-up';if(value==='slide-left')return'slide-left';if(value==='zoom-in')return'zoom-in';return''}function number(value,fallback,min,max){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback}function syncElementMotion(page){let animation={};try{animation=JSON.parse(page.dataset.nativeAnimation||'{}')}catch{}const enter=typeof animation.elementEnter==='string'?animation.elementEnter:mapPageEnter(animation.enter);if(!enter||enter==='none'){page.removeAttribute('data-element-animation');page.removeAttribute('data-element-trigger');page.removeAttribute('data-element-step');return}page.dataset.elementAnimation=enter;page.dataset.elementTrigger=animation.elementTrigger==='click'?'click':'auto';page.dataset.elementStep=page.dataset.elementTrigger==='click'?'0':'6';page.style.setProperty('--native-element-duration',number(animation.elementDuration,360,80,2000)+'ms');page.style.setProperty('--native-element-delay',number(animation.elementDelay,0,0,5000)+'ms');page.style.setProperty('--native-element-stagger',number(animation.elementStagger,70,0,1000)+'ms')}function advanceElement(page){if(page.dataset.elementTrigger!=='click')return false;if(Number(page.dataset.elementStep||0)>=6)return false;page.dataset.elementStep='6';return true}function playTransition(page,initial){page.classList.remove('native-page-transition-fade','native-page-transition-push','native-page-transition-wipe','native-page-transition-split','native-page-transition-cover','native-page-transition-uncover','native-page-transition-zoom','native-page-transition-dissolve','native-page-transition-slow','native-page-transition-med','native-page-transition-fast','native-page-transition-dir-l','native-page-transition-dir-r','native-page-transition-dir-u','native-page-transition-dir-d');if(initial)return;const transition=page.dataset.nativeTransition;if(!transition||transition==='none'||transition==='cut')return;const speed=page.dataset.nativeTransitionSpeed==='slow'?'slow':page.dataset.nativeTransitionSpeed==='fast'?'fast':'med';const direction=page.dataset.nativeTransitionDirection&&page.dataset.nativeTransitionDirection!=='default'?page.dataset.nativeTransitionDirection:(transition==='wipe'||transition==='uncover'?'r':'l');void page.offsetWidth;page.classList.add('native-page-transition-'+transition,'native-page-transition-'+speed,'native-page-transition-dir-'+direction)}function show(index){const nextIndex=Math.max(0,Math.min(index,pages.length-1)),changed=nextIndex!==current;current=nextIndex;pages.forEach((page,i)=>{const active=i===current;page.classList.toggle('active',active);page.toggleAttribute('data-deck-active',active);if(active){syncElementMotion(page);playTransition(page,!changed)}});counter.textContent=(current+1)+' / '+pages.length;prev.disabled=current===0;next.disabled=current===pages.length-1}pages.forEach(page=>page.addEventListener('click',()=>advanceElement(page)));prev.onclick=()=>show(current-1);next.onclick=()=>show(current+1);addEventListener('keydown',event=>{if(event.key==='ArrowLeft')show(current-1);if(event.key==='ArrowRight'||event.key===' '){if(advanceElement(pages[current]))return;show(current+1)}});show(0)})()</script></body></html>`], { type: 'text/html;charset=utf-8' })
}

function mapPageEnterToElementEnter(value: unknown) {
  if (value === 'fade' || value === 'stagger-fade') return 'fade'
  if (value === 'slide-up' || value === 'stagger-up') return 'slide-up'
  if (value === 'slide-down') return 'slide-down'
  if (value === 'slide-left') return 'slide-left'
  if (value === 'slide-right') return 'slide-right'
  if (value === 'zoom-in') return 'zoom-in'
  if (value === 'blur-in') return 'fade'
  return undefined
}

function findProjectMedia(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('/files/') ? value : undefined
  if (Array.isArray(value)) return value.map(findProjectMedia).find(Boolean)
  if (value && typeof value === 'object') return Object.values(value).map(findProjectMedia).find(Boolean)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
