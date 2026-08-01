import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoWorkspace } from '@/components/content-project/VideoWorkspace';
import { useExportTasksStore } from '@/store/useExportTasksStore';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  propose: vi.fn(),
  exportVideo: vi.fn(),
  getProject: vi.fn(),
  handoffFrames: vi.fn(),
  getTaskStatus: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/api/endpoints', () => ({
  updateContentWorkspace: mocks.update,
  proposeVideoToSpine: mocks.propose,
  exportVideoWorkspace: mocks.exportVideo,
  getProject: mocks.getProject,
  handoffVideoWorkspaceFrames: mocks.handoffFrames,
  getTaskStatus: mocks.getTaskStatus,
}));

vi.mock('@/components/content-project/WorkspaceVersionHistory', () => ({
  WorkspaceVersionHistory: () => <div>版本历史</div>,
}));

vi.mock('@/components/shared/MaterialSelector', () => ({
  MaterialSelector: ({ isOpen, mediaKindFilter, onSelect }: any) => isOpen ? (
    <button type="button" data-testid={`video-material-${mediaKindFilter.join('-')}`} onClick={() => onSelect([{ url: mediaKindFilter.includes('audio') ? '/files/materials/music.mp3' : '/files/materials/scene.mp4', media_kind: mediaKindFilter.includes('audio') ? 'audio' : 'video', filename: 'asset' }])}>选择测试素材</button>
  ) : null,
}));

const workspace = {
  id: 'video-1',
  project_id: 'project-1',
  kind: 'video' as const,
  state: 'draft' as const,
  revision: 1,
  current_version_id: 'version-1',
  source_kind: 'spine' as const,
  settings: {},
  document: {
    schema_version: 1,
    title: '视频工作区',
    aspect_ratio: '16:9',
    scenes: [{
      scene_id: 'scene.1',
      title: '开场',
      visual: { kind: 'blank', source_ref: null },
      narration: { mode: 'single', text: '原旁白', segments: [] },
      subtitles: { enabled: true, text: '原旁白' },
      duration_ms: 3000,
      transition: 'cut',
      animation: { intensity: 'subtle', cues: [] },
      audio_cues: [],
    }],
  },
};

describe('VideoWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExportTasksStore.setState({ tasks: [] });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mocks.update.mockResolvedValue({ data: {} });
    mocks.propose.mockResolvedValue({ data: {} });
    mocks.exportVideo.mockResolvedValue({ data: { task_id: 'video-task-1' } });
    mocks.getTaskStatus.mockResolvedValue({ data: { status: 'COMPLETED' } });
    mocks.getProject.mockResolvedValue({ data: { pages: [] } });
    mocks.handoffFrames.mockResolvedValue({ data: { attached: true } });
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
  });

  it('edits a scene and saves a new revision without a spine sync proposal', async () => {
    const onChanged = vi.fn();
    render(
      <>
        <div data-content-project-rail-slot />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={onChanged} />
      </>
    );

    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveTextContent('开场');
    fireEvent.change(screen.getByLabelText('旁白'), { target: { value: '新旁白' } });
    fireEvent.click(screen.getByRole('button', { name: '选择' }));
    fireEvent.click(screen.getByTestId('video-material-image-video'));
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(screen.getByTestId('video-material-audio'));
    fireEvent.click(screen.getByRole('button', { name: '保存版本' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][3].scenes[0].narration.text).toBe('新旁白');
    expect(mocks.update.mock.calls[0][3].scenes[0].visual.source_ref).toBe('/files/materials/scene.mp4');
    expect(mocks.update.mock.calls[0][3].scenes[0].audio_cues[0].asset_ref).toBe('/files/materials/music.mp3');
    expect(screen.queryByRole('button', { name: '提交同步候选' })).not.toBeInTheDocument();
    expect(mocks.propose).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps 20-scene rail selection local instead of rerendering every item', () => {
    const longWorkspace = {
      ...workspace,
      document: {
        ...workspace.document,
        scenes: Array.from({ length: 20 }, (_, index) => ({
          ...workspace.document.scenes[0],
          scene_id: `scene.${index + 1}`,
          title: `场景 ${index + 1}`,
        })),
      },
    };
    render(
      <>
        <div data-content-project-rail-slot />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={longWorkspace} onChanged={vi.fn()} />
      </>
    );

    const untouched = screen.getAllByTestId('video-scene-rail-scene.10');
    expect(untouched.every((item) => item.dataset.renderCount === '1')).toBe(true);
    fireEvent.click(screen.getAllByTestId('video-scene-rail-scene.20')[0]);
    expect(screen.getAllByTestId('video-scene-rail-scene.1').every((item) => item.dataset.renderCount === '2')).toBe(true);
    expect(screen.getAllByTestId('video-scene-rail-scene.20').every((item) => item.dataset.renderCount === '2')).toBe(true);
    expect(untouched.every((item) => item.dataset.renderCount === '1')).toBe(true);
  });

  it('submits Proof and then reuses its task for a high-quality export', async () => {
    render(
      <>
        <div data-content-project-rail-slot />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: '生成预览' }));
    await waitFor(() => expect(mocks.exportVideo).toHaveBeenCalledWith('project-1', { renderProfile: 'proof', sourceProofTaskId: undefined }));
    await waitFor(() => expect(useExportTasksStore.getState().tasks[0]).toMatchObject({
      taskId: 'video-task-1',
      type: 'video',
      status: 'COMPLETED',
      progress: { render_profile: 'proof', workspace_version_id: 'version-1' },
    }));
    expect(screen.getByText('预览已完成，可导出高清')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '导出高清' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '导出高清' }));
    await waitFor(() => expect(mocks.exportVideo).toHaveBeenLastCalledWith('project-1', { renderProfile: 'final', sourceProofTaskId: 'video-task-1' }));
  });

  it('hands off one verified static frame per PPT scene', async () => {
    const onChanged = vi.fn();
    const pptWorkspace = {
      ...workspace,
      source_kind: 'ppt' as const,
      document: {
        ...workspace.document,
        scenes: [{
          ...workspace.document.scenes[0],
          visual: { kind: 'page', source_ref: 'page-1' },
        }],
      },
    };
    mocks.getProject.mockResolvedValue({
      data: { pages: [{ page_id: 'page-1', generated_image_url: '/files/project-1/pages/page-1.png' }] },
    });
    render(<VideoWorkspace projectId="project-1" spineRevision={3} workspace={pptWorkspace} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: '同步 PPT 阶段帧' }));
    await waitFor(() => expect(mocks.handoffFrames).toHaveBeenCalled());
    expect(mocks.handoffFrames.mock.calls[0][0]).toBe('project-1');
    expect(mocks.handoffFrames.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.handoffFrames.mock.calls[0][1][0]).toHaveLength(1);
    expect(mocks.handoffFrames.mock.calls[0][2]).toEqual(['page-1']);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('blocks handoff when a PPT page has no static image', async () => {
    const pptWorkspace = {
      ...workspace,
      source_kind: 'ppt' as const,
      document: {
        ...workspace.document,
        scenes: [{ ...workspace.document.scenes[0], visual: { kind: 'native_scene', source_ref: 'page-1' } }],
      },
    };
    mocks.getProject.mockResolvedValue({ data: { pages: [{ page_id: 'page-1' }] } });
    render(<VideoWorkspace projectId="project-1" spineRevision={3} workspace={pptWorkspace} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '同步 PPT 阶段帧' }));
    await waitFor(() => expect(screen.getByText(/缺少可交接的静态画面/)).toBeInTheDocument());
    expect(mocks.handoffFrames).not.toHaveBeenCalled();
  });

  it('reuses a completed Proof task restored from the persisted task center', async () => {
    useExportTasksStore.setState({
      tasks: [{
        id: 'video-export-restored',
        taskId: 'restored-proof-task',
        projectId: 'project-1',
        type: 'video',
        status: 'COMPLETED',
        progress: { total: 100, completed: 100, render_profile: 'proof', workspace_version_id: 'version-1' },
        createdAt: new Date().toISOString(),
      }],
    });
    render(
      <>
        <div data-content-project-rail-slot />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />
      </>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '导出高清' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '导出高清' }));
    await waitFor(() => expect(mocks.exportVideo).toHaveBeenCalledWith('project-1', { renderProfile: 'final', sourceProofTaskId: 'restored-proof-task' }));
  });
});
