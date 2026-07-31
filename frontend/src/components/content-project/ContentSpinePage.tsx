import { CheckCircle2 } from 'lucide-react';
import { Button, Loading } from '@/components/shared';
import { useContentProjectStore } from '@/store/useContentProjectStore';

export function ContentSpinePage() {
  const { project, loading, confirmSpine } = useContentProjectStore();
  if (!project) return <Loading fullscreen message="正在读取内容主线" />;
  const { spine } = project;
  const document = spine.document || {};
  const sections = Array.isArray(document.sections) ? document.sections : [];

  return (
    <main className="h-full overflow-auto px-8 py-7">
      <header className="flex items-start justify-between gap-6 border-b border-[var(--app-border)] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">Content Spine · R{spine.revision}</p>
          <h1 className="mt-2 text-2xl font-semibold">{document.topic?.value || '内容主线'}</h1>
          <p className="mt-2 text-sm text-[var(--app-text-secondary)]">受众：{document.audience?.value || '待补充'} · 目标：{document.goal?.value || '待补充'}</p>
        </div>
        {spine.status === 'confirmed' ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--app-success)]"><CheckCircle2 size={16} />已确认</span>
        ) : (
          <Button size="sm" loading={loading} onClick={() => void confirmSpine()}>确认内容主线</Button>
        )}
      </header>
      <section className="py-6">
        <h2 className="text-sm font-semibold">叙事结构</h2>
        <div className="mt-3 divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
          {sections.length ? sections.map((section: any, index: number) => (
            <article key={section.id || index} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-4">
              <span className="text-xs tabular-nums text-[var(--app-text-tertiary)]">{String(index + 1).padStart(2, '0')}</span>
              <div><h3 className="text-sm font-medium">{section.title}</h3><p className="mt-1 text-sm leading-6 text-[var(--app-text-secondary)]">{section.summary || '待补充摘要'}</p></div>
            </article>
          )) : <p className="py-8 text-sm text-[var(--app-text-secondary)]">内容主线尚无章节。</p>}
        </div>
      </section>
    </main>
  );
}
