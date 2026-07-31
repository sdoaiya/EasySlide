import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ImageOff, LayoutTemplate, X } from 'lucide-react'
import { getStaticAssetUrl } from '@/api/client'
import { dashiThemes } from '@/native-deck/dashiThemes'
import { Modal } from '@/components/shared/Modal'
import { SegmentedControl } from '@/components/shared/SegmentedControl'

type DashiThemeValue = typeof dashiThemes[number]['value']
type NativeThemeValue = 'core01' | DashiThemeValue
type GenerationMode = 'classic' | 'themed'

type NativeThemePickerProps = {
  value: string
  onChange: (value: NativeThemeValue) => void
  disabled?: boolean
}

const scenes = ['全部', '商务', '科技', '数据', '调研', '品牌', '金融'] as const

const themeAccents = [
  ['var(--app-accent-blue)', 'var(--app-accent-blue-soft)'],
  ['var(--app-accent-violet)', 'var(--app-accent-violet-soft)'],
  ['var(--app-accent-ocean)', 'var(--app-accent-ocean-soft)'],
  ['var(--app-accent-teal)', 'var(--app-accent-teal-soft)'],
  ['var(--app-accent-coral)', 'var(--app-accent-coral-soft)'],
  ['var(--app-accent-amber)', 'var(--app-accent-amber-soft)'],
] as const

export function NativeThemePicker({ value, onChange, disabled = false }: NativeThemePickerProps) {
  const selectedDashiTheme = dashiThemes.find((item) => item.value === value)
  const lastDashiTheme = useRef<DashiThemeValue>(selectedDashiTheme?.value ?? 'theme01')
  const themeRefs = useRef<Array<HTMLButtonElement | null>>([])
  const previewTriggerRef = useRef<HTMLButtonElement>(null)
  const restorePreviewFocus = useRef(false)
  if (selectedDashiTheme) lastDashiTheme.current = selectedDashiTheme.value

  const classicSelected = value === 'core01'
  const mode: GenerationMode = classicSelected ? 'classic' : 'themed'
  const theme = selectedDashiTheme ?? dashiThemes[0]
  const [failedPreview, setFailedPreview] = useState('')
  const [scene, setScene] = useState<(typeof scenes)[number]>('全部')
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewUrl = getStaticAssetUrl(theme.preview)
  const themes = dashiThemes.filter((item) => scene === '全部' || (item.scenes as readonly string[]).includes(scene))

  useEffect(() => {
    if (previewOpen) {
      restorePreviewFocus.current = true
      return
    }
    if (!restorePreviewFocus.current) return
    restorePreviewFocus.current = false
    window.setTimeout(() => previewTriggerRef.current?.focus(), 0)
  }, [previewOpen])

  const selectMode = (nextMode: GenerationMode) => {
    onChange(nextMode === 'classic' ? 'core01' : lastDashiTheme.current)
  }

  const moveTheme = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % themes.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + themes.length) % themes.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = themes.length - 1
    else return
    event.preventDefault()
    const nextTheme = themes[nextIndex]
    onChange(nextTheme.value)
    themeRefs.current[nextIndex]?.focus()
  }

  return (
    <section className="space-y-4 text-[var(--app-text)]" aria-label="原生生成设置">
      <div>
        <SegmentedControl
          ariaLabel="原生生成方式"
          value={mode}
          disabled={disabled}
          options={[
            { value: 'classic', label: '经典原生生成' },
            { value: 'themed', label: '主题原生生成' },
          ]}
          onChange={selectMode}
          className="w-full"
        />
        <p className="mt-2 text-xs leading-5 text-[var(--app-text-secondary)]">
          {classicSelected ? '按内容自动选择基础原生布局，强调编辑稳定性。' : '使用视觉主题组件，获得更鲜明的版式风格。'}
        </p>
      </div>

      {classicSelected ? (
        <div className="grid overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] lg:grid-cols-[minmax(0,0.82fr)_minmax(300px,1.18fr)]">
          <div className="flex flex-col justify-center p-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate size={18} aria-hidden="true" className="text-[var(--app-accent)]" />
              <h3 className="text-sm font-semibold">经典原生生成</h3>
            </div>
            <span className="mt-3 w-fit rounded bg-[var(--app-surface-muted)] px-2 py-1 text-xs font-medium text-[var(--app-text-secondary)]">原生内容驱动</span>
            <p className="mt-3 text-xs leading-5 text-[var(--app-text-secondary)]">先判断每页的信息主张，再匹配观点、证据、路径、对比、案例等原生版式，保留完整可编辑结构。</p>
            <p className="mt-3 text-xs text-[var(--app-text-tertiary)]"><span className="font-medium text-[var(--app-text-secondary)]">适用场景：</span>通用汇报、快速初稿、强调编辑稳定性</p>
          </div>
          <div className="flex min-h-48 items-center justify-center border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] p-5 lg:border-l lg:border-t-0">
            <div className="aspect-video w-full max-w-md overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow-card)]">
              <div className="flex items-center justify-between text-[7px] font-semibold text-[var(--app-text-tertiary)]"><span>POINT / 01</span><span>NATIVE</span></div>
              <div className="mt-2 h-px bg-[var(--app-text-secondary)]" />
              <div className="mt-4 grid grid-cols-[1.08fr_0.92fr] gap-4">
                <div className="flex flex-col justify-center">
                  <div className="h-1.5 w-12 bg-[var(--app-accent)]" />
                  <div className="mt-3 h-3 w-4/5 bg-[var(--app-text)]" />
                  <div className="mt-1.5 h-3 w-3/5 bg-[var(--app-text)]" />
                  <div className="mt-3 h-1 w-full bg-[var(--app-border-strong)]" />
                  <div className="mt-1 h-1 w-4/5 bg-[var(--app-border)]" />
                </div>
                <div className="border-t-2 border-[var(--app-accent)] bg-[var(--app-surface)] px-2.5 py-1.5 shadow-[var(--app-shadow-card)]">
                  {[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-2 border-b border-[var(--app-border)] py-2 last:border-b-0"><span className="text-[6px] font-bold text-[var(--app-accent)]">0{item + 1}</span><div className="min-w-0 flex-1"><div className="h-1 w-full bg-[var(--app-border-strong)]" /><div className="mt-1 h-1 w-2/3 bg-[var(--app-border)]" /></div></div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="主题场景筛选">
              {scenes.map((item) => <button key={item} type="button" aria-pressed={scene === item} onClick={() => setScene(item)} className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${scene === item ? 'border-[var(--app-accent)] bg-[var(--app-surface)] text-[var(--app-accent)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'}`}>{item}</button>)}
            </div>
            <div role="radiogroup" aria-label="原生主题" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {themes.map((item, index) => {
                const selected = item.value === value
                const tabStop = selected || (!themes.some((candidate) => candidate.value === value) && index === 0)
                const [tone, softTone] = themeAccents[index % themeAccents.length]
                return (
                  <button key={item.value} ref={(element) => { themeRefs.current[index] = element }} type="button" role="radio" aria-checked={selected} aria-label={item.label} disabled={disabled} tabIndex={tabStop ? 0 : -1} onClick={() => onChange(item.value)} onKeyDown={(event) => moveTheme(event, index)} className={`overflow-hidden rounded-lg border text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-[var(--app-accent)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)]'}`}>
                    <span className="block aspect-video overflow-hidden bg-[var(--app-surface-muted)]"><img src={getStaticAssetUrl(item.preview)} alt={`${item.label}缩略预览`} loading="lazy" className="h-full w-full object-cover" /></span>
                    <span className="block p-2.5"><span className="flex items-center justify-between gap-2 text-sm font-semibold">{item.label}{selected && <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--app-accent)]" />}</span><span className="mt-2 inline-flex rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: softTone, color: tone }}>{item.tone}</span><span className="mt-1.5 block text-[11px] leading-4 text-[var(--app-text-tertiary)]">{item.useCases}</span></span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
            <button ref={previewTriggerRef} type="button" aria-label={`放大 ${theme.label} 主题预览`} onClick={() => setPreviewOpen(true)} className="relative block aspect-video w-full overflow-hidden bg-[var(--app-surface-muted)] text-left">
              {failedPreview === theme.preview ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[var(--app-text-tertiary)]"><ImageOff size={24} aria-hidden="true" /><span className="text-sm font-medium">{theme.label}</span></div> : <img src={previewUrl} alt={`${theme.label}主题预览`} onError={() => setFailedPreview(theme.preview)} className="h-full w-full object-cover" />}
            </button>
            <div className="space-y-2 p-3"><h3 className="text-sm font-semibold">{theme.label}</h3><div className="flex flex-wrap gap-1"><span className="rounded bg-[var(--app-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-text-secondary)]">真实渲染预览</span>{theme.roles.map((role) => <span key={role} className="rounded bg-[var(--app-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--app-text-secondary)]">{role}</span>)}</div><p className="text-xs leading-5 text-[var(--app-text-secondary)]">{theme.description}</p><p className="text-xs text-[var(--app-text-tertiary)]"><span className="font-medium text-[var(--app-text-secondary)]">适用场景：</span>{theme.useCases}</p></div>
          </div>
        </div>
      )}

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title={`${theme.label}主题预览`} size="wide" showCloseButton={false}>
        <div className="relative flex min-h-0 items-center justify-center bg-[var(--app-canvas)] p-4">
          <img src={previewUrl} alt={`${theme.label}主题放大预览`} className="max-h-[72vh] w-auto max-w-full object-contain" />
          <button type="button" aria-label="关闭主题预览" onClick={() => setPreviewOpen(false)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-md bg-[color:var(--app-surface)]/85 text-[var(--app-text)] transition-colors hover:bg-[color:var(--app-surface)]/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"><X size={18} aria-hidden="true" /></button>
        </div>
      </Modal>
    </section>
  )
}
