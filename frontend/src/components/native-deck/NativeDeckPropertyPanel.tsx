import { useRef, useState } from 'react'
import { FolderOpen, Minus, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { dashiThemes } from '@/native-deck/dashiThemes'
import { selectThemeLayout } from '@/native-deck/nativeLayoutMigration'
import { getImageUrl } from '@/api/client'

export type NativePropShape = 'string' | 'string[]' | 'number' | 'boolean' | 'media' | NativePropShape[] | { [key: string]: NativePropShape }

export type NativeControl = {
  key: string
  publicKey?: string
  label: string
  type: 'toggle' | 'range' | 'number' | 'select' | 'color' | 'icons' | string
  default?: unknown
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string | number | boolean; label: string; color?: string; image?: string }>
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
  mediaActions?: NativeMediaActions
}

export type NativeMediaActions = {
  busy: Record<string, string>
  onGenerate: (key: string, index: number | undefined, prompt: string, edit: boolean) => void
  onUpload: (key: string, index: number | undefined, file: File) => void
  onSelect: (key: string, index: number | undefined) => void
}

export function NativeDeckPropertyPanel({ slide, contract, contracts, errors, onChange, onLayoutChange, mediaActions }: NativeDeckPropertyPanelProps) {
  if (!slide) return <p className="p-4 text-sm text-foreground-secondary">请选择页面</p>
  if (!contract) return <p className="p-4 text-sm text-error" role="alert">未找到布局契约：{slide.layout}</p>

  const values = { ...contract.defaultProps, ...slide.props }
  const themeLabels = new Map(dashiThemes.map((theme) => [theme.value, theme.label]))
  const themes = [...new Map(contracts.map((item) => [item.theme, item])).values()]
  const themeContracts = contracts.filter((item) => item.theme === contract.theme)
  const mediaKeys = new Set(contract.mediaSlots.map((slot) => slot.key))
  const setValue = (key: string, value: unknown) => onChange({ ...slide.props, [key]: value })

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-primary">页面属性</h2>
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
      </div>

      {mediaActions && contract.mediaSlots.length > 0 && (
        <section className="space-y-3 rounded-md border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/10">
          <h3 className="text-xs font-semibold text-foreground-secondary">图片内容</h3>
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
        </section>
      )}

      {Object.entries(contract.propShapes).filter(([key]) => !mediaKeys.has(key)).map(([key, shape]) => (
        <ShapeEditor
          key={key}
          label={key}
          shape={shape}
          value={values[key]}
          error={errors[key]}
          limits={limitsFor(contract, key)}
          onChange={(value) => setValue(key, value)}
        />
      ))}

      {Boolean(contract.controls?.length) && (
        <section className="space-y-3 border-t border-border-primary pt-4">
          <h3 className="text-xs font-semibold text-foreground-secondary">视觉控制</h3>
          {contract.controls!.map((control) => (
            <ControlEditor
              key={control.publicKey || control.key}
              control={control}
              value={values[control.publicKey || control.key] ?? control.default}
              onChange={(value) => setValue(control.publicKey || control.key, value)}
            />
          ))}
        </section>
      )}
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

function ShapeEditor({ label, shape, value, error, limits, onChange }: {
  label: string
  shape: NativePropShape
  value: unknown
  error?: string
  limits?: { min: number; max: number }
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
            <ShapeEditor label={`${label} ${index + 1}`} shape={(tuple ? shape[index] : shape[0]) || 'string'} value={item} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
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
        <legend className="text-xs font-medium text-foreground-secondary">{label}</legend>
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
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {shape === 'media' ? (
        <input aria-label={label} aria-invalid={Boolean(error)} value={typeof value === 'string' ? value : ''} placeholder="/files/..." onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-border-primary bg-background-elevated px-3 py-2 text-sm" />
      ) : (
        <textarea aria-label={label} aria-invalid={Boolean(error)} value={typeof value === 'string' ? value : ''} rows={label.endsWith('summary') ? 5 : 2} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-md border border-border-primary bg-background-elevated px-3 py-2 text-sm" />
      )}
      {error && <span className="block text-xs text-error" role="alert">{error}</span>}
    </label>
  )
}

function ControlEditor({ control, value, onChange }: { control: NativeControl; value: unknown; onChange: (value: unknown) => void }) {
  if (control.type === 'toggle') return <ToggleField label={control.label} checked={Boolean(value)} onChange={onChange} />
  if (control.type === 'range' || control.type === 'number') {
    return <NumberField label={control.label} value={Number(value ?? control.default ?? 0)} min={control.min} max={control.max} step={control.step} range={control.type === 'range'} onChange={onChange} />
  }
  if ((control.type === 'select' || control.type === 'color' || control.type === 'icons') && control.options?.length) {
    return <SelectField label={control.label} value={String(value ?? '')} options={control.options.map((item) => ({ value: String(item.value), label: item.label }))} onChange={(next) => onChange(coerceOption(next, control.options!))} />
  }
  if (control.type === 'color') {
    return <label className="flex items-center justify-between gap-3 text-xs text-foreground-secondary"><span>{control.label}</span><input aria-label={control.label} type="color" value={typeof value === 'string' ? value : '#000000'} onChange={(event) => onChange(event.target.value)} /></label>
  }
  return null
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
  if (legacy) return { min: legacy.min, max: legacy.max }
  const meta = contract.arrayMeta?.find((item) => item.key === key)
  if (!meta) return undefined
  return { min: meta.min ?? 0, max: meta.max ?? meta.maxCount ?? Number.POSITIVE_INFINITY }
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

function coerceOption(value: string, options: NonNullable<NativeControl['options']>) {
  return options.find((item) => String(item.value) === value)?.value ?? value
}
