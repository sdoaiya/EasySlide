import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceEntryPage } from '@/components/content-project/WorkspaceEntryPage';

const mocks = vi.hoisted(() => ({
  loadRuns: vi.fn(),
  createRun: vi.fn(),
  load: vi.fn(),
  runs: [] as any[],
  navigate: vi.fn(),
  project: {
    project_id: 'project-1',
    project_title: '测试项目',
    spine: { status: 'confirmed', revision: 1, document: {} },
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
    load: mocks.load,
  }),
  selectContentWorkspace: (project: any, kind: string) => project?.workspaces?.find((item: any) => item.kind === kind),
  selectSpineSummary: () => ({ topic: '', sources: [] }),
}));

vi.mock('@/store/useWorkspaceGenerationStore', () => ({
  useWorkspaceGenerationStore: () => ({
    runs: mocks.runs || [],
    loadRuns: mocks.loadRuns,
    createRun: mocks.createRun,
    error: null,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

describe('WorkspaceEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runs = [];
    mocks.navigate = vi.fn();
    mocks.createRun.mockReset();
  });

  it('offers generation-run actions without starting anything automatically', () => {
    render(<WorkspaceEntryPage kind="video" />);

    expect(mocks.createRun).not.toHaveBeenCalled();
    // PPT 派生不再同步写正式工作区；入口改为生成运行
    expect(screen.queryByRole('button', { name: '从现有 PPT 生成' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从 PPT 转换' })).toBeInTheDocument();
  });

  it('creates a direct generation run and navigates to its review page', async () => {
    mocks.createRun.mockResolvedValue({ run_id: 'run-1' });
    render(<WorkspaceEntryPage kind="video" />);

    fireEvent.click(screen.getByRole('button', { name: '直接生成视频候选' }));
    await waitFor(() => expect(mocks.createRun).toHaveBeenCalledWith('project-1', expect.objectContaining({
      targetWorkspaceKind: 'video',
      sourceKind: 'brief',
      mode: 'direct',
    })));
    expect(mocks.navigate).toHaveBeenCalledWith('/project/project-1/video/review/run-1');
  });

  it('shows an active run card with a progress entry', () => {
    mocks.runs = [{
      run_id: 'run-1',
      target_workspace_kind: 'video',
      status: 'RUNNING',
    }];
    render(<WorkspaceEntryPage kind="video" />);

    expect(screen.getByText('正在生成视频候选')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看进度' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/project/project-1/video/review/run-1');
  });

  it('shows a review prompt for a REVIEW_READY candidate without a formal version', () => {
    mocks.runs = [{
      run_id: 'run-1',
      target_workspace_kind: 'video',
      status: 'REVIEW_READY',
      stale: false,
    }];
    render(<WorkspaceEntryPage kind="video" />);

    expect(screen.getByText('有 1 个待审查候选')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '审查候选' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/project/project-1/video/review/run-1');
  });
});
