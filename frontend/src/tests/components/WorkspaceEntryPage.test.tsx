import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceEntryPage } from '@/components/content-project/WorkspaceEntryPage';

const mocks = vi.hoisted(() => ({
  initializeWorkspace: vi.fn(),
  project: {
    project_id: 'project-1',
    spine: { status: 'confirmed' },
    workspaces: [
      { kind: 'ppt', state: 'draft', revision: 1 },
      { kind: 'video', state: 'uninitialized', revision: 0 },
    ],
  },
}));

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: () => ({
    project: mocks.project,
    loading: false,
    initializeWorkspace: mocks.initializeWorkspace,
  }),
}));

describe('WorkspaceEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the workspace initialization action without starting it automatically', () => {
    render(<WorkspaceEntryPage kind="video" />);

    expect(mocks.initializeWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '生成脚本结构' }));
    expect(mocks.initializeWorkspace).toHaveBeenCalledWith('video');
    // PPT 派生视频不再从入口页直接同步写正式工作区
    expect(screen.queryByRole('button', { name: '从现有 PPT 生成' })).not.toBeInTheDocument();
  });

  it('shows a non-repeatable preparation state while initialization is running', () => {
    (mocks.project.workspaces[1] as any).stage = 'INITIALIZING';
    render(<WorkspaceEntryPage kind="video" />);

    expect(screen.getByText('正在准备视频工作区')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成脚本结构' })).not.toBeInTheDocument();
    expect(mocks.initializeWorkspace).not.toHaveBeenCalled();
    delete (mocks.project.workspaces[1] as any).stage;
  });
});
