import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type Ref } from 'react'
import { layoutRegistry } from '@/native-deck/layoutRegistry'
import { isDashiLayout, loadDashiRuntimePage, type DashiRuntimePage } from '@/native-deck/dashiThemeRuntime'
import { disposeDashiRuntime, prepareDashiRuntime, resolveDashiAssetProps } from '@/native-deck/dashiRuntimeEffects'
import type { NativeSlideSpec } from '@/native-deck/types'
import '@/native-deck/native-deck.css'

export interface NativeSlideRendererProps {
  slide: NativeSlideSpec
  initializeEffects?: boolean
}

export function NativeSlideRenderer({ slide, initializeEffects = true }: NativeSlideRendererProps) {
  return (
    <NativeSlideErrorBoundary key={slide.layout} layout={slide.layout} resetKey={slide.props}>
      <NativeSlideContent slide={slide} initializeEffects={initializeEffects} />
    </NativeSlideErrorBoundary>
  )
}

function NativeSlideContent({ slide, initializeEffects = true }: NativeSlideRendererProps) {
  const Layout = layoutRegistry[slide.layout as keyof typeof layoutRegistry]
  const props = runtimeProps(slide.props)

  if (Layout) {
    return (
      <SlideFrame slide={slide} ready>
        <Layout props={resolveDashiAssetProps(props) as Record<string, unknown>} />
      </SlideFrame>
    )
  }

  if (isDashiLayout(slide.layout)) return <DashiSlide key={slide.layout} slide={{ ...slide, props }} initializeEffects={initializeEffects} />

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

function DashiSlide({ slide, initializeEffects = true }: NativeSlideRendererProps) {
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
  }, [initializeEffects, page, slide.props])

  const props = useMemo(() => page
    ? resolveDashiAssetProps({ ...page.defaultProps, ...slide.props }) as Record<string, unknown>
    : {}, [page, slide.props])

  if (error) return <ErrorSlide message={error} />
  if (!page) return <ErrorSlide message="主题加载中..." loading />

  const Component = page.Component
  return (
    <SlideFrame frameRef={frameRef} slide={slide} ready={runtimeReady}>
      <Component {...props} />
    </SlideFrame>
  )
}

const SlideFrame = ({ slide, ready, children, frameRef }: NativeSlideRendererProps & { ready?: boolean; children: ReactNode; frameRef?: Ref<HTMLDivElement> }) => {
  return (
    <div
      ref={frameRef}
      className="native-slide"
      data-layout={slide.layout}
      data-page-id={slide.pageId}
      data-native-layout-ready={ready ? 'true' : undefined}
      style={{ width: 1920, height: 1080 }}
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

function runtimeProps(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('__')))
}
