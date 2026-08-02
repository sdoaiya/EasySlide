import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PodcastWorkspace } from '@/components/content-project/PodcastWorkspace';

const mocks = vi.hoisted(() => ({ update: vi.fn(), propose: vi.fn(), export: vi.fn(), preview: vi.fn(), addTask: vi.fn(), pollTask: vi.fn(), apiClient: { get: vi.fn() }, getSettings: vi.fn(), listBgm: vi.fn(), generateImage: vi.fn(), getTaskStatus: vi.fn() }));
vi.mock('@/api/endpoints', () => ({ updateContentWorkspace: mocks.update, proposePodcastToSpine: mocks.propose, exportPodcastWorkspace: mocks.export, previewPodcastWorkspace: mocks.preview, getSettings: mocks.getSettings, listBgmLibrary: mocks.listBgm, generateMaterialImage: mocks.generateImage, getTaskStatus: mocks.getTaskStatus }));
vi.mock('@/store/useExportTasksStore', () => ({ useExportTasksStore: () => ({ addTask: mocks.addTask, pollTask: mocks.pollTask }) }));
vi.mock('@/components/content-project/WorkspaceVersionHistory', () => ({ WorkspaceVersionHistory: () => <div>版本历史</div> }));
// VoicePicker 的声音目录请求：stub 空目录即可
vi.mock('@/api/client', () => ({ apiClient: mocks.apiClient, getImageUrl: (path: string) => path, getStaticAssetUrl: (path: string) => path }));
vi.mock('@/components/shared/MaterialSelector', () => ({
  MaterialSelector: ({ isOpen, mediaKindFilter, onSelect }: any) => isOpen ? <button type="button" data-testid={`podcast-material-${mediaKindFilter.join('-')}`} onClick={() => onSelect([{ id: 'material-1', url: '/files/materials/script.md', media_kind: mediaKindFilter[0], filename: 'script.md' }])}>选择播客素材</button> : null,
}));

const workspace = { id: 'podcast-1', project_id: 'project-1', kind: 'podcast' as const, state: 'draft' as const, revision: 1, current_version_id: 'version-1', source_kind: 'spine' as const, settings: {}, document: { title: '播客工作区', format: 'single', speakers: [{ speaker_id: 'host', name: '主持人' }], segments: [{ segment_id: 'segment.1', speaker_id: 'host', text: '原脚本', locked: false }] } };

describe('PodcastWorkspace', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({ data: {} }); mocks.propose.mockResolvedValue({ data: {} }); mocks.export.mockResolvedValue({ data: { task_id: 'export-1' } }); mocks.preview.mockResolvedValue({ data: { audio_url: 'blob:preview', provider: 'edge', timing_quality: 'segment_exact', cache_hit: false } }); mocks.apiClient.get.mockResolvedValue({ data: { data: { voices: [] } } }); mocks.getSettings.mockResolvedValue({ data: { settings: {} } }); mocks.listBgm.mockResolvedValue({ data: { tracks: [{ id: 'bgm.calm', name: '轻松舒缓', note: '温暖的 C 大调', url: '/files/bgm_library/bgm.calm.mp3', duration_ms: 48000, material_id: 'm-1' }] } }); mocks.generateImage.mockResolvedValue({ data: { task_id: 'cover-task-1', status: 'PENDING' } }); mocks.getTaskStatus.mockResolvedValue({ data: { status: 'COMPLETED', progress: { image_url: '/files/project-1/materials/cover.png' } } }); });
  it('edits a segment, saves a revision, then exports without a spine sync proposal', async () => {
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
    expect(screen.queryByRole('button', { name: '提交同步候选' })).not.toBeInTheDocument();
    expect(mocks.propose).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
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

  it('switches to dialogue with at least two speakers, adds and removes roles', async () => {
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />);

    // 单人 → 多人对话：自动补齐第二位角色（嘉宾）
    fireEvent.change(screen.getByLabelText('节目形式'), { target: { value: 'dialogue' } });
    expect(screen.getByLabelText('角色1名称')).toHaveValue('主持人');
    expect(screen.getByLabelText('角色2名称')).toHaveValue('嘉宾');
    expect(screen.getByRole('button', { name: '添加角色' })).toBeInTheDocument();

    // 添加第三位角色并改名
    fireEvent.click(screen.getByRole('button', { name: '添加角色' }));
    fireEvent.change(screen.getByLabelText('角色3名称'), { target: { value: '专家' } });

    // 多人角色用 VoicePicker（无手填 ID 输入框）
    expect(screen.queryByPlaceholderText(/edge:voice|fish:voice/)).not.toBeInTheDocument();

    // 删除第三位角色（最少保留两位）
    fireEvent.click(screen.getByRole('button', { name: '移除角色 专家' }));
    expect(screen.queryByLabelText('角色3名称')).not.toBeInTheDocument();

    // 保存后 speakers 结构正确
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const saved = mocks.update.mock.calls[0][3];
    expect(saved.format).toBe('dialogue');
    expect(saved.speakers).toHaveLength(2);
    expect(saved.speakers[1]).toMatchObject({ name: '嘉宾', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' });
  });

  it('switches back to single and reassigns all segments to the host', async () => {
    const dialogueWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        format: 'dialogue' as const,
        speakers: [
          { speaker_id: 'host', name: '主持人', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' },
          { speaker_id: 'guest', name: '嘉宾', voice_ref: 'edge:zh-CN-YunxiNeural' },
        ],
        segments: [
          { segment_id: 'segment.1', speaker_id: 'host', text: '开场', locked: false },
          { segment_id: 'segment.2', speaker_id: 'guest', text: '嘉宾发言', locked: false },
        ],
      },
    };
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={dialogueWorkspace} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('节目形式'), { target: { value: 'single' } });
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const saved = mocks.update.mock.calls[0][3];
    expect(saved.format).toBe('single');
    expect(saved.speakers).toHaveLength(1);
    expect(saved.segments.every((segment: any) => segment.speaker_id === 'host')).toBe(true);
  });

  it('picks a built-in BGM track in one step and previews it', async () => {
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('内置背景音乐')).toBeInTheDocument());
    // 内置曲目以 material_id 作为引用写入文档（后端按 Material.id 查找）
    fireEvent.change(screen.getByLabelText('内置背景音乐'), { target: { value: 'm-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const saved = mocks.update.mock.calls[0][3];
    expect(saved.mixing.bgm_asset_ref).toBe('m-1');
    expect(saved.mixing.ducking).toBe(true);
    // 内置曲目带试听控件（桌面模式下 getImageUrl 绝对化 /files/ 前缀）
    expect(screen.getByLabelText('背景音乐试听')).toHaveAttribute('src', '/files/bgm_library/bgm.calm.mp3');
  });

  it('keeps a custom BGM reference when no built-in track matches', async () => {
    const customWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        mixing: { bgm_asset_ref: 'material-custom', ducking: true, fade_in_ms: 500, fade_out_ms: 500 },
      },
    };
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={customWorkspace} onChanged={vi.fn()} />);

    // 非内置引用：下拉显示「自定义音乐」占位项（disabled，不会被清掉）
    await waitFor(() => expect(screen.getByLabelText('内置背景音乐')).toHaveValue('material-custom'));
    expect(screen.getByRole('option', { name: '自定义音乐' })).toBeDisabled();
    // 改动其他设置使文档变脏后保存：自定义 BGM 引用不被内置下拉覆盖
    fireEvent.click(screen.getByLabelText('旁白时自动压低背景音乐'));
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][3].mixing.bgm_asset_ref).toBe('material-custom');
  });

  it('reuses the first free speaker number after removing a middle speaker', async () => {
    const dialogueWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        format: 'dialogue',
        speakers: [
          { speaker_id: 'speaker.1', name: '主持人', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' },
          { speaker_id: 'speaker.2', name: '嘉宾 A', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' },
          { speaker_id: 'speaker.3', name: '嘉宾 B', voice_ref: 'edge:zh-CN-XiaoxiaoNeural' },
        ],
      },
    };
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={dialogueWorkspace} onChanged={vi.fn()} />);

    // 移除中间角色 speaker.2 后再次添加：新角色应取第一个未被占用的 speaker.N（speaker.2）
    fireEvent.click(screen.getByRole('button', { name: '移除角色 嘉宾 A' }));
    fireEvent.click(screen.getByRole('button', { name: '添加角色' }));
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const speakerIds = (mocks.update.mock.calls[0][3].speakers as any[]).map((speaker) => speaker.speaker_id);
    expect(speakerIds).toContain('speaker.2');
    expect(new Set(speakerIds).size).toBe(speakerIds.length);
  });

  it('generates a cover with AI and applies it in one flow', async () => {
    render(<PodcastWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'AI 生成' }));
    // 风格预设默认选中，prompt 预填（零输入可生成）
    expect(screen.getByRole('dialog', { name: 'AI 生成播客封面' })).toBeInTheDocument();
    const promptBox = screen.getByRole('textbox', { name: /画面描述/ }) as HTMLTextAreaElement;
    expect(promptBox.value).toContain('播客节目封面');
    fireEvent.click(screen.getByRole('button', { name: '生成封面' }));

    await waitFor(() => expect(mocks.generateImage).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('播客节目封面'),
      undefined, undefined, '1:1',
    ));
    // 轮询完成后封面已应用（本地预览），保存后写入文档
    await waitFor(() => expect(screen.getAllByAltText('播客封面')[0]).toHaveAttribute('src', expect.stringContaining('cover.png')));
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][3].cover.asset_ref).toContain('cover.png');
  });
});
