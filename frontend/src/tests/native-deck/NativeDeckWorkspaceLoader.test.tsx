import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeDeckWorkspaceLoader } from '@/components/native-deck/NativeDeckWorkspaceLoader';

const mocks = vi.hoisted(() => ({
  getTaskStatus: vi.fn(),
  generateNativeDeck: vi.fn(),
  syncProject: vi.fn(),
}));

vi.mock('@/api/endpoints', () => ({
  getTaskStatus: mocks.getTaskStatus,
  generateNativeDeck: mocks.generateNativeDeck,
}));
vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: (selector: (state: { syncProject: typeof mocks.syncProject }) => unknown) =>
    selector({ syncProject: mocks.syncProject }),
}));
vi.mock('@/components/native-deck/NativeDeckWorkspace', () => ({
  NativeDeckWorkspace: () => <div>可编辑页面</div>,
}));

async function sleep(ms: number) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('NativeDeckWorkspaceLoader generation progress', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('waits for an explicit batch action before generating native pages', async () => {
    mocks.generateNativeDeck.mockResolvedValue({ data: { task_id: 'task-new' } });
    mocks.getTaskStatus.mockResolvedValue({
      data: { status: 'PROCESSING', progress: { completed: 0, failed: 0, total: 5 } },
    });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[]}
        totalPages={5}
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(mocks.generateNativeDeck).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '批量生成' })).not.toBeInTheDocument();
  });

  it('polls every second and syncs only when generation progress changes', async () => {
    mocks.getTaskStatus
      .mockResolvedValueOnce({
        data: { status: 'PROCESSING', progress: { completed: 2, failed: 1, total: 5 } },
      })
      .mockResolvedValueOnce({
        data: { status: 'PROCESSING', progress: { completed: 2, failed: 1, total: 5 } },
      })
      .mockResolvedValueOnce({
        data: { status: 'PROCESSING', progress: { completed: 3, failed: 1, total: 5 } },
      });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[]}
        generationTaskId="task-1"
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(await screen.findByText('可编辑页面')).toBeInTheDocument();
    expect(await screen.findByText('正在生成页面 2/5，失败 1')).toBeInTheDocument();
    await waitFor(() => expect(mocks.syncProject).toHaveBeenCalledTimes(1));

    await sleep(1050);
    await waitFor(() => expect(mocks.getTaskStatus).toHaveBeenCalledTimes(2));
    expect(mocks.syncProject).toHaveBeenCalledTimes(1);

    await sleep(1050);
    await waitFor(() => expect(mocks.getTaskStatus).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('正在生成页面 3/5，失败 1')).toBeInTheDocument();
    await waitFor(() => expect(mocks.syncProject).toHaveBeenCalledTimes(2));
  }, 10000);

  it('clears the persisted task key after completion', async () => {
    localStorage.setItem('nativeDeckGenerationTask:native-1', 'task-1');
    mocks.getTaskStatus
      .mockResolvedValueOnce({
        data: { status: 'PROCESSING', progress: { completed: 4, failed: 0, total: 5 } },
      })
      .mockResolvedValueOnce({
        data: { status: 'COMPLETED', progress: { completed: 5, failed: 0, total: 5 } },
      });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[]}
        generationTaskId="task-1"
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(await screen.findByText('可编辑页面')).toBeInTheDocument();
    expect(localStorage.getItem('nativeDeckGenerationTask:native-1')).toBe('task-1');

    await sleep(1050);
    await waitFor(() => expect(mocks.getTaskStatus).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem('nativeDeckGenerationTask:native-1')).toBeNull();
  }, 10000);

  it('keeps generated pages editable and clears storage when the task fails', async () => {
    localStorage.setItem('nativeDeckGenerationTask:native-1', 'task-1');
    mocks.getTaskStatus.mockResolvedValue({
      data: {
        status: 'FAILED',
        error_message: '模型返回内容无效',
        progress: { completed: 2, failed: 1, total: 5 },
      },
    });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[]}
        generationTaskId="task-1"
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(await screen.findByText('可编辑页面')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('页面生成失败：模型返回内容无效，失败 1');
    expect(localStorage.getItem('nativeDeckGenerationTask:native-1')).toBeNull();
  }, 10000);
});
