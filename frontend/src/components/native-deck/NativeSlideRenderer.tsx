import { Component, memo, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type Ref } from 'react'
import { layoutRegistry } from '@/native-deck/layoutRegistry'
import { isDashiLayout, loadDashiRuntimePage, pruneDashiProps, type DashiRuntimePage } from '@/native-deck/dashiThemeRuntime'
import { disposeDashiRuntime, prepareDashiRuntime, resolveDashiAssetProps } from '@/native-deck/dashiRuntimeEffects'
import type { NativeSlideSpec } from '@/native-deck/types'
import '@/native-deck/native-deck.css'

export interface NativeSlideRendererProps {
  slide: NativeSlideSpec
  initializeEffects?: boolean
  animate?: boolean
  elementAnimationActive?: boolean
  elementAnimationStep?: number
}

type NativeAnimationConfig = {
  enter?: string
  duration?: number
  delay?: number
  easing?: string
  replay?: number
  internal?: boolean
  elementEnter?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'blur-in' | 'wipe' | 'rotate-in'
  elementDuration?: number
  elementDelay?: number
  elementStagger?: number
  elementEasing?: string
  elementTrigger?: 'auto' | 'click'
}

export const NativeSlideRenderer = memo(function NativeSlideRenderer({ slide, initializeEffects = true, animate = true, elementAnimationActive = true, elementAnimationStep = 1 }: NativeSlideRendererProps) {
  return (
    <NativeSlideErrorBoundary key={slide.layout} layout={slide.layout} resetKey={slide.props}>
      <NativeSlideContent slide={slide} initializeEffects={initializeEffects} animate={animate} elementAnimationActive={elementAnimationActive} elementAnimationStep={elementAnimationStep} />
    </NativeSlideErrorBoundary>
  )
})

function NativeSlideContent({ slide, initializeEffects = true, animate = true, elementAnimationActive = true, elementAnimationStep = 1 }: NativeSlideRendererProps) {
  if (slide.pending) return <PendingSlide title={typeof slide.props.title === 'string' ? slide.props.title : '页面待生成'} />

  const Layout = layoutRegistry[slide.layout as keyof typeof layoutRegistry]
  const props = runtimeProps(slide.props)
  const animation = slide.props.__animation && typeof slide.props.__animation === 'object'
    ? slide.props.__animation as NativeAnimationConfig
    : undefined
  const animationClass = animate && animation?.enter && animation.enter !== 'none' ? `native-enter-${animation.enter}` : ''
  const animationStyle = animationClass ? {
    animationDuration: `${Number(animation?.duration || 420)}ms`,
    animationDelay: `${Math.max(0, Number(animation?.delay || 0))}ms`,
    animationTimingFunction: ['linear', 'ease', 'ease-out', 'ease-in-out'].includes(String(animation?.easing)) ? String(animation?.easing) : 'ease',
    '--native-animation-duration': `${Number(animation?.duration || 420)}ms`,
    '--native-animation-delay': `${Math.max(0, Number(animation?.delay || 0))}ms`,
    '--native-animation-easing': ['linear', 'ease', 'ease-out', 'ease-in-out'].includes(String(animation?.easing)) ? String(animation?.easing) : 'ease',
  } : undefined
  const elementAnimation = animate && animation?.elementEnter && animation.elementEnter !== 'none' ? animation.elementEnter : undefined
  const elementAnimationStyle = elementAnimation ? {
    '--native-element-duration': `${Math.max(80, Number(animation?.elementDuration || 360))}ms`,
    '--native-element-delay': `${Math.max(0, Number(animation?.elementDelay || 0))}ms`,
    '--native-element-stagger': `${Math.max(0, Number(animation?.elementStagger || 70))}ms`,
    '--native-element-easing': ['linear', 'ease', 'ease-out', 'ease-in-out'].includes(String(animation?.elementEasing)) ? String(animation?.elementEasing) : 'ease',
  } as React.CSSProperties : undefined

  if (Layout) {
    return (
      <SlideFrame slide={slide} ready animate={animate} initializeEffects={initializeEffects} elementAnimation={elementAnimation} elementAnimationStep={elementAnimationStep} elementAnimationStyle={elementAnimationStyle}>
        <div key={String(animation?.replay || 0)} className={animationClass} style={animationStyle}><Layout props={resolveDashiAssetProps(props) as Record<string, unknown>} /></div>
      </SlideFrame>
    )
  }

  if (isDashiLayout(slide.layout)) return <DashiSlide key={`${slide.layout}:${animation?.replay || 0}`} slide={{ ...slide, props: { ...props, __animationClass: animationClass, __animationStyle: animationStyle, __animationReplay: animation?.replay, __elementAnimation: elementAnimation, __elementAnimationStyle: elementAnimationStyle, __elementAnimationStep: elementAnimationStep, __elementAnimationTrigger: animation?.elementTrigger } }} initializeEffects={initializeEffects && animation?.internal !== false} animate={animate} />

  return <ErrorSlide message={`未知原生布局：${slide.layout}`} />
}

export class NativeSlideErrorBoundary extends Component<{ layout: string; resetKey?: unknown; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Native slide ${this.props.layout} failed to render`, error, info)
  }

  componentDidUpdate(previous: Readonly<typeof this.props>) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (this.state.error) return <ErrorSlide message={`页面渲染失败：${this.props.layout}`} />
    return this.props.children
  }
}

function DashiSlide({ slide, initializeEffects = true, animate = true }: NativeSlideRendererProps) {
  const [page, setPage] = useState<DashiRuntimePage>()
  const [error, setError] = useState('')
  const [runtimeReady, setRuntimeReady] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setPage(undefined)
    setError('')
    void loadDashiRuntimePage(slide.layout)
      .then((result) => {
        if (!active) return
        if (result) setPage(result)
        else setError(`未知 DashiAI 布局：${slide.layout}`)
      })
      .catch((reason) => active && setError(`主题加载失败：${reason instanceof Error ? reason.message : String(reason)}`))
    return () => { active = false }
  }, [slide.layout])

  useEffect(() => {
    const root = frameRef.current
    if (!root || !page) return
    let active = true
    setRuntimeReady(false)
    void prepareDashiRuntime(root, { initializeUnicorn: initializeEffects }).finally(() => active && setRuntimeReady(true))
    return () => {
      active = false
      disposeDashiRuntime(root)
    }
  }, [initializeEffects, page])

  const props = useMemo(() => page
    ? runtimeProps(resolveDashiAssetProps({ ...page.defaultProps, ...pruneDashiProps(page, slide.props) } as Record<string, unknown>) as Record<string, unknown>) as Record<string, unknown>
    : {}, [page, slide.props])

  if (error) return <ErrorSlide message={error} />
  if (!page) return <ErrorSlide message="主题加载中..." loading />

  const Component = page.Component
  const animationClass = animate && typeof slide.props.__animationClass === 'string' ? slide.props.__animationClass : ''
  const animationStyle = slide.props.__animationStyle && typeof slide.props.__animationStyle === 'object' ? slide.props.__animationStyle as React.CSSProperties : undefined
  const elementAnimation = animate && typeof slide.props.__elementAnimation === 'string' ? slide.props.__elementAnimation : undefined
  const elementAnimationStyle = slide.props.__elementAnimationStyle && typeof slide.props.__elementAnimationStyle === 'object' ? slide.props.__elementAnimationStyle as React.CSSProperties : undefined
  const elementAnimationStep = typeof slide.props.__elementAnimationStep === 'number' ? slide.props.__elementAnimationStep : 1
  return (
    <SlideFrame frameRef={frameRef} slide={slide} ready={runtimeReady} animate={animate} initializeEffects={initializeEffects} elementAnimation={elementAnimation} elementAnimationStep={elementAnimationStep} elementAnimationStyle={elementAnimationStyle}>
      <div key={String(slide.props.__animationReplay || 0)} className={animationClass} style={animationStyle}><Component {...props} /></div>
    </SlideFrame>
  )
}

const SlideFrame = ({ slide, ready, animate = true, initializeEffects = true, elementAnimation, elementAnimationStep = 1, elementAnimationStyle, children, frameRef }: NativeSlideRendererProps & { ready?: boolean; children: ReactNode; frameRef?: Ref<HTMLDivElement>; elementAnimation?: string; elementAnimationStep?: number; elementAnimationStyle?: React.CSSProperties }) => {
  return (
    <div
      ref={frameRef}
      className="native-slide"
      data-layout={slide.layout}
      data-page-id={slide.pageId}
      data-deck-active={animate && initializeEffects ? '' : undefined}
      data-element-animation={elementAnimation}
      data-element-trigger={elementAnimation ? String((slide.props.__animation as { elementTrigger?: string } | undefined)?.elementTrigger || slide.props.__elementAnimationTrigger || 'auto') : undefined}
      data-element-step={elementAnimation ? String(Math.max(0, Math.min(1, elementAnimationStep))) : undefined}
      data-native-layout-ready={ready ? 'true' : undefined}
      style={{ width: 1920, height: 1080, ...elementAnimationStyle }}
    >
      {children}
    </div>
  )
}

function ErrorSlide({ message, loading = false }: { message: string; loading?: boolean }) {
  return (
    <div
      className="native-slide native-slide-error"
      style={{ width: 1920, height: 1080 }}
      role={loading ? 'status' : 'alert'}
    >
      {message}
    </div>
  )
}

function PendingSlide({ title }: { title: string }) {
  return (
    <div className="native-slide native-slide-pending" style={{ width: 1920, height: 1080 }} role="status">
      <div className="native-slide-pending-panel">
        <div className="native-slide-pending-mark">*</div>
        <strong>{title}</strong>
        <span>页面尚未生成，点击生成本页或批量生成</span>
      </div>
    </div>
  )
}

function runtimeProps(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('__')))
}
