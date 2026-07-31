import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { NativeImageSettings } from '@/types'
import { ExportDirectorySetting } from '@/components/shared/ExportDirectorySetting'

type PageOption = { pageId: string; title: string; maxImages: number }

export function NativeImageSettingsDialog({ open, settings, pages, saving = false, onClose, onSave }: {
  open: boolean
  settings: NativeImageSettings
  pages: PageOption[]
  saving?: boolean
  onClose: () => void
  onSave: (settings: NativeImageSettings) => void
}) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => { if (open) setDraft(settings) }, [open, settings])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--app-surface)]/80 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="native-image-settings-title" className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-elevated)]">
        <header className="flex items-center justify-between border-b border-[var(--app-border)] px-5 py-4">
          <div>
            <h2 id="native-image-settings-title" className="text-base font-semibold text-[var(--app-text)]">图片生成设置</h2>
            <p className="mt-1 text-xs text-[var(--app-text-secondary)]">仅为空图片槽生成，已有图片不会被覆盖，并发上限为 4。</p>
          </div>
          <button type="button" aria-label="关闭图片生成设置" title="关闭" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)]"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--app-text)]">图片生成密度</span>
            <select aria-label="图片生成密度" value={draft.density} onChange={(event) => setDraft({ ...draft, density: event.target.value as NativeImageSettings['density'] })} className="h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)]">
              <option value="sparse">精简：封面、章节和重点页面</option>
              <option value="standard">标准：每个内容页 1 张</option>
              <option value="rich">丰富：填满模板支持的图片槽</option>
              <option value="custom">自定义：逐页指定数量</option>
            </select>
          </label>

          <ExportDirectorySetting />

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--app-text)]">图片风格</span>
            <select aria-label="图片风格" value={draft.style} onChange={(event) => setDraft({ ...draft, style: event.target.value as NativeImageSettings['style'] })} className="h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)]">
              <option value="theme">跟随页面主题</option>
              <option value="photo">写实摄影</option>
              <option value="3d">3D 插画</option>
              <option value="flat">扁平插画</option>
              <option value="tech">科技概念</option>
              <option value="custom">自定义描述</option>
            </select>
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--app-text)]">主体构图</span>
            <select aria-label="图片主体构图" value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value as NativeImageSettings['composition'] })} className="h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)]">
              <option value="auto">自动：根据页面版式决定</option>
              <option value="center">主体居中</option>
              <option value="text-left">主体靠右，左侧留白</option>
              <option value="text-right">主体靠左，右侧留白</option>
              <option value="full-bleed">全画面铺满</option>
            </select>
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-[var(--app-text)]">补充生成要求</span>
            <textarea aria-label="补充生成要求" rows={3} maxLength={2000} value={draft.custom_prompt} onChange={(event) => setDraft({ ...draft, custom_prompt: event.target.value })} placeholder="例如：主体靠右，左侧为标题留白，不生成文字或水印" className="w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2 text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)]" />
          </label>

          {draft.density === 'custom' && (
            <section className="space-y-3 border-t border-[var(--app-border)] pt-4">
              <h3 className="text-sm font-medium text-[var(--app-text)]">逐页图片数量</h3>
              {pages.map((page) => (
                <label key={page.pageId} className="flex items-center justify-between gap-4 text-sm text-[var(--app-text-secondary)]">
                  <span className="min-w-0 truncate">{page.title}</span>
                  <input aria-label={`${page.title}图片数量`} type="number" min={0} max={page.maxImages} value={draft.custom_counts[page.pageId] ?? 0} onChange={(event) => setDraft({ ...draft, custom_counts: { ...draft.custom_counts, [page.pageId]: Math.max(0, Math.min(page.maxImages, Number(event.target.value) || 0)) } })} className="h-9 w-20 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-2 text-right text-[var(--app-text)]" />
                </label>
              ))}
            </section>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--app-border)] px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-[var(--app-border)] px-4 text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">取消</button>
          <button type="button" aria-label="保存图片生成设置" disabled={saving} onClick={() => onSave(draft)} className="h-10 rounded-md bg-[var(--app-primary-action)] px-4 text-sm font-medium text-[var(--app-surface)] hover:bg-[var(--app-primary-action-hover)] disabled:opacity-50">{saving ? '保存中...' : '保存设置'}</button>
        </footer>
      </div>
    </div>
  )
}
