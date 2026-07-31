import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyProjectRedirect, PptWorkspaceRoute } from '@/App';

const contentProjectStore = vi.hoisted(() => ({ project: null as any }));

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: (selector: (state: typeof contentProjectStore) => unknown) => selector(contentProjectStore),
}));

vi.mock('@/components/content-project/WorkspaceEntryPage', () => ({
  WorkspaceEntryPage: ({ kind }: { kind: string }) => <div>{kind} 初始化页</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}${location.hash}|${JSON.stringify(location.state)}`}</output>;
}

describe('content project compatibility routes', () => {
  beforeEach(() => {
    contentProjectStore.project = null;
  });

  it.each([
    ['outline', 'outline'],
    ['detail', 'detail'],
    ['preview', 'editor'],
  ] as const)('redirects /%s to the matching PPT child route without losing query or hash', (legacy, next) => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: `/project/project-1/${legacy}`,
        search: '?from=history',
        hash: '#page-2',
        state: { from: 'history', taskId: 'task-1' },
      }]}>
        <Routes>
          <Route path={`/project/:projectId/${legacy}`} element={<LegacyProjectRedirect stage={next} />} />
          <Route path="/project/:projectId/ppt/:stage" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(
      `/project/project-1/ppt/${next}?from=history#page-2|{"from":"history","taskId":"task-1"}`,
    )).toBeInTheDocument();
  });

  it('keeps an uninitialized PPT out of the editor routes', () => {
    contentProjectStore.project = {
      workspaces: [{ kind: 'ppt', state: 'uninitialized' }],
    };

    render(
      <MemoryRouter initialEntries={['/project/project-1/ppt/outline']}>
        <Routes>
          <Route path="/project/:projectId/ppt" element={<PptWorkspaceRoute />}>
            <Route path="outline" element={<div>大纲编辑器</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('ppt 初始化页')).toBeInTheDocument();
    expect(screen.queryByText('大纲编辑器')).not.toBeInTheDocument();
  });

  it('opens the PPT editor after the workspace is initialized', () => {
    contentProjectStore.project = {
      workspaces: [{ kind: 'ppt', state: 'draft' }],
    };

    render(
      <MemoryRouter initialEntries={['/project/project-1/ppt/outline']}>
        <Routes>
          <Route path="/project/:projectId/ppt" element={<PptWorkspaceRoute />}>
            <Route path="outline" element={<div>大纲编辑器</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('大纲编辑器')).toBeInTheDocument();
  });
});
