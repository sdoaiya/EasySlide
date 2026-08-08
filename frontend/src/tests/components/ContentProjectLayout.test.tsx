import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentProjectLayout } from '@/components/content-project/ContentProjectLayout';
import { useExportTasksStore } from '@/store/useExportTasksStore';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  clear: vi.fn(),
  setLastProjectEntry: vi.fn(),
  project: {
    project_id: 'project-1',
    last_workspace: 'video',
    spine: { id: 'spine-1', project_id: 'project-1', revision: 1, status: 'confirmed', content_hash: 'hash', document: { topic: { value: '统一项目' } } },
    workspaces: [
      { id: 'ppt-1', project_id: 'project-1', kind: 'ppt', state: 'draft', revision: 1, source_kind: 'spine', settings: {} },
      { id: 'video-1', project_id: 'project-1', kind: 'video', state: 'draft', revision: 1, source_kind: 'spine', settings: {} },
      { id: 'podcast-1', project_id: 'project-1', kind: 'podcast', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
    ],
  },
}));

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: () => ({ project: mocks.project, loading: false, error: null, load: mocks.load, clear: mocks.clear }),
  selectContentWorkspace: (project: any, kind: string) => project?.workspaces?.find((item: any) => item.kind === kind),
  selectSpineSummary: () => ({ topic: '', sources: [] }),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return { ...actual, setLastProjectEntry: mocks.setLastProjectEntry };
});

describe('ContentProjectLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    mocks.load.mockReset();
    mocks.clear.mockReset();
    mocks.setLastProjectEntry.mockReset();
    useExportTasksStore.setState({ tasks: [] });
  });

  it('keeps project content inside the shared app shell without mounting a second rail', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/video']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="video" element={<div>视频页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('视频页面')).toBeInTheDocument();
    expect(document.querySelector('[data-content-project-nav]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-content-project-rail-slot]')).not.toBeInTheDocument();
    expect(mocks.setLastProjectEntry).toHaveBeenCalledWith('project-1', 'video');
  });

  it('does not record retired spine entries as the last workspace', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/spine']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="spine" element={<div>旧主线页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('旧主线页面')).toBeInTheDocument();
    expect(mocks.setLastProjectEntry).not.toHaveBeenCalled();
  });

  it('keeps export task tracking out of workspace routes', () => {
    useExportTasksStore.setState({
      tasks: [{
        id: 'video-export-1', taskId: 'video-task-1', projectId: 'project-1', type: 'video', status: 'COMPLETED',
        progress: { total: 100, completed: 100, render_profile: 'proof', workspace_version_id: 'version-1' },
        createdAt: new Date().toISOString(),
      }],
    });
    render(
      <MemoryRouter initialEntries={['/project/project-1/video']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="video" element={<div>视频页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText(/导出任务/)).not.toBeInTheDocument();
    expect(screen.getByText('视频页面')).toBeInTheDocument();
  });
});

describe('ContentProjectLayout mode switch', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns to the remembered PPT sub page when switching back from video', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/ppt/editor']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="ppt" element={<div>PPT 入口</div>} />
            <Route path="ppt/editor" element={<div>PPT 编辑页</div>} />
            <Route path="ppt/outline" element={<div>PPT 大纲页</div>} />
            <Route path="video" element={<div>视频页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // 从 PPT 编辑页切到视频：记录当前子页
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(screen.getByText('视频页面')).toBeInTheDocument();

    // 从视频切回 PPT：回到记忆的编辑页，而不是大纲页
    fireEvent.click(screen.getByRole('button', { name: 'PPT' }));
    expect(screen.getByText('PPT 编辑页')).toBeInTheDocument();
    expect(screen.queryByText('PPT 大纲页')).not.toBeInTheDocument();
  });

  it('falls back to the default PPT entry without a remembered sub page', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/video']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="ppt" element={<div>PPT 入口</div>} />
            <Route path="ppt/outline" element={<div>PPT 大纲页</div>} />
            <Route path="video" element={<div>视频页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'PPT' }));
    expect(screen.getByText('PPT 入口')).toBeInTheDocument();
  });
});
