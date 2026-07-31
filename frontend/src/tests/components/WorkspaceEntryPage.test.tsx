import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceEntryPage } from '@/components/content-project/WorkspaceEntryPage';

const mocks = vi.hoisted(() => ({
  initializeWorkspace: vi.fn(),
  initializeVideoFromPpt: vi.fn(),
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
    initializeVideoFromPpt: mocks.initializeVideoFromPpt,
  }),
}));

describe('WorkspaceEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the two approved video sources without starting either automatically', () => {
    render(<WorkspaceEntryPage kind="video" />);

    expect(mocks.initializeWorkspace).not.toHaveBeenCalled();
    expect(mocks.initializeVideoFromPpt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '从内容主线生成' }));
    fireEvent.click(screen.getByRole('button', { name: '从现有 PPT 生成' }));
    expect(mocks.initializeWorkspace).toHaveBeenCalledWith('video');
    expect(mocks.initializeVideoFromPpt).toHaveBeenCalledTimes(1);
  });

  it('shows a non-repeatable preparation state while initialization is running', () => {
    (mocks.project.workspaces[1] as any).stage = 'INITIALIZING';
    render(<WorkspaceEntryPage kind="video" />);

    expect(screen.getByText('正在准备视频工作区')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '从内容主线生成' })).not.toBeInTheDocument();
    expect(mocks.initializeWorkspace).not.toHaveBeenCalled();
    delete (mocks.project.workspaces[1] as any).stage;
  });
});
