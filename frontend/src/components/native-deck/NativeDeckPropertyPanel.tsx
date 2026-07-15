import { useRef, useState } from 'react'
import { Copy, FolderOpen, Minus, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { dashiThemes } from '@/native-deck/dashiThemes'
import { selectThemeLayout } from '@/native-deck/nativeLayoutMigration'
import { getImageUrl } from '@/api/client'

export type NativePropShape = 'string' | 'string[]' | 'number' | 'boolean' | 'media' | NativePropShape[] | { [key: string]: NativePropShape }

export type NativeControl = {
  key: string
  publicKey?: string
  label: string
  type: 'toggle' | 'boolean' | 'focus' | 'range' | 'slider' | 'number' | 'select' | 'radio' | 'segment' | 'enum' | 'labelType' | 'color' | 'palette' | 'icons' | 'images' | string
  default?: unknown
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string | number | boolean | string[]; label: string; color?: string; image?: string } | string>
  dependsOn?: string
  dependsOnValue?: unknown
  dependsOnValues?: unknown[]
  maxFromKey?: string
  maxFromKeyOffset?: number
  showIf?: string
  desc?: string
}

export type NativeLayoutContract = {
  layout: string
  theme: string
  label?: string
  roles?: string[]
  copyKeys: string[]
  copyBudgets?: Record<string, { maxChars: number }>
  propShapes: Record<string, NativePropShape>
  arrayLimits?: Record<string, { min: number; max: number; itemMaxChars: number }>
  arrayMeta?: Array<{ key: string; min?: number | null; max?: number | null; maxCount?: number | null }>
  mediaSlots: Array<{ key: string; required: boolean } & Record<string, unknown>>
  controls?: NativeControl[]
  defaultProps?: Record<string, unknown>
}

type NativeDeckPropertyPanelProps = {
  slide: NativeSlideSpec | undefined
  contract: NativeLayoutContract | undefined
  contracts: readonly NativeLayoutContract[]
  errors: Record<string, string>
  onChange: (props: Record<string, unknown>) => void
  onLayoutChange: (layout: string) => void
  onApplyAnimation?: (animation: Record<string, unknown>) => void
  mediaActions?: NativeMediaActions
}

export type NativeMediaActions = {
  busy: Record<string, string>
  onGenerate: (key: string, index: number | undefined, prompt: string, edit: boolean) => void
  onUpload: (key: string, index: number | undefined, file: File) => void
  onSelect: (key: string, index: number | undefined) => void
}

export function NativeDeckPropertyPanel({ slide, contract, contracts, errors, onChange, onLayoutChange, onApplyAnimation, mediaActions }: NativeDeckPropertyPanelProps) {
  const [fieldFilter, setFieldFilter] = useState('')
  if (!slide) return <p className="p-4 text-sm text-foreground-secondary">请选择页面</p>
  if (!contract) return <p className="p-4 text-sm text-error" role="alert">未找到布局契约：{slide.layout}</p>

  const values = { ...contract.defaultProps, ...slide.props }
  const themeLabels = new Map(dashiThemes.map((theme) => [theme.value, theme.label]))
  const themes = [...new Map(contracts.map((item) => [item.theme, item])).values()]
  const themeContracts = contracts.filter((item) => item.theme === contract.theme)
  const mediaKeys = new Set(contract.mediaSlots.map((slot) => slot.key))
  const setValue = (key: string, value: unknown) => onChange({ ...slide.props, [key]: value })

  return (
    <div className="space-y-6 p-4">
      <details open className="space-y-3 border-b border-border-primary pb-5">
        <summary className="cursor-pointer list-none text-base font-semibold text-foreground-primary marker:hidden">页面属性<span className="float-right text-base leading-none text-foreground-tertiary">−</span></summary>
        <SelectField
          label="页面主题"
          value={contract.theme}
          options={themes.map((item) => ({ value: item.theme, label: item.theme === 'core01' ? '经典原生' : `${item.theme} · ${themeLabels.get(item.theme as typeof dashiThemes[number]['value']) || item.theme}` }))}
          onChange={(theme) => {
            const candidates = contracts.filter((item) => item.theme === theme)
            const next = selectThemeLayout(contract, candidates)
            if (next) onLayoutChange(next.layout)
          }}
        />
        <SelectField
          label="页面布局"
          value={contract.layout}
          options={themeContracts.map((item) => ({ value: item.layout, label: `${item.layout} · ${item.label || item.layout}` }))}
          onChange={onLayoutChange}
        />
      </details>

      <details className="space-y-3 border-b border-border-primary pb-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-foreground-secondary marker:hidden">
          <h3 className="text-xs font-semibold text-foreground-secondary">页面动效</h3>
          <span className="text-base leading-none text-foreground-tertiary">+</span>
        </summary>
        <div className="space-y-3 pt-2">
          <div className="flex justify-end gap-1">
            <button
            type="button"
            aria-label="重新预览动效"
            title="重新预览动效"
            disabled={!slide.props.__animation || (
              String((slide.props.__animation as { enter?: string }).enter || 'none') === 'none'
              && String((slide.props.__animation as { transition?: string }).transition || 'none') === 'none'
              && String((slide.props.__animation as { elementEnter?: string }).elementEnter || 'none') === 'none'
            )}
            onClick={() => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), replay: Date.now() })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-35"
          >
            <RotateCcw size={15} aria-hidden="true" />
            </button>
            <button
            type="button"
            aria-label="应用动效到全部页面"
            title="应用动效到全部页面"
            disabled={!onApplyAnimation || !slide.props.__animation}
            onClick={() => onApplyAnimation?.(structuredClone((slide.props.__animation as Record<string, unknown>) || {}))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Copy size={15} aria-hidden="true" />
            </button>
          </div>
        <SelectField
          label="进入效果"
          value={String((slide.props.__animation as { enter?: string } | undefined)?.enter || 'none')}
          options={[{ value: 'none', label: '无' }, { value: 'fade', label: '淡入' }, { value: 'slide-up', label: '上移淡入' }, { value: 'slide-down', label: '下移淡入' }, { value: 'slide-left', label: '左移淡入' }, { value: 'slide-right', label: '右移淡入' }, { value: 'zoom-in', label: '缩放淡入' }, { value: 'blur-in', label: '模糊淡入' }, { value: 'stagger-up', label: '元素错峰上移' }, { value: 'stagger-fade', label: '元素错峰淡入' }]}
          onChange={(enter) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), enter })}
        />
        <SelectField
          label="元素逐项进入"
          value={String((slide.props.__animation as { elementEnter?: string } | undefined)?.elementEnter || 'none')}
          options={[{ value: 'none', label: '关闭' }, { value: 'fade', label: '淡入' }, { value: 'slide-up', label: '上移淡入' }, { value: 'slide-down', label: '下移淡入' }, { value: 'slide-left', label: '左移淡入' }, { value: 'slide-right', label: '右移淡入' }, { value: 'zoom-in', label: '缩放淡入' }, { value: 'blur-in', label: '模糊淡入' }, { value: 'wipe', label: '擦除进入' }, { value: 'rotate-in', label: '旋转进入' }]}
          onChange={(elementEnter) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementEnter })}
        />
        <SelectField
          label="元素触发方式"
          value={String((slide.props.__animation as { elementTrigger?: string } | undefined)?.elementTrigger || 'auto')}
          options={[{ value: 'auto', label: '页面进入后自动' }, { value: 'click', label: '单击逐项播放' }]}
          onChange={(elementTrigger) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementTrigger })}
        />
        <NumberField
          label="元素动效时长（毫秒）"
          value={Number((slide.props.__animation as { elementDuration?: number } | undefined)?.elementDuration || 360)}
          min={80}
          max={2000}
          step={20}
          onChange={(elementDuration) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementDuration })}
        />
        <NumberField
          label="元素统一延迟（毫秒）"
          value={Number((slide.props.__animation as { elementDelay?: number } | undefined)?.elementDelay || 0)}
          min={0}
          max={5000}
          step={20}
          onChange={(elementDelay) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementDelay })}
        />
        <NumberField
          label="元素间隔（毫秒）"
          value={Number((slide.props.__animation as { elementStagger?: number } | undefined)?.elementStagger || 70)}
          min={0}
          max={1000}
          step={10}
          onChange={(elementStagger) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementStagger })}
        />
        <SelectField
          label="元素缓动曲线"
          value={String((slide.props.__animation as { elementEasing?: string } | undefined)?.elementEasing || 'ease')}
          options={[{ value: 'linear', label: '线性' }, { value: 'ease', label: '平滑' }, { value: 'ease-out', label: '快速进入' }, { value: 'ease-in-out', label: '柔和往返' }]}
          onChange={(elementEasing) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), elementEasing })}
        />
        <NumberField
          label="持续时间（毫秒）"
          value={Number((slide.props.__animation as { duration?: number } | undefined)?.duration || 420)}
          min={120}
          max={2000}
          step={20}
          onChange={(duration) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), duration })}
        />
        <NumberField
          label="入场延迟（毫秒）"
          value={Number((slide.props.__animation as { delay?: number } | undefined)?.delay || 0)}
          min={0}
          max={1500}
          step={20}
          onChange={(delay) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), delay })}
        />
        <SelectField
          label="缓动曲线"
          value={String((slide.props.__animation as { easing?: string } | undefined)?.easing || 'ease')}
          options={[{ value: 'linear', label: '线性' }, { value: 'ease', label: '平滑' }, { value: 'ease-out', label: '快速进入' }, { value: 'ease-in-out', label: '柔和往返' }]}
          onChange={(easing) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), easing })}
        />
        <SelectField
          label="页面切换"
          value={String((slide.props.__animation as { transition?: string } | undefined)?.transition || 'none')}
          options={[{ value: 'none', label: '无' }, { value: 'cut', label: '瞬切' }, { value: 'fade', label: '淡化' }, { value: 'push', label: '推入' }, { value: 'wipe', label: '擦除' }, { value: 'split', label: '分割' }, { value: 'cover', label: '覆盖' }, { value: 'uncover', label: '揭开' }, { value: 'zoom', label: '缩放' }, { value: 'dissolve', label: '溶解' }]}
          onChange={(transition) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), transition })}
        />
        <SelectField
          label="切换速度"
          value={String((slide.props.__animation as { transitionSpeed?: string } | undefined)?.transitionSpeed || 'med')}
          options={[{ value: 'slow', label: '慢' }, { value: 'med', label: '中' }, { value: 'fast', label: '快' }]}
          onChange={(transitionSpeed) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), transitionSpeed })}
        />
        <SelectField
          label="切换方向"
          value={String((slide.props.__animation as { transitionDirection?: string } | undefined)?.transitionDirection || 'default')}
          options={[{ value: 'default', label: '默认' }, { value: 'l', label: '向左' }, { value: 'r', label: '向右' }, { value: 'u', label: '向上' }, { value: 'd', label: '向下' }]}
          onChange={(transitionDirection) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), transitionDirection })}
        />
        <NumberField
          label="自动翻页（秒，0 为手动）"
          value={Number((slide.props.__animation as { advanceAfter?: number } | undefined)?.advanceAfter || 0)}
          min={0}
          max={60}
          step={1}
          onChange={(advanceAfter) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), advanceAfter })}
        />
        <label className="flex items-center justify-between gap-3 text-xs text-foreground-secondary">
          <span>主题内部动效</span>
          <input
            aria-label="主题内部动效"
            type="checkbox"
            checked={(slide.props.__animation as { internal?: boolean } | undefined)?.internal !== false}
            onChange={(event) => setValue('__animation', { ...((slide.props.__animation as Record<string, unknown> | undefined) || {}), internal: event.target.checked })}
          />
        </label>
        </div>
      </details>

      {mediaActions && contract.mediaSlots.length > 0 && (
        <details open className="space-y-3 rounded-md border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/10">
          <summary className="cursor-pointer list-none text-xs font-semibold text-foreground-secondary marker:hidden">图片内容<span className="float-right text-base leading-none">−</span></summary>
          {contract.mediaSlots.map((slot) => {
            const shape = contract.propShapes[slot.key]
            const values = Array.isArray(slide.props[slot.key]) ? slide.props[slot.key] as string[] : []
            const count = Array.isArray(shape)
              ? Math.max(1, values.length, Number(slot.defaultVisibleCount ?? slot.defaultCount ?? 1))
              : 1
            return Array.from({ length: Math.min(count, Number(slot.max ?? slot.maxCount ?? count)) }, (_, index) => {
              const itemIndex = Array.isArray(shape) ? index : undefined
              const path = itemIndex == null ? slot.key : `${slot.key}[${itemIndex}]`
              const value = itemIndex == null ? String(slide.props[slot.key] || '') : String(values[itemIndex] || '')
              const prompts = slide.props.__media_prompts && typeof slide.props.__media_prompts === 'object' ? slide.props.__media_prompts as Record<string, string> : {}
              const label = `${slot.key} ${index + 1}`
              return <MediaSlotEditor key={path} label={label} value={value} prompt={prompts[path] || ''} busy={mediaActions.busy[`${slide.pageId}:${path}`]} onPrompt={(prompt) => onChange({ ...slide.props, __media_prompts: { ...prompts, [path]: prompt } })} onGenerate={(prompt) => mediaActions.onGenerate(slot.key, itemIndex, prompt, Boolean(value))} onUpload={(file) => mediaActions.onUpload(slot.key, itemIndex, file)} onSelect={() => mediaActions.onSelect(slot.key, itemIndex)} onClear={() => onChange(setMediaValue(slide.props, slot.key, itemIndex, ''))} />
            })
          })}
        </details>
      )}

      <details className="group border-b border-border-primary pb-5">
        <summary className="cursor-pointer list-none text-xs font-semibold text-foreground-secondary marker:hidden">文字与数据<span className="float-right text-base leading-none text-foreground-tertiary transition-transform group-open:rotate-45">+</span></summary>
        <div className="mt-4 space-y-4">
          <input aria-label="搜索文字字段" value={fieldFilter} onChange={(event) => setFieldFilter(event.target.value)} placeholder="搜索字段，例如：标题、正文" className="h-9 w-full rounded-md border border-border-primary bg-background-elevated px-3 text-sm" />
          {Object.entries(contract.propShapes).filter(([key]) => !mediaKeys.has(key) && (!fieldFilter.trim() || `${key} ${displayFieldLabel(key)}`.toLowerCase().includes(fieldFilter.trim().toLowerCase()))).map(([key, shape]) => (
            <ShapeEditor
              key={key}
              label={key}
              shape={shape}
              value={values[key]}
              error={errors[key]}
              limits={limitsFor(contract, key)}
              maxChars={contract.copyBudgets?.[key]?.maxChars}
              onChange={(value) => setValue(key, value)}
            />
          ))}
        </div>
      </details>

      {Boolean(contract.controls?.length) && (
        <details className="space-y-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-foreground-secondary marker:hidden">视觉控制<span className="float-right text-base leading-none text-foreground-tertiary">−</span></summary>
          <section className="space-y-3 pt-2">
          {contract.controls!.filter((control) => isControlVisible(control, values)).map((control, index) => (
            <ControlRow
              key={control.publicKey || control.key || `${control.type}-${index}`}
              control={resolvedControl(control, values)}
              value={values[control.publicKey || control.key] ?? control.default}
              onReset={() => setValue(control.publicKey || control.key, structuredClone(control.default))}
              onChange={(value) => setValue(control.publicKey || control.key, value)}
            />
          ))}
          </section>
        </details>
      )}
    </div>
  )
}

function ControlRow({ control, value, onReset, onChange }: { control: NativeControl; value: unknown; onReset: () => void; onChange: (value: unknown) => void }) {
  if (control.type === 'section') return <div className="border-t border-border-primary pt-3 text-[11px] font-semibold tracking-wide text-foreground-tertiary">{control.label}</div>
  return (
    <div className="space-y-1.5">
      {control.desc && <p className="text-[11px] leading-4 text-foreground-tertiary">{control.desc}</p>}
      <div className="flex justify-end">
        {control.default !== undefined && (
          <button type="button" aria-label={`恢复默认 ${control.label}`} title={`恢复默认 ${control.label}`} onClick={onReset} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-foreground-tertiary hover:bg-background-hover hover:text-foreground-secondary">
            <RotateCcw size={12} aria-hidden="true" />恢复默认
          </button>
        )}
      </div>
      <ControlEditor control={control} value={value} onChange={onChange} />
    </div>
  )
}

function MediaSlotEditor({ label, value, prompt: initialPrompt, busy, onPrompt, onGenerate, onUpload, onSelect, onClear }: {
  label: string; value: string; prompt: string; busy?: string
  onPrompt: (prompt: string) => void; onGenerate: (prompt: string) => void
  onUpload: (file: File) => void; onSelect: () => void; onClear: () => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2 rounded-md border border-border-primary p-3">
      {value ? <img src={getImageUrl(value)} alt={label} className="aspect-video w-full rounded-md bg-background-primary object-cover" /> : <div className="flex aspect-video items-center justify-center rounded-md bg-background-primary text-xs text-foreground-secondary">待生成图片</div>}
      <textarea aria-label={`${label} 图片要求`} rows={2} value={prompt} onChange={(event) => { setPrompt(event.target.value); onPrompt(event.target.value) }} placeholder="描述主体、构图或修改要求" className="w-full resize-y rounded-md border border-border-primary bg-background-elevated px-2 py-1.5 text-xs" />
      {busy && <p role="status" className="text-xs text-cyan-600">{busy}</p>}
      <div className="grid grid-cols-4 gap-1">
        <MediaButton label={`${value ? '修改' : '生成'} ${label}`} disabled={Boolean(busy)} onClick={() => onGenerate(prompt)}><Sparkles size={14} /></MediaButton>
        <MediaButton label={`上传替换 ${label}`} onClick={() => inputRef.current?.click()}><Upload size={14} /></MediaButton>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = '' }} />
        <MediaButton label={`从素材库选择 ${label}`} onClick={onSelect}><FolderOpen size={14} /></MediaButton>
        <MediaButton label={`清除 ${label}`} disabled={!value} onClick={onClear}><Trash2 size={14} /></MediaButton>
      </div>
    </div>
  )
}

function MediaButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-9 items-center justify-center rounded-md hover:bg-background-hover disabled:opacity-35">{children}</button>
}

function setMediaValue(props: Record<string, unknown>, key: string, index: number | undefined, value: string) {
  if (index == null) return { ...props, [key]: value }
  const items = Array.isArray(props[key]) ? [...props[key] as unknown[]] : []
  while (items.length <= index) items.push('')
  items[index] = value
  return { ...props, [key]: items }
}

function ShapeEditor({ label, shape, value, error, limits, maxChars, onChange }: {
  label: string
  shape: NativePropShape
  value: unknown
  error?: string
  limits?: { min: number; max: number; itemMaxChars?: number }
  maxChars?: number
  onChange: (value: unknown) => void
}) {
  if (shape === 'string[]') shape = ['string']
  if (Array.isArray(shape)) {
    const tuple = shape.length > 1
    const items = Array.isArray(value) ? value : []
    const min = limits?.min ?? 0
    const max = limits?.max ?? Number.POSITIVE_INFINITY
    return (
      <fieldset className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-xs font-medium text-foreground-secondary">{label}</legend>
          {!tuple && <button type="button" aria-label={`添加 ${label}`} title={`添加 ${label}`} disabled={items.length >= max} onClick={() => onChange([...items, blankValue(shape[0] || 'string')])} className="flex h-9 w-9 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:opacity-40"><Plus size={16} aria-hidden="true" /></button>}
        </div>
        {items.map((item, index) => (
          <div className="space-y-2 border-l-2 border-border-primary pl-3" key={`${label}-${index}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-secondary">{index + 1}</span>
              {!tuple && <button type="button" aria-label={`删除 ${label} ${index + 1}`} title={`删除 ${label} ${index + 1}`} disabled={items.length <= min} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:opacity-40"><Minus size={15} aria-hidden="true" /></button>}
            </div>
            <ShapeEditor label={`${label} ${index + 1}`} shape={(tuple ? shape[index] : shape[0]) || 'string'} value={item} maxChars={limits?.itemMaxChars} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
          </div>
        ))}
        {error && <p className="text-xs text-error" role="alert">{error}</p>}
      </fieldset>
    )
  }

  if (shape && typeof shape === 'object') {
    const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    return (
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground-secondary">{displayFieldLabel(label)}</legend>
        {Object.entries(shape).map(([key, childShape]) => (
          <ShapeEditor key={key} label={`${label} ${key}`} shape={childShape} value={object[key]} onChange={(next) => onChange({ ...object, [key]: next })} />
        ))}
      </fieldset>
    )
  }

  if (shape === 'boolean') {
    return <ToggleField label={label} checked={Boolean(value)} onChange={onChange} />
  }

  if (shape === 'number') {
    return <NumberField label={label} value={Number(value || 0)} onChange={onChange} />
  }

  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-foreground-secondary">{displayFieldLabel(label)}</span>
      {shape === 'media' ? (
        <input aria-label={label} aria-invalid={Boolean(error)} value={typeof value === 'string' ? value : ''} placeholder="/files/..." onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-border-primary bg-background-elevated px-3 py-2 text-sm" />
      ) : (
        <textarea aria-label={label} aria-invalid={Boolean(error)} maxLength={maxChars} value={typeof value === 'string' ? value : ''} rows={label.endsWith('summary') ? 5 : 2} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-md border border-border-primary bg-background-elevated px-3 py-2 text-sm" />
      )}
      {shape !== 'media' && maxChars !== undefined && <span className="block text-right text-[11px] text-foreground-tertiary">{typeof value === 'string' ? value.length : 0}/{maxChars}</span>}
      {error && <span className="block text-xs text-error" role="alert">{error}</span>}
    </label>
  )
}

function ControlEditor({ control, value, onChange }: { control: NativeControl; value: unknown; onChange: (value: unknown) => void }) {
  if (control.type === 'text' || control.type === 'string' || control.type === 'input' || control.type === 'url' || control.type === 'email') {
    return <label className="block space-y-1 text-xs text-foreground-secondary"><span>{control.label}</span><input aria-label={control.label} type={control.type === 'email' ? 'email' : control.type === 'url' ? 'url' : 'text'} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-border-primary bg-background-elevated px-3 text-sm text-foreground-primary" /></label>
  }
  if (control.type === 'textarea' || control.type === 'multiline') {
    return <label className="block space-y-1 text-xs text-foreground-secondary"><span>{control.label}</span><textarea aria-label={control.label} value={typeof value === 'string' ? value : ''} rows={3} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-md border border-border-primary bg-background-elevated px-3 py-2 text-sm text-foreground-primary" /></label>
  }
  if (control.type === 'toggle' || control.type === 'boolean' || control.type === 'focus') return <ToggleField label={control.label} checked={Boolean(value)} onChange={onChange} />
  if (control.type === 'range' || control.type === 'slider' || control.type === 'number') {
    return <NumberField label={control.label} value={Number(value ?? control.default ?? 0)} min={control.min} max={control.max} step={control.step} range={control.type === 'range' || control.type === 'slider'} onChange={onChange} />
  }
  if ((control.type === 'color' || control.type === 'palette') && control.options?.length) {
    if (control.type === 'palette') {
      return <ColorSwatches label={control.label} value={JSON.stringify(value ?? control.default ?? [])} options={control.options} arrayValue onChange={(next) => onChange(JSON.parse(next))} />
    }
    return <ColorSwatches label={control.label} value={String(value ?? '')} options={control.options} onChange={(next) => onChange(coerceOption(next, control.options!))} />
  }
  if ((control.type === 'select' || control.type === 'radio' || control.type === 'segment' || control.type === 'enum' || control.type === 'labelType' || control.type === 'icons') && control.options?.length) {
    return <SelectField label={control.label} value={String(value ?? '')} options={control.options.map(optionEntry)} onChange={(next) => onChange(coerceOption(next, control.options!))} />
  }
  if (control.type === 'color') {
    return <label className="flex items-center justify-between gap-3 text-xs text-foreground-secondary"><span>{control.label}</span><input aria-label={control.label} type="color" value={typeof value === 'string' ? value : '#000000'} onChange={(event) => onChange(event.target.value)} /></label>
  }
  return null
}

function ColorSwatches({ label, value, options, arrayValue = false, onChange }: { label: string; value: string; options: NonNullable<NativeControl['options']>; arrayValue?: boolean; onChange: (value: string) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-foreground-secondary">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const entry = optionEntry(option)
          const color = typeof option === 'string' ? option : option.color || String(option.value)
          const selected = arrayValue ? JSON.stringify(entry.rawValue) === value : entry.value === value
          return <button key={entry.value} type="button" aria-label={entry.label} title={entry.label} aria-pressed={selected} onClick={() => onChange(arrayValue ? JSON.stringify(entry.rawValue) : entry.value)} className={`h-9 w-9 rounded-lg border-2 transition-transform hover:scale-105 ${selected ? 'border-cyan-600 ring-2 ring-cyan-200' : 'border-white shadow-sm dark:border-border-primary'}`} style={{ background: color }} />
        })}
      </div>
    </fieldset>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1 text-xs text-foreground-secondary">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-border-primary bg-background-elevated px-2 text-sm text-foreground-primary">
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  )
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 text-xs text-foreground-secondary"><span>{label}</span><input aria-label={label} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}

function NumberField({ label, value, min, max, step, range = false, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; range?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1 text-xs text-foreground-secondary">
      <span className="flex justify-between"><span>{label}</span><span>{value}</span></span>
      <input aria-label={label} type={range ? 'range' : 'number'} value={value} min={min} max={max} step={step || 1} onChange={(event) => onChange(Number(event.target.value))} className="w-full" />
    </label>
  )
}

function limitsFor(contract: NativeLayoutContract, key: string) {
  const legacy = contract.arrayLimits?.[key]
  if (legacy) return { min: legacy.min, max: legacy.max, itemMaxChars: legacy.itemMaxChars }
  const meta = contract.arrayMeta?.find((item) => item.key === key)
  if (!meta) return undefined
  return { min: meta.min ?? 0, max: meta.max ?? meta.maxCount ?? Number.POSITIVE_INFINITY, itemMaxChars: undefined }
}

function isControlVisible(control: NativeControl, values: Record<string, unknown>) {
  if (control.showIf && !Boolean(values[control.showIf])) return false
  if (!control.dependsOn) return true
  const actual = values[control.dependsOn]
  if (Array.isArray(control.dependsOnValues)) return control.dependsOnValues.some((value) => Object.is(value, actual))
  if (control.dependsOnValue !== undefined) return Object.is(control.dependsOnValue, actual)
  return Boolean(actual)
}

function resolvedControl(control: NativeControl, values: Record<string, unknown>): NativeControl {
  if (!control.maxFromKey) return control
  const linkedMax = Number(values[control.maxFromKey])
  if (!Number.isFinite(linkedMax)) return control
  const offset = Number.isFinite(control.maxFromKeyOffset) ? Number(control.maxFromKeyOffset) : 0
  const resolvedMax = Math.max(0, linkedMax + offset)
  return { ...control, max: control.max === undefined ? resolvedMax : Math.min(control.max, resolvedMax) }
}

function blankValue(shape: NativePropShape): unknown {
  if (shape === 'string' || shape === 'media') return ''
  if (shape === 'number') return 0
  if (shape === 'boolean') return false
  if (shape === 'string[]') return []
  if (Array.isArray(shape)) return []
  if (shape && typeof shape === 'object') return Object.fromEntries(Object.entries(shape).map(([key, child]) => [key, blankValue(child)]))
  return ''
}

function optionEntry(option: NonNullable<NativeControl['options']>[number]) {
  return typeof option === 'string' ? { value: option, label: option, rawValue: option } : { value: String(option.value), label: option.label, rawValue: option.value }
}

function coerceOption(value: string, options: NonNullable<NativeControl['options']>) {
  const option = options.find((item) => optionEntry(item).value === value)
  return typeof option === 'string' ? option : option?.value ?? value
}

function displayFieldLabel(key: string) {
  const labels: Record<string, string> = {
    title: '标题', subtitle: '副标题', body: '正文', summary: '摘要', kicker: '眉题', eyebrow: '眉题',
    ghostMark: '装饰文字', railText: '侧边文字', navItems: '导航项目', items: '列表项目', cards: '卡片',
    labels: '标签', values: '数值', caption: '说明', note: '备注', footer: '页脚', quote: '引用',
  }
  if (labels[key]) return labels[key]
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (value) => value.toUpperCase())
}
