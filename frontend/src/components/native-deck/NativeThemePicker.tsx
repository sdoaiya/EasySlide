import { useState } from 'react'
import { Check, ImageOff } from 'lucide-react'
import { getStaticAssetUrl } from '@/api/client'
import { dashiThemes } from '@/native-deck/dashiThemes'

type NativeThemePickerProps = {
  value: string
  onChange: (value: typeof dashiThemes[number]['value']) => void
  disabled?: boolean
}

export function NativeThemePicker({ value, onChange, disabled = false }: NativeThemePickerProps) {
  const theme = dashiThemes.find((item) => item.value === value) ?? dashiThemes[0]
  const [failedPreview, setFailedPreview] = useState('')
  const previewUrl = getStaticAssetUrl(theme.preview)

  return (
    <section className="space-y-3" aria-label="原生主题设置">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
        <div role="radiogroup" aria-label="原生主题" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dashiThemes.map((item) => {
            const selected = item.value === value
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={item.label}
                disabled={disabled}
                onClick={() => onChange(item.value)}
                className={`flex min-h-12 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-cyan-500 bg-cyan-50 font-semibold text-cyan-950 dark:border-cyan-400 dark:bg-cyan-950/30 dark:text-cyan-100' : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 dark:border-border-primary dark:bg-background-elevated dark:text-foreground-secondary'}`}
              >
                <span>{item.label}</span>
                {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-cyan-600 dark:text-cyan-300" />}
              </button>
            )
          })}
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-border-primary dark:bg-background-elevated">
          <div className="relative aspect-video bg-slate-100 dark:bg-background-tertiary">
            {failedPreview === theme.preview ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-500 dark:text-foreground-tertiary">
                <ImageOff size={24} aria-hidden="true" />
                <span className="text-sm font-medium">{theme.label}</span>
              </div>
            ) : (
              <img src={previewUrl} alt={`${theme.label}主题预览`} onError={() => setFailedPreview(theme.preview)} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="space-y-2 p-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground-primary">{theme.label}</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-foreground-secondary">{theme.description}</p>
            <p className="text-xs text-slate-500 dark:text-foreground-tertiary"><span className="font-medium text-slate-700 dark:text-foreground-secondary">适用场景：</span>{theme.useCases}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
