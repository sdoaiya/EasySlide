import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PodcastWorkspace } from '@/components/content-project/PodcastWorkspace';

const mocks = vi.hoisted(() => ({ update: vi.fn(), propose: vi.fn(), export: vi.fn(), preview: vi.fn(), addTask: vi.fn(), pollTask: vi.fn() }));
vi.mock('@/api/endpoints', () => ({ updateContentWorkspace: mocks.update, proposePodcastToSpine: mocks.propose, exportPodcastWorkspace: mocks.export, previewPodcastWorkspace: mocks.preview }));
vi.mock('@/store/useExportTasksStore', () => ({ useExportTasksStore: () => ({ addTask: mocks.addTask, pollTask: mocks.pollTask }) }));
vi.mock('@/components/content-project/WorkspaceVersionHistory', () => ({ WorkspaceVersionHistory: () => <div>版本历史</div> }));
vi.mock('@/components/shared/MaterialSelector', () => ({
  MaterialSelector: ({ isOpen, mediaKindFilter, onSelect }: any) => isOpen ? <button type="button" data-testid={`podcast-material-${mediaKindFilter.join('-')}`} onClick={() => onSelect([{ id: 'material-1', url: '/files/materials/script.md', media_kind: mediaKindFilter[0], filename: 'script.md' }])}>选择播客素材</button> : null,
}));

const workspace = { id: 'podcast-1', project_id: 'project-1', kind: 'podcast' as const, state: 'draft' as const, revision: 1, current_version_id: 'version-1', source_kind: 'spine' as const, settings: {}, document: { title: '播客工作区', format: 'single', speakers: [{ speaker_id: 'host', name: '主持人' }], segments: [{ segment_id: 'segment.1', speaker_id: 'host', text: '原脚本', locked: false }] } };

describe('PodcastWorkspace', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({ data: {} }); mocks.propose.mockResolvedValue({ data: {} }); mocks.export.mockResolvedValue({ data: { task_id: 'export-1' } }); mocks.preview.mockResolvedValue({ data: { audio_url: 'blob:preview', provider: 'edge', timing_quality: 'segment_exact', cache_hit: false } }); });
  it('edits a segment, saves a revision, then creates a sync proposal', async () => {
    const onChanged = vi.fn();
    render(<><div data-content-project-rail-slot /><PodcastWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={onChanged} /></>);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('article')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('脚本'), { target: { value: '新脚本' } });
    fireEvent.click(screen.getByRole('button', { name: '选择素材' }));
    fireEvent.click(screen.getByTestId('podcast-material-audio-transcript'));
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][3].segments[0].text).toBe('新脚本');
    expect(mocks.update.mock.calls[0][3].segments[0].source_ref).toBe('/files/materials/script.md');
    fireEvent.click(screen.getByRole('button', { name: '提议同步' }));
    await waitFor(() => expect(mocks.propose).toHaveBeenCalledWith('project-1', 3));
    expect(onChanged).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '导出 MP3' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith('project-1', { format: 'mp3' }));
    expect(mocks.addTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'podcast-export-export-1', taskId: 'export-1', type: 'podcast', status: 'PENDING', progress: expect.objectContaining({ format: 'mp3', workspace_version_id: 'version-1' }) }));
    expect(mocks.pollTask).toHaveBeenCalledWith('podcast-export-export-1', 'project-1', 'export-1');
    fireEvent.click(screen.getByRole('button', { name: '导出 WAV' }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith('project-1', { format: 'wav' }));
  });

  it('keeps long-program segment selection local instead of rerendering every item', () => {
    const longWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        segments: Array.from({ length: 60 }, (_, index) => ({
          ...workspace.document.segments[0],
          segment_id: `segment.${index + 1}`,
          text: `第 ${index + 1} 分钟播客脚本`,
        })),
      },
    };
    render(<><div data-content-project-rail-slot /><PodcastWorkspace projectId="project-1" spineRevision={3} workspace={longWorkspace} onChanged={vi.fn()} /></>);

    const untouched = screen.getAllByTestId('podcast-segment-rail-segment.30');
    expect(untouched.every((item) => item.dataset.renderCount === '1')).toBe(true);
    fireEvent.click(screen.getAllByTestId('podcast-segment-rail-segment.60')[0]);
    expect(screen.getAllByTestId('podcast-segment-rail-segment.1').every((item) => item.dataset.renderCount === '2')).toBe(true);
    expect(screen.getAllByTestId('podcast-segment-rail-segment.60').every((item) => item.dataset.renderCount === '2')).toBe(true);
    expect(untouched.every((item) => item.dataset.renderCount === '1')).toBe(true);
  });

  it('configures cover, BGM, SFX, and previews a saved segment', async () => {
    const canonicalWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        language: 'zh-CN',
        speakers: [{ speaker_id: 'host', name: '主持人', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' }],
        segments: [{ ...workspace.document.segments[0], audio_cues: [] }],
        mixing: { bgm_asset_ref: null, ducking: true, fade_in_ms: 500, fade_out_ms: 500 },
        cover: { asset_ref: null, title: '节目封面', subtitle: '第一期' },
      },
    };
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={canonicalWorkspace} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '选择封面' }));
    fireEvent.click(screen.getByTestId('podcast-material-image'));
    fireEvent.click(screen.getByRole('button', { name: '选择背景音乐' }));
    fireEvent.click(screen.getByTestId('podcast-material-audio'));
    fireEvent.click(screen.getByRole('button', { name: '添加音效' }));
    fireEvent.click(screen.getByTestId('podcast-material-audio'));

    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const saved = mocks.update.mock.calls[0][3];
    expect(saved.cover.asset_ref).toBe('material-1');
    expect(saved.mixing.bgm_asset_ref).toBe('material-1');
    expect(saved.segments[0].audio_cues[0]).toMatchObject({ kind: 'sfx', asset_ref: 'material-1' });

    fireEvent.click(screen.getByRole('button', { name: '试听当前片段' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith('project-1', expect.objectContaining({ provider: 'edge', segmentId: 'segment.1' })));
    expect(screen.getByLabelText('试听音频')).toHaveAttribute('src', 'blob:preview');
  });
});
