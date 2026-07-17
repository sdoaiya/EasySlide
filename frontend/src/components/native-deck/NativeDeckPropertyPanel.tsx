import { useRef, useState } from 'react'
import { Copy, FolderOpen, Minus, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { dashiThemes } from '@/native-deck/dashiThemes'
import { selectThemeLayout } from '@/native-deck/nativeLayoutMigration'
import { getImageUrl } from '@/api/client'
import type { NativePageVersion } from '@/api/endpoints'

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
  onRegenerate?: () => void
  versions?: NativePageVersion[]
  onRestoreVersion?: (versionId: string) => void
  onApplyAnimation?: (animation: Record<string, unknown>) => void
  mediaActions?: NativeMediaActions
}

export type NativeMediaActions = {
  busy: Record<string, string>
  onGenerate: (key: string, index: number | undefined, prompt: string, edit: boolean) => void
  onUpload: (key: string, index: number | undefined, file: File) => void
  onSelect: (key: string, index: number | undefined) => void
}

type NativeControlGroupKey = 'structure' | 'visual' | 'advanced'
type NativePropertyLayer = 'page' | 'content' | 'media' | 'structure' | 'visual' | 'motion'

type NativeDesignIntent = {
  visual_direction: string
  narrative_role: string
  media_strategy: string
  content_signals: string[]
  page_plan: {
    information_focus: string
    composition: string
    media_direction: string
    motion_direction: string
  }
  quality_report?: {
    status: string
    score: number
    outline_coverage: number
    issues: string[]
  }
}

export function NativeDeckPropertyPanel({ slide, contract, contracts, errors, onChange, onLayoutChange, onRegenerate, versions = [], onRestoreVersion, onApplyAnimation, mediaActions }: NativeDeckPropertyPanelProps) {
  const [fieldFilter, setFieldFilter] = useState('')
  const [layer, setLayer] = useState<NativePropertyLayer>('page')
  if (!slide) return <p className="p-4 text-sm text-foreground-secondary">请选择页面</p>
  if (!contract) return <p className="p-4 text-sm text-error" role="alert">未找到布局契约：{slide.layout}</p>

  const values = { ...contract.defaultProps, ...slide.props }
  const themeLabels = new Map(dashiThemes.map((theme) => [theme.value, theme.label]))
  const themes = [...new Map(contracts.map((item) => [item.theme, item])).values()]
  const themeContracts = contracts.filter((item) => item.theme === contract.theme)
  const roleOptions = [...new Set(themeContracts.flatMap((item) => item.roles || []))]
  const mediaKeys = new Set(contract.mediaSlots.map((slot) => slot.key))
  const isFallback = Boolean(
    slide.props.__design_intent
    && typeof slide.props.__design_intent === 'object'
    && (slide.props.__design_intent as Record<string, unknown>).generation_fallback,
  )
  const setValue = (key: string, value: unknown) => onChange({ ...slide.props, [key]: value })
  const animation = slide.props.__animation && typeof slide.props.__animation === 'object' ? slide.props.__animation as Record<string, unknown> : {}
  const setAnimationValue = (key: string, value: unknown) => setValue('__animation', { ...animation, [key]: value })
  const controlGroups = groupControls((contract.controls || []).filter((control) => isControlVisible(control, values)), values)
  const controlGroupMap = new Map(controlGroups.map((group) => [group.key, group]))
  const designIntent = nativeDesignIntent(slide.props.__design_intent)
  const layers: Array<{ key: NativePropertyLayer; label: string }> = [
    { key: 'page', label: '页面' },
    { key: 'content', label: '内容' },
    { key: 'media', label: '媒体' },
    { key: 'structure', label: '结构' },
    { key: 'visual', label: '视觉' },
    { key: 'motion', label: '动效' },
  ]
  const renderControlGroup = (key: NativeControlGroupKey, open = false) => {
    const group = controlGroupMap.get(key)
    if (!group) return null
    return (
      <details key={group.key} open={open} className="space-y-3 rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-border-primary dark:bg-background-secondary">
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground-primary marker:hidden">{group.label}<span className="float-right text-base leading-none text-foreground-tertiary">{open ? '−' : '+'}</span></summary>
        <section className="space-y-3 pt-2">
          {group.controls.map((control, index) => (
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
    )
  }

  return (
    <div className="space-y-3 bg-[#f8fbfd] p-3 dark:bg-background-primary">
      <div className="sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-xl border border-sky-100 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-border-primary dark:bg-background-secondary/95" role="tablist" aria-label="页面属性分层">
        {layers.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={layer === item.key}
            onClick={() => setLayer(item.key)}
            className={`h-9 rounded-lg text-sm font-semibold transition ${layer === item.key ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-cyan-950/30 dark:text-cyan-100' : 'text-foreground-secondary hover:bg-background-hover'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {layer === 'page' && (
      <>
      <details open className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-border-primary dark:bg-background-secondary">
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground-primary marker:hidden">页面设置<span className="float-right text-base leading-none text-foreground-tertiary">−</span></summary>
        <div className="mt-3 space-y-3">
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
        {roleOptions.length > 0 && (
          <SelectField
            label="页面角色"
            value={contract.roles?.[0] || roleOptions[0]}
            options={roleOptions.map((role) => ({ value: role, label: displayRoleLabel(role) }))}
            onChange={(role) => {
              const next = selectThemeLayout(contract, themeContracts.filter((item) => item.roles?.includes(role)))
              if (next) onLayoutChange(next.layout)
            }}
          />
        )}
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs text-foreground-secondary dark:bg-background-primary/50">
          <span>页面状态</span>
          <span className={slide.pending ? 'font-semibold text-amber-600' : isFallback ? 'font-semibold text-amber-600' : 'font-semibold text-emerald-600'}>{slide.pending ? '待生成' : isFallback ? '回退生成' : '已生成'}</span>
        </div>
        {onRegenerate && <button type="button" onClick={onRegenerate} className="h-9 w-full rounded-md border border-sky-200 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100">{designIntent?.quality_report?.status === 'warning' ? '修复并重新生成' : '重新生成本页'}</button>}
        <details className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-border-primary dark:bg-background-secondary">
          <summary role="button" aria-label="页面版本" className="cursor-pointer list-none text-xs font-semibold text-foreground-secondary">页面版本（{versions.length}）</summary>
          <div className="mt-2 space-y-1">
            {versions.map((version) => (
              <button key={version.version_id} type="button" disabled={version.is_current} onClick={() => onRestoreVersion?.(version.version_id)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 disabled:text-sky-700 dark:hover:bg-background-hover">
                <span>版本 {version.version_number}{version.is_current ? '（当前）' : ''}</span>
                {!version.is_current && <span className="text-foreground-tertiary">切换</span>}
              </button>
            ))}
          </div>
        </details>
        </div>
      </details>

      {designIntent && (
        <details open className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/10">
          <summary className="cursor-pointer list-none text-sm font-semibold text-cyan-900 marker:hidden dark:text-cyan-100">页面摘要<span className="float-right text-base leading-none">−</span></summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-foreground-secondary">
            {designIntent.visual_direction && <IntentLine label="视觉方向" value={designIntent.visual_direction} />}
            {designIntent.narrative_role && <IntentLine label="叙事角色" value={designIntent.narrative_role} />}
            {designIntent.media_strategy && <IntentLine label="媒体策略" value={designIntent.media_strategy} />}
            {designIntent.quality_report && (
              <IntentLine
                label="生成质量"
                value={`${designIntent.quality_report.score} 分${designIntent.quality_report.issues.length ? ` · ${designIntent.quality_report.issues.map(qualityIssueLabel).join('、')}` : ' · 检查通过'}`}
              />
            )}
          </div>
        </details>
      )}
      </>
      )}

      {layer === 'structure' && (
        renderControlGroup('structure', true) || <EmptyLayer text="当前页面没有结构控制项" />
      )}

      {layer === 'visual' && (
      <>
        {renderControlGroup('visual', true)}
        {renderControlGroup('advanced', true)}
        {!controlGroupMap.get('visual') && !controlGroupMap.get('advanced') && <EmptyLayer text="当前页面没有视觉控制项" />}
      </>
      )}

      {layer === 'motion' && (
      <details className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-border-primary dark:bg-background-secondary">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground-primary marker:hidden">
          <h3 className="text-sm font-semibold text-foreground-primary">页面动效</h3>
          <span className="text-base leading-none text-foreground-tertiary">+</span>
        </summary>
        <div className="space-y-3 pt-2">
          <div className="flex justify-end gap-1">
            <button
            type="button"
            aria-label="重新预览动效"
            title="重新预览动效"
            disabled={!slide.props.__animation || (
              String(animation.enter || 'none') === 'none'
              && String(animation.transition || 'none') === 'none'
              && String(animation.elementEnter || 'none') === 'none'
            )}
            onClick={() => setAnimationValue('replay', Date.now())}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-35"
          >
            <RotateCcw size={15} aria-hidden="true" />
            </button>
            <button
            type="button"
            aria-label="应用动效到全部页面"
            title="应用动效到全部页面"
            disabled={!onApplyAnimation || !slide.props.__animation}
            onClick={() => onApplyAnimation?.(structuredClone(animation))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Copy size={15} aria-hidden="true" />
            </button>
          </div>
          <section className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-border-primary dark:bg-background-primary/40">
            <h4 className="text-xs font-semibold text-foreground-primary">页面入场</h4>
            <SelectField
              label="进入效果"
              value={String(animation.enter || 'none')}
              options={[{ value: 'none', label: '无' }, { value: 'fade', label: '淡入' }, { value: 'slide-up', label: '上移淡入' }, { value: 'slide-down', label: '下移淡入' }, { value: 'slide-left', label: '左移淡入' }, { value: 'slide-right', label: '右移淡入' }, { value: 'zoom-in', label: '缩放淡入' }, { value: 'blur-in', label: '模糊淡入' }, { value: 'stagger-up', label: '元素错峰上移' }, { value: 'stagger-fade', label: '元素错峰淡入' }]}
              onChange={(enter) => setAnimationValue('enter', enter)}
            />
            <NumberField label="持续时间（毫秒）" value={Number(animation.duration || 420)} min={120} max={2000} step={20} onChange={(duration) => setAnimationValue('duration', duration)} />
            <NumberField label="入场延迟（毫秒）" value={Number(animation.delay || 0)} min={0} max={1500} step={20} onChange={(delay) => setAnimationValue('delay', delay)} />
            <SelectField label="缓动曲线" value={String(animation.easing || 'ease')} options={[{ value: 'linear', label: '线性' }, { value: 'ease', label: '平滑' }, { value: 'ease-out', label: '快速进入' }, { value: 'ease-in-out', label: '柔和往返' }]} onChange={(easing) => setAnimationValue('easing', easing)} />
          </section>

          <section className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-border-primary dark:bg-background-primary/40">
            <h4 className="text-xs font-semibold text-foreground-primary">元素动效</h4>
            <SelectField
              label="元素逐项进入"
              value={String(animation.elementEnter || 'none')}
              options={[{ value: 'none', label: '关闭' }, { value: 'fade', label: '淡入' }, { value: 'slide-up', label: '上移淡入' }, { value: 'slide-down', label: '下移淡入' }, { value: 'slide-left', label: '左移淡入' }, { value: 'slide-right', label: '右移淡入' }, { value: 'zoom-in', label: '缩放淡入' }, { value: 'blur-in', label: '模糊淡入' }, { value: 'wipe', label: '擦除进入' }, { value: 'rotate-in', label: '旋转进入' }]}
              onChange={(elementEnter) => setAnimationValue('elementEnter', elementEnter)}
            />
            <SelectField label="元素触发方式" value={String(animation.elementTrigger || 'auto')} options={[{ value: 'auto', label: '页面进入后自动' }, { value: 'click', label: '单击逐项播放' }]} onChange={(elementTrigger) => setAnimationValue('elementTrigger', elementTrigger)} />
            <NumberField label="元素动效时长（毫秒）" value={Number(animation.elementDuration || 360)} min={80} max={2000} step={20} onChange={(elementDuration) => setAnimationValue('elementDuration', elementDuration)} />
            <NumberField label="元素统一延迟（毫秒）" value={Number(animation.elementDelay || 0)} min={0} max={5000} step={20} onChange={(elementDelay) => setAnimationValue('elementDelay', elementDelay)} />
            <NumberField label="元素间隔（毫秒）" value={Number(animation.elementStagger || 70)} min={0} max={1000} step={10} onChange={(elementStagger) => setAnimationValue('elementStagger', elementStagger)} />
            <SelectField label="元素缓动曲线" value={String(animation.elementEasing || 'ease')} options={[{ value: 'linear', label: '线性' }, { value: 'ease', label: '平滑' }, { value: 'ease-out', label: '快速进入' }, { value: 'ease-in-out', label: '柔和往返' }]} onChange={(elementEasing) => setAnimationValue('elementEasing', elementEasing)} />
          </section>

          <section className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-border-primary dark:bg-background-primary/40">
            <h4 className="text-xs font-semibold text-foreground-primary">翻页播放</h4>
            <SelectField label="页面切换" value={String(animation.transition || 'none')} options={[{ value: 'none', label: '无' }, { value: 'cut', label: '瞬切' }, { value: 'fade', label: '淡化' }, { value: 'push', label: '推入' }, { value: 'wipe', label: '擦除' }, { value: 'split', label: '分割' }, { value: 'cover', label: '覆盖' }, { value: 'uncover', label: '揭开' }, { value: 'zoom', label: '缩放' }, { value: 'dissolve', label: '溶解' }]} onChange={(transition) => setAnimationValue('transition', transition)} />
            <SelectField label="切换速度" value={String(animation.transitionSpeed || 'med')} options={[{ value: 'slow', label: '慢' }, { value: 'med', label: '中' }, { value: 'fast', label: '快' }]} onChange={(transitionSpeed) => setAnimationValue('transitionSpeed', transitionSpeed)} />
            <SelectField label="切换方向" value={String(animation.transitionDirection || 'default')} options={[{ value: 'default', label: '默认' }, { value: 'l', label: '向左' }, { value: 'r', label: '向右' }, { value: 'u', label: '向上' }, { value: 'd', label: '向下' }]} onChange={(transitionDirection) => setAnimationValue('transitionDirection', transitionDirection)} />
            <NumberField label="自动翻页（秒，0 为手动）" value={Number(animation.advanceAfter || 0)} min={0} max={60} step={1} onChange={(advanceAfter) => setAnimationValue('advanceAfter', advanceAfter)} />
            <label className="flex items-center justify-between gap-3 text-xs text-foreground-secondary">
              <span>主题内部动效</span>
              <input aria-label="主题内部动效" type="checkbox" checked={animation.internal !== false} onChange={(event) => setAnimationValue('internal', event.target.checked)} />
            </label>
          </section>
        </div>
      </details>
      )}

      {layer === 'media' && (
      <>
      {mediaActions && contract.mediaSlots.length > 0 && (
        <details open className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/10">
          <summary className="cursor-pointer list-none text-sm font-semibold text-cyan-900 marker:hidden dark:text-cyan-100">图片内容<span className="float-right text-base leading-none">−</span></summary>
          {contract.mediaSlots.map((slot) => {
            const kind = mediaSlotKind(slot)
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
              return <MediaSlotEditor key={path} label={label} kind={kind} value={value} prompt={prompts[path] || ''} busy={mediaActions.busy[`${slide.pageId}:${path}`]} onPrompt={(prompt) => onChange({ ...slide.props, __media_prompts: { ...prompts, [path]: prompt } })} onGenerate={(prompt) => mediaActions.onGenerate(slot.key, itemIndex, prompt, Boolean(value))} onUpload={(file) => mediaActions.onUpload(slot.key, itemIndex, file)} onSelect={() => mediaActions.onSelect(slot.key, itemIndex)} onClear={() => onChange(setMediaValue(slide.props, slot.key, itemIndex, ''))} />
            })
          })}
        </details>
      )}
      {(!mediaActions || contract.mediaSlots.length === 0) && <EmptyLayer text="当前页面没有媒体槽" />}
      </>
      )}

      {layer === 'content' && (
      <>
      <details open className="group rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-border-primary dark:bg-background-secondary">
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground-primary marker:hidden">文字与数据<span className="float-right text-base leading-none text-foreground-tertiary transition-transform group-open:rotate-45">+</span></summary>
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
      </>
      )}
    </div>
  )
}

function EmptyLayer({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-foreground-secondary dark:border-border-primary dark:bg-background-secondary/70">
      {text}
    </div>
  )
}

function groupControls(controls: NativeControl[], values: Record<string, unknown>) {
  const groups: Record<NativeControlGroupKey, NativeControl[]> = { structure: [], visual: [], advanced: [] }
  for (const control of controls) groups[classifyControl(control, values)].push(control)
  const labels: Record<NativeControlGroupKey, string> = { structure: '结构', visual: '视觉', advanced: '设计调节' }
  return (Object.keys(groups) as NativeControlGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, label: labels[key], controls: groups[key] }))
}

function nativeDesignIntent(value: unknown): NativeDesignIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const pagePlan = item.page_plan && typeof item.page_plan === 'object' && !Array.isArray(item.page_plan)
    ? item.page_plan as Record<string, unknown>
    : {}
  const qualityReport = item.quality_report && typeof item.quality_report === 'object' && !Array.isArray(item.quality_report)
    ? item.quality_report as Record<string, unknown>
    : null
  const intent: NativeDesignIntent = {
    visual_direction: textValue(item.visual_direction),
    narrative_role: textValue(item.narrative_role),
    media_strategy: textValue(item.media_strategy),
    content_signals: Array.isArray(item.content_signals) ? item.content_signals.map(textValue).filter(Boolean).slice(0, 6) : [],
    page_plan: {
      information_focus: textValue(pagePlan.information_focus),
      composition: textValue(pagePlan.composition),
      media_direction: textValue(pagePlan.media_direction),
      motion_direction: textValue(pagePlan.motion_direction),
    },
    quality_report: qualityReport ? {
      status: textValue(qualityReport.status),
      score: typeof qualityReport.score === 'number' ? qualityReport.score : 0,
      outline_coverage: typeof qualityReport.outline_coverage === 'number' ? qualityReport.outline_coverage : 0,
      issues: Array.isArray(qualityReport.issues) ? qualityReport.issues.map(textValue).filter(Boolean) : [],
    } : undefined,
  }
  return intent.visual_direction || intent.narrative_role || intent.media_strategy || intent.content_signals.length || intent.quality_report || Object.values(intent.page_plan).some(Boolean) ? intent : null
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function IntentLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/75 px-2.5 py-2 dark:bg-background-secondary/70">
      <span className="mb-0.5 block text-[11px] font-semibold text-cyan-800 dark:text-cyan-200">{label}</span>
      <p className="text-xs leading-5 text-foreground-secondary">{value}</p>
    </div>
  )
}

function qualityIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    consecutive_layout_repeat: '连续布局重复',
    low_outline_coverage: '大纲覆盖不足',
    missing_required_media: '缺少必要图片',
    overloaded_page: '页面内容过多',
    duplicated_list_content: '列表内容重复',
    generation_fallback: '使用回退页面',
  }
  return labels[issue] || issue
}

function classifyControl(control: NativeControl, values: Record<string, unknown>): NativeControlGroupKey {
  const text = `${control.key || ''} ${control.publicKey || ''} ${control.label || ''} ${control.type || ''}`.toLowerCase()
  if (control.type === 'color' || control.type === 'palette') return 'visual'
  if (control.type === 'toggle' || control.type === 'boolean' || control.type === 'focus' || control.type === 'range' || control.type === 'slider' || control.type === 'number') return 'structure'
  if (/palette|color|scheme|accent|style|theme|gradient|background|bg|visual|brand|配色|色彩|颜色|强调模式|背景|明暗|视觉|风格|方案/.test(text)) return 'visual'
  if (/count|density|layout|chart|show|hide|index|row|column|module|card|image|video|focus|highlight|数量|密度|布局|图表|显示|隐藏|序号|行|列|模块|卡片|图片|视频|重点|强调/.test(text)) return 'structure'
  const value = values[control.publicKey || control.key]
  if (typeof value === 'number' || typeof value === 'boolean') return 'structure'
  return 'advanced'
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

type NativeMediaKind = 'image' | 'video'

function MediaSlotEditor({ label, kind, value, prompt: initialPrompt, busy, onPrompt, onGenerate, onUpload, onSelect, onClear }: {
  label: string; kind: NativeMediaKind; value: string; prompt: string; busy?: string
  onPrompt: (prompt: string) => void; onGenerate: (prompt: string) => void
  onUpload: (file: File) => void; onSelect: () => void; onClear: () => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const accept = kind === 'video' ? 'video/*' : 'image/*'
  const mediaLabel = kind === 'video' ? '视频' : '图片'
  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.type && !file.type.startsWith(`${kind}/`)) return
    onUpload(file)
  }
  return (
    <div
      aria-label={`${label} 媒体槽`}
      className={`space-y-2 rounded-md border p-3 transition ${dragging ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200 dark:bg-cyan-950/20' : 'border-border-primary'}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        handleFile(event.dataTransfer.files?.[0])
      }}
    >
      {value ? (
        isVideoValue(value) || kind === 'video'
          ? <video src={getImageUrl(value)} className="aspect-video w-full rounded-md bg-background-primary object-cover" muted playsInline controls />
          : <img src={getImageUrl(value)} alt={label} className="aspect-video w-full rounded-md bg-background-primary object-cover" />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md bg-background-primary text-xs text-foreground-secondary">
          <Upload size={16} aria-hidden="true" />
          <span>拖拽或上传{mediaLabel}</span>
        </div>
      )}
      {kind === 'image' && <textarea aria-label={`${label} 图片要求`} rows={2} value={prompt} onChange={(event) => { setPrompt(event.target.value); onPrompt(event.target.value) }} placeholder="描述主体、构图或修改要求" className="w-full resize-y rounded-md border border-border-primary bg-background-elevated px-2 py-1.5 text-xs" />}
      {busy && <p role="status" className="text-xs text-cyan-600">{busy}</p>}
      <div className="grid grid-cols-4 gap-1">
        <MediaButton label={`${value ? '修改' : '生成'} ${label}`} disabled={kind !== 'image' || Boolean(busy)} onClick={() => onGenerate(prompt)}><Sparkles size={14} /></MediaButton>
        <MediaButton label={`上传替换 ${label}`} onClick={() => inputRef.current?.click()}><Upload size={14} /></MediaButton>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = '' }} />
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

function mediaSlotKind(slot: Record<string, unknown>): NativeMediaKind {
  const raw = String(slot.kind || slot.type || slot.mediaType || '').toLowerCase()
  return raw.includes('video') ? 'video' : 'image'
}

function isVideoValue(value: string) {
  return /^data:video\//.test(value) || /\.(mp4|m4v|mov|webm|ogv)(?:[?#].*)?$/i.test(value)
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
  if (control.showIf && !values[control.showIf]) return false
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

function displayRoleLabel(role: string) {
  const labels: Record<string, string> = {
    cover: '封面',
    content: '内容',
    agenda: '目录',
    process: '流程',
    comparison: '对比',
    data: '数据',
    image: '图文',
    case: '案例',
    end: '结束',
    closing: '结束',
  }
  return labels[role] || role
}
