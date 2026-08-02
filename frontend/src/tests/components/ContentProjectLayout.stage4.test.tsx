import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentProjectLayout, useProjectEditorSession } from '@/components/content-project/ContentProjectLayout';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  clear: vi.fn(),
  setLastProjectEntry: vi.fn(),
  project: {} as any,
}));

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: () => ({ project: mocks.project, loading: false, error: null, load: mocks.load, clear: mocks.clear }),
  selectContentWorkspace: (project: any, kind: string) => project?.workspaces?.find((item: any) => item.kind === kind),
  selectSpineSummary: () => ({ topic: '测试项目', sources: [] }),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return { ...actual, setLastProjectEntry: mocks.setLastProjectEntry };
});

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: { data: { voices: [] } } }) },
  getStaticAssetUrl: (path: string) => path,
  getImageUrl: (path: string) => path,
}));

mocks.project = {
  project_id: 'project-1',
  project_title: '测试项目',
  workspaces: [
    { kind: 'ppt', state: 'draft', revision: 1 },
    { kind: 'video', state: 'draft', revision: 1 },
    { kind: 'podcast', state: 'draft', revision: 1 },
  ],
};

function VideoEditor({ dirty }: { dirty: boolean }) {
  useProjectEditorSession({ key: 'video-session', dirty, onSave: vi.fn() });
  return <div>视频编辑器</div>;
}

function PathProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderShell(initialPath: string, videoDirty = true) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ContentProjectLayout />}>
          <Route path="/project/:projectId/video" element={<VideoEditor dirty={videoDirty} />} />
          <Route path="/project/:projectId/podcast" element={<div>播客编辑器</div>} />
          <Route path="/project/:projectId/ppt" element={<div>PPT 编辑器</div>} />
        </Route>
      </Routes>
      <PathProbe />
    </MemoryRouter>,
  );
}

describe('ContentProjectLayout 阶段4 壳层', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    mocks.load.mockReset();
    mocks.load.mockResolvedValue(undefined);
  });

  it('渲染统一项目栏：模式切换三入口与任务按钮', () => {
    renderShell('/project/project-1/video');
    expect(screen.getAllByRole('button', { name: /PPT|视频|播客/ }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: '项目任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回作品墙' })).toBeInTheDocument();
  });

  it('未保存内容时切换触发保护：取消停留、保存后切换', async () => {
    renderShell('/project/project-1/video');
    // 视频编辑器注册了 dirty 会话
    fireEvent.click(screen.getAllByRole('button', { name: '播客' })[0]);
    expect(await screen.findByRole('dialog', { name: '未保存内容' })).toBeInTheDocument();

    // 取消：留在原模式
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('视频编辑器')).toBeInTheDocument();

    // 再次切换 → 保存并切换
    fireEvent.click(screen.getAllByRole('button', { name: '播客' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '保存并切换' }));
    await waitFor(() => expect(screen.getByText('播客编辑器')).toBeInTheDocument());
    expect(screen.getByTestId('path')).toHaveTextContent('/project/project-1/podcast');
  });

  it('无未保存内容时直接切换', async () => {
    renderShell('/project/project-1/video', false);
    fireEvent.click(screen.getAllByRole('button', { name: 'PPT' })[0]);
    await waitFor(() => expect(screen.getByText('PPT 编辑器')).toBeInTheDocument());
    expect(screen.getByTestId('path')).toHaveTextContent('/project/project-1/ppt');
    expect(screen.queryByRole('dialog', { name: '未保存内容' })).not.toBeInTheDocument();
  });
});
