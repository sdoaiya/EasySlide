import { render, screen } from '@testing-library/react';
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
      <MemoryRouter initialEntries={['/project/project-1/spine']}>
        <Routes>
          <Route path="/project/:projectId" element={<ContentProjectLayout />}>
            <Route path="spine" element={<div>主线页面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('主线页面')).toBeInTheDocument();
    expect(document.querySelector('[data-content-project-nav]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-content-project-rail-slot]')).not.toBeInTheDocument();
    expect(mocks.setLastProjectEntry).toHaveBeenCalledWith('project-1', 'spine');
  });

  it('keeps the export task center mounted outside workspace routes', () => {
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

    expect(screen.getByText(/导出任务/)).toBeInTheDocument();
    expect(screen.getByText('视频页面')).toBeInTheDocument();
  });
});
