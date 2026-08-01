import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Download,
  Image as ImageIcon,
  Link2,
  Mic2,
  Play,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Textarea } from '@/components/shared';
import { MaterialSelector } from '@/components/shared/MaterialSelector';
import {
  exportPodcastWorkspace,
  previewPodcastWorkspace,
  updateContentWorkspace,
  type Material,
} from '@/api/endpoints';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar';
import type { ProjectWorkspace } from '@/types';
import { WorkspaceVersionHistory } from './WorkspaceVersionHistory';
import { useExportTasksStore } from '@/store/useExportTasksStore';

type AudioCue = {
  cue_id: string;
  kind: 'bgm' | 'sfx';
  asset_ref: string;
  offset_ms: number;
  gain_db: number;
};
type Segment = {
  segment_id: string;
  speaker_id: string;
  text: string;
  locked: boolean;
  audio_cues: AudioCue[];
  source_ref?: string | null;
  source_kind?: string | null;
};
type PodcastSpeaker = { speaker_id: string; name: string; voice_ref: string };
type PodcastMixing = { bgm_asset_ref: string | null; ducking: boolean; fade_in_ms: number; fade_out_ms: number };
type PodcastCover = { asset_ref: string | null; title: string; subtitle: string };
type PodcastDocument = {
  schema_version: 1;
  title: string;
  format: 'single' | 'dialogue';
  language: string;
  speakers: PodcastSpeaker[];
  segments: Segment[];
  mixing: PodcastMixing;
  cover: PodcastCover;
};
type PodcastPreview = {
  audio_url: string;
  provider: 'edge' | 'fish_audio';
  timing_quality: string;
  cache_hit: boolean;
};

const DEFAULT_VOICE = 'edge:zh-CN-XiaoxiaoNeural';

function normalizeDocument(raw: Record<string, any> | null | undefined): PodcastDocument {
  const source = raw || {};
  const format = source.format === 'dialogue' ? 'dialogue' : 'single';
  const speakers = (Array.isArray(source.speakers) ? source.speakers : []).map((speaker: any, index: number) => ({
    speaker_id: String(speaker?.speaker_id || `speaker.${index + 1}`),
    name: String(speaker?.name || `角色 ${index + 1}`),
    voice_ref: String(speaker?.voice_ref || DEFAULT_VOICE),
  }));
  if (speakers.length === 0) speakers.push({ speaker_id: 'speaker.main', name: '主持人', voice_ref: DEFAULT_VOICE });
  if (format === 'dialogue' && speakers.length === 1) speakers.push({ speaker_id: 'speaker.guest', name: '嘉宾', voice_ref: DEFAULT_VOICE });
  return {
    schema_version: 1,
    title: String(source.title || '未命名播客'),
    format,
    language: String(source.language || 'zh-CN'),
    speakers: speakers.slice(0, format === 'single' ? 1 : 4),
    segments: (Array.isArray(source.segments) ? source.segments : []).map((segment: any, index: number) => ({
      segment_id: String(segment?.segment_id || `segment.${index + 1}`),
      speaker_id: String(segment?.speaker_id || speakers[0].speaker_id),
      text: String(segment?.text || ''),
      locked: Boolean(segment?.locked),
      audio_cues: Array.isArray(segment?.audio_cues) ? segment.audio_cues.map((cue: any, cueIndex: number) => ({
        cue_id: String(cue?.cue_id || `cue.${index + 1}.${cueIndex + 1}`),
        kind: cue?.kind === 'bgm' ? 'bgm' : 'sfx',
        asset_ref: String(cue?.asset_ref || ''),
        offset_ms: Number(cue?.offset_ms || 0),
        gain_db: Number(cue?.gain_db || 0),
      })) : [],
      source_ref: segment?.source_ref ?? null,
      source_kind: segment?.source_kind ?? null,
    })),
    mixing: {
      bgm_asset_ref: source.mixing?.bgm_asset_ref ?? null,
      ducking: source.mixing?.ducking !== false,
      fade_in_ms: Number(source.mixing?.fade_in_ms ?? 500),
      fade_out_ms: Number(source.mixing?.fade_out_ms ?? 500),
    },
    cover: {
      asset_ref: source.cover?.asset_ref ?? null,
      title: String(source.cover?.title || source.title || '未命名播客'),
      subtitle: String(source.cover?.subtitle || ''),
    },
  };
}

const PodcastSegmentRailItem = memo(function PodcastSegmentRailItem({
  segment,
  index,
  selected,
  onSelect,
}: {
  segment: Segment;
  index: number;
  selected: boolean;
  onSelect: (segmentId: string) => void;
}) {
  const renderCount = useRef(0);
  renderCount.current += 1;
  return (
    <button
      type="button"
      data-testid={`podcast-segment-rail-${segment.segment_id}`}
      data-render-count={import.meta.env.MODE === 'test' ? renderCount.current : undefined}
      onClick={() => onSelect(segment.segment_id)}
      className={`w-full rounded-[var(--app-radius-control)] border px-3 py-2 text-left ${selected ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]' : 'border-transparent hover:bg-[var(--app-surface-hover)]'}`}
    >
      <span className="text-[11px] text-[var(--app-text-tertiary)]">片段 {index + 1}</span>
      <span className="mt-0.5 block truncate text-sm font-medium">{segment.text || '未填写脚本'}</span>
    </button>
  );
});

export function PodcastWorkspace({ projectId, workspace, onChanged }: { projectId: string; spineRevision: number; workspace: ProjectWorkspace; onChanged: () => void }) {
  const [document, setDocument] = useState(() => normalizeDocument(workspace.document));
  const loadedRevision = useRef(workspace.revision);
  const [selectedId, setSelectedId] = useState(document.segments[0]?.segment_id || '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'sync' | 'export' | null>(null);
  const [message, setMessage] = useState('');
  const [materialTarget, setMaterialTarget] = useState<'segment-source' | 'segment-sfx' | 'bgm' | 'cover' | null>(null);
  const [previewProvider, setPreviewProvider] = useState<'edge' | 'fish_audio'>('edge');
  const [previewSpeed, setPreviewSpeed] = useState(1);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState<PodcastPreview | null>(null);
  const { addTask, pollTask } = useExportTasksStore();

  useEffect(() => {
    if (loadedRevision.current === workspace.revision) return;
    loadedRevision.current = workspace.revision;
    const next = normalizeDocument(workspace.document);
    setDocument((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setSelectedId((current) => next.segments.some((segment) => segment.segment_id === current) ? current : next.segments[0]?.segment_id || '');
    setDirty(false);
    setPreview(null);
    setPreviewError('');
  }, [workspace.document, workspace.revision]);

  useEffect(() => () => {
    if (preview?.audio_url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(preview.audio_url);
    }
  }, [preview?.audio_url]);

  const selected = useMemo(() => document.segments.find((segment) => segment.segment_id === selectedId), [document.segments, selectedId]);
  const selectedSpeaker = useMemo(() => document.speakers.find((speaker) => speaker.speaker_id === selected?.speaker_id), [document.speakers, selected?.speaker_id]);
  const preflight = useMemo(() => {
    const checks = [
      { label: '至少一个非空片段', ok: document.segments.some((segment) => String(segment.text || '').trim().length > 0), optional: false },
      { label: '每位角色已配置声音', ok: document.speakers.every((speaker) => String(speaker.voice_ref || '').trim().length > 0), optional: false },
      { label: '音效引用完整', ok: document.segments.every((segment) => (segment.audio_cues || []).every((cue) => String(cue.asset_ref || '').trim().length > 0)), optional: false },
      { label: '背景音乐', ok: Boolean(document.mixing.bgm_asset_ref), optional: true },
      { label: '封面', ok: Boolean(document.cover.asset_ref), optional: true },
    ];
    return { checks, canExport: checks.filter((check) => !check.optional).every((check) => check.ok) };
  }, [document]);

  const markDirty = () => {
    setDirty(true);
    setMessage('');
    setPreviewError('');
  };
  const updateDocument = (patch: Partial<PodcastDocument>) => {
    setDocument((current) => normalizeDocument({ ...current, ...patch }));
    markDirty();
  };
  const updateSelected = (patch: Partial<Segment>) => {
    setDocument((current) => ({ ...current, segments: current.segments.map((segment) => segment.segment_id === selectedId ? { ...segment, ...patch } : segment) }));
    markDirty();
  };
  const handleMaterialSelect = (materials: Material[]) => {
    const material = materials[0];
    if (!material) return;
    const assetRef = material.id || material.url;
    if (!assetRef) return;
    if (materialTarget === 'bgm') {
      updateDocument({ mixing: { ...document.mixing, bgm_asset_ref: assetRef } });
    } else if (materialTarget === 'cover') {
      updateDocument({ cover: { ...document.cover, asset_ref: assetRef } });
    } else if (materialTarget === 'segment-source' && selected) {
      updateSelected({ source_ref: material.url, source_kind: material.media_kind || 'audio' });
    } else if (materialTarget === 'segment-sfx' && selected) {
      updateSelected({
        audio_cues: [...selected.audio_cues, {
          cue_id: `cue.${Date.now()}`,
          kind: 'sfx',
          asset_ref: assetRef,
          offset_ms: 0,
          gain_db: -8,
        }],
      });
    }
    setMaterialTarget(null);
  };
  const save = async () => {
    setBusy('save'); setMessage('');
    try {
      await updateContentWorkspace(projectId, 'podcast', workspace.revision, document as unknown as Record<string, unknown>, workspace.settings);
      setDirty(false); setMessage('已保存新版本'); onChanged();
    } catch (cause: any) { setMessage(cause?.response?.data?.error?.message || cause.message); } finally { setBusy(null); }
  };
  const exportAudio = async (format: 'mp3' | 'wav') => {
    setBusy('export'); setMessage('');
    try {
      const response = await exportPodcastWorkspace(projectId, { format });
      const taskId = response.data?.task_id || '';
      if (!taskId) throw new Error('导出任务创建失败');
      const taskKey = `podcast-export-${taskId}`;
      addTask({
        id: taskKey,
        taskId,
        projectId,
        type: 'podcast',
        status: 'PENDING',
        progress: { total: 100, completed: 0, percent: 0, current_step: '等待播客渲染', format, workspace_version_id: workspace.current_version_id ?? undefined },
      });
      setMessage(`已提交导出任务 ${taskId}`.trim());
      void pollTask(taskKey, projectId, taskId);
    } catch (cause: any) { setMessage(cause?.response?.data?.error?.message || cause.message); } finally { setBusy(null); }
  };
  const previewAudio = async () => {
    if (dirty) { setPreviewError('试听前请先保存当前版本'); return; }
    if (!selected) return;
    setPreviewBusy(true); setPreviewError('');
    try {
      const response = await previewPodcastWorkspace(projectId, { provider: previewProvider, segmentId: selected.segment_id, voice: selectedSpeaker?.voice_ref, speed: previewSpeed });
      if (!response.data) throw new Error('试听任务没有返回音频');
      setPreview(response.data);
    } catch (cause: any) {
      setPreviewError(cause?.response?.data?.error?.message || cause.message || '试听失败');
    } finally { setPreviewBusy(false); }
  };

  const inspector = (
    <div className="space-y-4 overflow-y-auto p-4">
      <section aria-label="节目设置" className="space-y-3 border-b border-[var(--app-border)] pb-4">
        <div className="flex items-center gap-2"><Mic2 size={15} aria-hidden="true" /><h3 className="text-xs font-semibold">节目设置</h3></div>
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)]">
            {document.cover.asset_ref ? <img src={document.cover.asset_ref} alt="播客封面" className="h-full w-full object-cover" /> : <ImageIcon size={22} className="text-[var(--app-text-tertiary)]" aria-hidden="true" />}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2"><span className="truncate text-xs text-[var(--app-text-secondary)]">{document.cover.asset_ref || '未选择封面'}</span><Button size="sm" variant="secondary" aria-label="选择封面" icon={<ImageIcon size={14} />} onClick={() => setMaterialTarget('cover')}>选择</Button></div>
            <input aria-label="封面标题" value={document.cover.title} onChange={(event) => updateDocument({ cover: { ...document.cover, title: event.target.value } })} className="h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" placeholder="封面标题" />
            <input aria-label="封面副标题" value={document.cover.subtitle} onChange={(event) => updateDocument({ cover: { ...document.cover, subtitle: event.target.value } })} className="h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" placeholder="封面副标题" />
          </div>
        </div>
        <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
          <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-[var(--app-text-secondary)]"><AudioLines size={14} aria-hidden="true" />{document.mixing.bgm_asset_ref || '未选择背景音乐'}</span><div className="flex gap-1"><Button size="sm" variant="secondary" aria-label="选择背景音乐" onClick={() => setMaterialTarget('bgm')}>选择</Button>{document.mixing.bgm_asset_ref && <Button size="sm" variant="ghost" aria-label="移除背景音乐" icon={<Trash2 size={14} />} onClick={() => updateDocument({ mixing: { ...document.mixing, bgm_asset_ref: null } })}><span className="sr-only">移除</span></Button>}</div></div>
          <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={document.mixing.ducking} onChange={(event) => updateDocument({ mixing: { ...document.mixing, ducking: event.target.checked } })} />旁白时自动压低背景音乐</label>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[11px] text-[var(--app-text-secondary)]">淡入(ms)<input type="number" min={0} step={100} value={document.mixing.fade_in_ms} onChange={(event) => updateDocument({ mixing: { ...document.mixing, fade_in_ms: Math.max(0, Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" /></label><label className="text-[11px] text-[var(--app-text-secondary)]">淡出(ms)<input type="number" min={0} step={100} value={document.mixing.fade_out_ms} onChange={(event) => updateDocument({ mixing: { ...document.mixing, fade_out_ms: Math.max(0, Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" /></label></div>
        </div>
        <div className="space-y-2"><p className="text-[11px] font-medium text-[var(--app-text-secondary)]">声音设置</p>{document.speakers.map((speaker) => <label key={speaker.speaker_id} className="grid gap-1 text-[11px] text-[var(--app-text-secondary)]"><span>{speaker.name}</span><input aria-label={`${speaker.name}声音`} value={speaker.voice_ref} onChange={(event) => updateDocument({ speakers: document.speakers.map((item) => item.speaker_id === speaker.speaker_id ? { ...item, voice_ref: event.target.value } : item) })} className="h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" placeholder="edge:voice 或 fish:voice-id" /></label>)}</div>
      </section>

      {selected && <section aria-label="片段设置" className="space-y-3 border-b border-[var(--app-border)] pb-4">
        <label className="block text-xs font-medium">角色<select value={selected.speaker_id} onChange={(event) => updateSelected({ speaker_id: event.target.value })} className="mt-1.5 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">{document.speakers.map((speaker) => <option key={speaker.speaker_id} value={speaker.speaker_id}>{speaker.name}</option>)}</select></label>
        <label className="block text-xs font-medium">脚本<Textarea value={selected.text} rows={7} onChange={(event) => updateSelected({ text: event.target.value })} /></label>
        <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-secondary)]"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">素材：{selected.source_ref || '未选择'}</span><Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => setMaterialTarget('segment-source')}>选择素材</Button></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-medium">音效 ({selected.audio_cues.length})</p><Button size="sm" variant="secondary" icon={<AudioLines size={14} />} onClick={() => setMaterialTarget('segment-sfx')}>添加音效</Button></div>{selected.audio_cues.map((cue, index) => <div key={cue.cue_id} className="grid grid-cols-[minmax(0,1fr)_64px_64px_28px] items-end gap-1.5 rounded-[var(--app-radius-control)] border border-[var(--app-border)] p-2"><span className="min-w-0 truncate text-[10px] text-[var(--app-text-tertiary)]" title={cue.asset_ref}>{cue.asset_ref}</span><label className="text-[10px] text-[var(--app-text-secondary)]">位置<input aria-label={`音效${index + 1}位置`} type="number" min={0} step={100} value={cue.offset_ms} onChange={(event) => updateSelected({ audio_cues: selected.audio_cues.map((item) => item.cue_id === cue.cue_id ? { ...item, offset_ms: Math.max(0, Number(event.target.value)) } : item) })} className="mt-1 h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-1 text-[10px]" /></label><label className="text-[10px] text-[var(--app-text-secondary)]">增益<input aria-label={`音效${index + 1}增益`} type="number" min={-60} max={12} step={1} value={cue.gain_db} onChange={(event) => updateSelected({ audio_cues: selected.audio_cues.map((item) => item.cue_id === cue.cue_id ? { ...item, gain_db: Number(event.target.value) } : item) })} className="mt-1 h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-1 text-[10px]" /></label><Button size="sm" variant="ghost" aria-label={`移除音效 ${index + 1}`} icon={<Trash2 size={13} />} onClick={() => updateSelected({ audio_cues: selected.audio_cues.filter((item) => item.cue_id !== cue.cue_id) })}><span className="sr-only">移除</span></Button></div>)}</div>
        <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={selected.locked} onChange={(event) => updateSelected({ locked: event.target.checked })} />锁定片段</label>
      </section>}

      <section aria-label="试听与混音预检" className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">试听与混音预检</h3><span className={`text-[11px] font-medium ${preflight.canExport ? 'text-[var(--app-success)]' : 'text-[var(--app-error)]'}`}>{preflight.canExport ? '可导出' : '需处理'}</span></div>
        <div className="space-y-1.5">{preflight.checks.map((check) => <div key={check.label} className="flex items-center gap-2 text-[11px] text-[var(--app-text-secondary)]">{check.ok ? <Check size={13} className="text-[var(--app-success)]" aria-hidden="true" /> : check.optional ? <span className="w-[13px] text-center text-[var(--app-text-tertiary)]">-</span> : <X size={13} className="text-[var(--app-error)]" aria-hidden="true" />}<span>{check.label}{check.optional && !check.ok ? '（可选）' : ''}</span></div>)}</div>
        <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-[var(--app-text-secondary)]">试听引擎<select value={previewProvider} onChange={(event) => setPreviewProvider(event.target.value as 'edge' | 'fish_audio')} className="mt-1 h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs"><option value="edge">Edge</option><option value="fish_audio">Fish Audio</option></select></label><label className="text-[11px] text-[var(--app-text-secondary)]">语速<input type="number" min={0.5} max={2} step={0.1} value={previewSpeed} onChange={(event) => setPreviewSpeed(Math.max(0.5, Math.min(2, Number(event.target.value) || 1)))} className="mt-1 h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-xs" /></label></div>
        <Button type="button" className="w-full" icon={<Play size={15} />} disabled={dirty || !selected || previewBusy} loading={previewBusy} onClick={() => void previewAudio()}>试听当前片段</Button>
        {previewError && <p role="alert" className="text-xs text-[var(--app-error)]">{previewError}</p>}
        {preview && <div aria-live="polite" className="space-y-1 border-t border-[var(--app-border)] pt-3 text-xs text-[var(--app-text-secondary)]"><p>{preview.provider} · {preview.timing_quality}{preview.cache_hit ? ' · 命中缓存' : ''}</p><audio aria-label="试听音频" className="w-full" controls src={preview.audio_url} /></div>}
      </section>
      <WorkspaceVersionHistory projectId={projectId} kind="podcast" revision={workspace.revision} onRestored={onChanged} />
    </div>
  );

  return <WorkspaceShell
    className="h-full"
    sidebarWidth="216px"
    inspectorWidth="320px"
    toolbar={<div className="flex h-full min-w-0 items-center gap-3"><Mic2 size={17} className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate text-sm font-semibold">{document.title}</span><span className="shrink-0 text-xs text-[var(--app-text-tertiary)]">R{workspace.revision}</span><div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2"><Button className="whitespace-nowrap" size="sm" variant="secondary" icon={<Download size={15} />} loading={busy === 'export'} disabled={dirty || busy !== null || !preflight.canExport} onClick={() => void exportAudio('mp3')}>导出 MP3</Button><Button className="whitespace-nowrap" size="sm" variant="secondary" icon={<Download size={15} />} loading={busy === 'export'} disabled={dirty || busy !== null || !preflight.canExport} onClick={() => void exportAudio('wav')}>导出 WAV</Button><Button className="whitespace-nowrap" size="sm" icon={<Save size={15} />} loading={busy === 'save'} disabled={!dirty || busy !== null} onClick={() => void save()}>保存版本</Button></div></div>}
    sidebar={<div className="flex h-full min-h-0 flex-col"><p className="px-3 pb-2 text-xs font-medium text-[var(--app-text-tertiary)]">片段 · {document.segments.length}</p><div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">{document.segments.map((segment, index) => <PodcastSegmentRailItem key={segment.segment_id} segment={segment} index={index} selected={selectedId === segment.segment_id} onSelect={setSelectedId} />)}</div></div>}
    inspector={inspector}
    statusBar={<WorkspaceStatusBar>{message || (dirty ? '有未保存修改' : preflight.canExport ? '混音预检通过，可导出' : '请处理混音预检中的阻塞项')}</WorkspaceStatusBar>}
  >
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[var(--app-canvas)] p-6"><article className="w-full max-w-3xl overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)]"><div className="flex items-start gap-5 border-b border-[var(--app-border)] p-8">{document.cover.asset_ref && <img src={document.cover.asset_ref} alt="播客封面" className="h-24 w-24 rounded-[var(--app-radius-control)] object-cover" />}<div className="min-w-0"><p className="text-xs text-[var(--app-text-tertiary)]">{selectedSpeaker?.name || '未选择片段'}</p><h1 className="mt-2 text-2xl font-semibold">{document.cover.title || document.title}</h1>{document.cover.subtitle && <p className="mt-1 text-sm text-[var(--app-text-secondary)]">{document.cover.subtitle}</p>}</div></div><div className="p-8"><p className="whitespace-pre-wrap text-lg leading-8">{selected?.text || '暂无片段'}</p>{selected?.source_ref && <p className="mt-4 truncate text-xs text-[var(--app-text-tertiary)]">素材：{selected.source_ref}</p>}</div></article></div>
    <MaterialSelector projectId={projectId} isOpen={materialTarget !== null} onClose={() => setMaterialTarget(null)} onSelect={handleMaterialSelect} multiple={false} maxSelection={1} mediaKindFilter={materialTarget === 'cover' ? ['image'] : materialTarget === 'segment-source' ? ['audio', 'transcript'] : ['audio']} />
  </WorkspaceShell>;
}
