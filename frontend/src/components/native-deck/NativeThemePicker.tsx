import { useRef, useState } from 'react'
import { Check, ImageOff, LayoutTemplate, Palette, X } from 'lucide-react'
import { getStaticAssetUrl } from '@/api/client'
import { dashiThemes } from '@/native-deck/dashiThemes'

type DashiThemeValue = typeof dashiThemes[number]['value']
type NativeThemeValue = 'core01' | DashiThemeValue

type NativeThemePickerProps = {
  value: string
  onChange: (value: NativeThemeValue) => void
  disabled?: boolean
}

export function NativeThemePicker({ value, onChange, disabled = false }: NativeThemePickerProps) {
  const selectedDashiTheme = dashiThemes.find((item) => item.value === value)
  const lastDashiTheme = useRef<DashiThemeValue>(selectedDashiTheme?.value ?? 'theme01')
  if (selectedDashiTheme) lastDashiTheme.current = selectedDashiTheme.value

  const classicSelected = value === 'core01'
  const theme = selectedDashiTheme ?? dashiThemes[0]
  const [failedPreview, setFailedPreview] = useState('')
  const [scene, setScene] = useState('全部')
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewUrl = getStaticAssetUrl(theme.preview)
  const themes = dashiThemes.filter((item) => scene === '全部' || (item.scenes as readonly string[]).includes(scene))
  const generationModes = [
    {
      value: 'classic',
      label: '经典原生生成',
      description: '不依赖主题模板，按内容自动选择基础原生布局。',
      icon: LayoutTemplate,
      selected: classicSelected,
      onSelect: () => onChange('core01'),
    },
    {
      value: 'themed',
      label: '主题原生生成',
      description: '使用视觉主题组件，获得更鲜明的版式风格。',
      icon: Palette,
      selected: !classicSelected,
      onSelect: () => onChange(lastDashiTheme.current),
    },
  ] as const

  return (
    <section className="space-y-4" aria-label="原生生成设置">
      <div role="radiogroup" aria-label="原生生成方式" className="grid gap-3 sm:grid-cols-2">
        {generationModes.map((mode) => {
          const Icon = mode.icon
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={mode.selected}
              aria-label={mode.label}
              disabled={disabled}
              onClick={mode.onSelect}
              className={`flex min-h-20 items-start gap-3 rounded-md border-2 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 ${mode.selected ? 'border-cyan-500 bg-cyan-50/70 dark:border-cyan-400 dark:bg-cyan-950/20' : 'border-slate-200 bg-white hover:border-cyan-300 dark:border-border-primary dark:bg-background-elevated'}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${mode.selected ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-background-tertiary dark:text-foreground-secondary'}`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900 dark:text-foreground-primary">
                  {mode.label}
                  {mode.selected && <Check size={17} aria-hidden="true" className="shrink-0 text-cyan-600 dark:text-cyan-300" />}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-foreground-secondary">{mode.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      {classicSelected ? (
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white dark:border-border-primary dark:bg-background-elevated lg:grid-cols-[minmax(0,0.82fr)_minmax(300px,1.18fr)]">
          <div className="flex flex-col justify-center p-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate size={18} aria-hidden="true" className="text-cyan-600 dark:text-cyan-300" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">经典原生生成</h3>
            </div>
            <span className="mt-3 w-fit rounded bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">Huashu 内容驱动</span>
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-foreground-secondary">先判断每页的信息主张，再匹配观点、证据、路径、对比、案例等原生版式，保留完整可编辑结构。</p>
            <p className="mt-3 text-xs text-slate-500 dark:text-foreground-tertiary"><span className="font-medium text-slate-700 dark:text-foreground-secondary">适用场景：</span>通用汇报、快速初稿、强调编辑稳定性</p>
          </div>

          <div className="flex min-h-48 items-center justify-center border-t border-slate-200 bg-slate-100 p-5 dark:border-border-primary dark:bg-background-tertiary lg:border-l lg:border-t-0">
            <div className="aspect-video w-full max-w-md overflow-hidden rounded border border-slate-200 bg-[#f7f8f6] p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[7px] font-semibold text-cyan-700">POINT / 01</span>
                <span className="text-[7px] font-semibold text-slate-400">HUASHU NATIVE</span>
              </div>
              <div className="mt-2 h-px bg-slate-700" />
              <div className="mt-4 grid grid-cols-[1.08fr_0.92fr] gap-4">
                <div className="flex flex-col justify-center">
                  <div className="h-1.5 w-12 bg-cyan-600" />
                  <div className="mt-3 h-3 w-4/5 bg-slate-800 dark:bg-slate-100" />
                  <div className="mt-1.5 h-3 w-3/5 bg-slate-800 dark:bg-slate-100" />
                  <div className="mt-3 h-1 w-full bg-slate-300 dark:bg-slate-600" />
                  <div className="mt-1 h-1 w-4/5 bg-slate-300 dark:bg-slate-600" />
                </div>
                <div className="border-t-2 border-cyan-600 bg-white px-2.5 py-1.5 shadow-sm dark:bg-slate-800">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="flex items-center gap-2 border-b border-slate-200 py-2 last:border-b-0 dark:border-slate-700">
                      <span className="text-[6px] font-bold text-cyan-700">0{item + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="h-1 w-full bg-slate-300 dark:bg-slate-600" />
                        <div className="mt-1 h-1 w-2/3 bg-slate-200 dark:bg-slate-700" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="主题场景筛选">
              {['全部', '商务', '科技', '数据', '调研', '品牌', '金融'].map((item) => (
                <button key={item} type="button" aria-pressed={scene === item} onClick={() => setScene(item)} className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition ${scene === item ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 dark:border-border-primary dark:bg-background-elevated dark:text-foreground-secondary'}`}>{item}</button>
              ))}
            </div>
            <div role="radiogroup" aria-label="原生主题" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {themes.map((item) => {
              const selected = item.value === value
              const thumbnailUrl = getStaticAssetUrl(item.preview)
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={item.label}
                  disabled={disabled}
                  onClick={() => onChange(item.value)}
                  className={`overflow-hidden rounded-md border text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-cyan-500 bg-cyan-50 font-semibold text-cyan-950 dark:border-cyan-400 dark:bg-cyan-950/30 dark:text-cyan-100' : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 dark:border-border-primary dark:bg-background-elevated dark:text-foreground-secondary'}`}
                >
                  <span className="block aspect-video overflow-hidden bg-slate-100 dark:bg-background-tertiary">
                    <img src={thumbnailUrl} alt={`${item.label}缩略预览`} loading="lazy" className="h-full w-full object-cover" />
                  </span>
                  <span className="block p-2.5">
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                      {item.label}
                      {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-cyan-600 dark:text-cyan-300" />}
                    </span>
                    <span className="mt-1 block text-[11px] text-cyan-700 dark:text-cyan-200">{item.tone}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-foreground-tertiary">{item.useCases}</span>
                  </span>
                </button>
              )
            })}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-border-primary dark:bg-background-elevated">
            <button type="button" aria-label={`放大 ${theme.label} 主题预览`} onClick={() => setPreviewOpen(true)} className="relative block aspect-video w-full overflow-hidden bg-slate-100 text-left dark:bg-background-tertiary">
              {failedPreview === theme.preview ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-500 dark:text-foreground-tertiary">
                  <ImageOff size={24} aria-hidden="true" />
                  <span className="text-sm font-medium">{theme.label}</span>
                </div>
              ) : (
                <img src={previewUrl} alt={`${theme.label}主题预览`} onError={() => setFailedPreview(theme.preview)} className="h-full w-full object-cover" />
              )}
            </button>
            <div className="space-y-2 p-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">{theme.label}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="rounded bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">真实渲染预览</span>
                {theme.roles.map((role) => (
                  <span key={role} className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 dark:bg-background-secondary dark:text-foreground-secondary dark:ring-border-primary">{role}</span>
                ))}
              </div>
              <p className="text-xs leading-5 text-slate-600 dark:text-foreground-secondary">{theme.description}</p>
              <p className="text-xs text-slate-500 dark:text-foreground-tertiary"><span className="font-medium text-slate-700 dark:text-foreground-secondary">适用场景：</span>{theme.useCases}</p>
            </div>
          </div>
        </div>
      )}
      {previewOpen && (
        <div role="dialog" aria-modal="true" aria-label={`${theme.label}主题预览`} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-6" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-full max-w-6xl overflow-hidden rounded-md bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <img src={previewUrl} alt={`${theme.label}主题放大预览`} className="max-h-[80vh] w-auto max-w-full object-contain" />
            <button type="button" aria-label="关闭主题预览" onClick={() => setPreviewOpen(false)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"><X size={18} aria-hidden="true" /></button>
          </div>
        </div>
      )}
    </section>
  )
}
