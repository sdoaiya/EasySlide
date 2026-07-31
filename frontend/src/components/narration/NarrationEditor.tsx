import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { Button, Textarea } from '@/components/shared';

export type NarrationEditorMode = 'single' | 'dialogue';

export interface NarrationEditorSpeaker {
  id: string;
  name: string;
}

export interface NarrationEditorSegment {
  segment_id: string;
  speaker_id: string;
  text: string;
  [key: string]: unknown;
}

interface NarrationEditorProps {
  mode: NarrationEditorMode;
  text: string;
  segments: NarrationEditorSegment[];
  speakers: NarrationEditorSpeaker[];
  onTextChange: (text: string) => void;
  onSegmentsChange: (segments: NarrationEditorSegment[]) => void;
  disabled?: boolean;
}

function createSegmentId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `segment-${Date.now()}`;
}

export function NarrationEditor({
  mode,
  text,
  segments,
  speakers,
  onTextChange,
  onSegmentsChange,
  disabled = false,
}: NarrationEditorProps) {
  const updateSegment = (index: number, patch: Partial<NarrationEditorSegment>) => {
    onSegmentsChange(segments.map((segment, segmentIndex) => (
      segmentIndex === index ? { ...segment, ...patch } : segment
    )));
  };

  const moveSegment = (index: number, offset: -1 | 1) => {
    const reordered = [...segments];
    const [segment] = reordered.splice(index, 1);
    reordered.splice(index + offset, 0, segment);
    onSegmentsChange(reordered);
  };

  if (mode === 'single') {
    return (
      <section aria-label="单人旁白编辑器" className="min-w-0">
        <Textarea
          aria-label="旁白文案"
          label="旁白文案"
          value={text}
          disabled={disabled}
          onChange={(event) => onTextChange(event.target.value)}
          className="h-56 resize-none"
          placeholder="输入这一页的讲解文案"
        />
      </section>
    );
  }

  return (
    <section aria-label="多人旁白编辑器" className="min-w-0 space-y-3">
      <div className="divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
        {segments.map((segment, index) => (
          <fieldset key={segment.segment_id} className="min-w-0 py-4 first:pt-3 last:pb-3">
            <legend className="px-0 text-sm font-semibold text-[var(--app-text)]">
              第 {index + 1} 段
            </legend>

            <div className="mt-2 grid min-w-0 gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--app-text-secondary)]">
                <span>发言角色</span>
                <select
                  aria-label={`第 ${index + 1} 段角色`}
                  value={segment.speaker_id}
                  disabled={disabled || speakers.length === 0}
                  onChange={(event) => updateSegment(index, { speaker_id: event.target.value })}
                  className="h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)] outline-none transition-colors hover:border-[var(--app-border-strong)] focus-visible:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] disabled:opacity-45"
                >
                  {!speakers.some((speaker) => speaker.id === segment.speaker_id) && (
                    <option value={segment.speaker_id}>{segment.speaker_id}</option>
                  )}
                  {speakers.map((speaker) => (
                    <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
                  ))}
                </select>
              </label>

              <Textarea
                aria-label={`第 ${index + 1} 段文案`}
                value={segment.text}
                disabled={disabled}
                onChange={(event) => updateSegment(index, { text: event.target.value })}
                className="min-h-[88px] resize-y"
                placeholder="输入该角色的讲解内容"
              />

              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 px-0"
                  icon={<ArrowUp size={16} aria-hidden="true" />}
                  aria-label={`上移第 ${index + 1} 段`}
                  title="上移"
                  disabled={disabled || index === 0}
                  onClick={() => moveSegment(index, -1)}
                >
                  <span className="sr-only">上移</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 px-0"
                  icon={<ArrowDown size={16} aria-hidden="true" />}
                  aria-label={`下移第 ${index + 1} 段`}
                  title="下移"
                  disabled={disabled || index === segments.length - 1}
                  onClick={() => moveSegment(index, 1)}
                >
                  <span className="sr-only">下移</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 px-0 text-[var(--app-error)]"
                  icon={<Trash2 size={16} aria-hidden="true" />}
                  aria-label={`删除第 ${index + 1} 段`}
                  title="删除"
                  disabled={disabled}
                  onClick={() => onSegmentsChange(segments.filter((_, segmentIndex) => segmentIndex !== index))}
                >
                  <span className="sr-only">删除</span>
                </Button>
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus size={16} aria-hidden="true" />}
          disabled={disabled}
          onClick={() => onSegmentsChange([
            ...segments,
            {
              segment_id: createSegmentId(),
              speaker_id: speakers[0]?.id ?? '',
              text: '',
            },
          ])}
        >
          添加对话片段
        </Button>
      </div>
    </section>
  );
}
