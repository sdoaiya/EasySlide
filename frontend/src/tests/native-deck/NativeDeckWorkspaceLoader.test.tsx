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
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
}));
vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: (selector: (state: { syncProject: typeof mocks.syncProject }) => unknown) =>
    selector({ syncProject: mocks.syncProject }),
}));
vi.mock('@/components/native-deck/NativeDeckWorkspace', () => ({
  NativeDeckWorkspace: (props: {
    pageGenerationAction?: { label: string; onClick: () => void }
    pageGenerationStatus?: { status: string; completed: number; failed: number; total: number; error?: string; onResume?: () => void }
  }) => (
    <div>
      可编辑页面
      {props.pageGenerationAction && (
        <button type="button" onClick={props.pageGenerationAction.onClick}>{props.pageGenerationAction.label}</button>
      )}
      {props.pageGenerationStatus && props.pageGenerationStatus.status !== 'COMPLETED' && (
        <div role={props.pageGenerationStatus.status === 'FAILED' ? 'alert' : 'status'}>
          {props.pageGenerationStatus.status === 'FAILED'
            ? `页面生成失败：${props.pageGenerationStatus.error || '请稍后重试'}`
            : `正在生成页面 ${props.pageGenerationStatus.completed}/${props.pageGenerationStatus.total}`}
          {props.pageGenerationStatus.failed > 0 && `，失败 ${props.pageGenerationStatus.failed}`}
          {props.pageGenerationStatus.onResume && <button type="button" onClick={props.pageGenerationStatus.onResume}>重新生成失败页面</button>}
        </div>
      )}
    </div>
  ),
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

  it('labels pending native page generation as batch page generation', async () => {
    mocks.generateNativeDeck.mockResolvedValue({ data: { task_id: 'task-new' } });
    mocks.getTaskStatus.mockResolvedValue({
      data: { status: 'PROCESSING', progress: { completed: 0, failed: 0, total: 2 } },
    });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[
          { pageId: 'page-1', layout: 'theme01_page001', pending: true, props: { title: '待生成 1' } },
          { pageId: 'page-2', layout: 'theme01_page002', pending: true, props: { title: '待生成 2' } },
          { pageId: 'page-3', layout: 'theme01_page003', props: { title: '已生成' } },
        ]}
        totalPages={3}
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '批量生成' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '批量生成页面' }));

    await waitFor(() => expect(mocks.generateNativeDeck).toHaveBeenCalledWith('native-1', ['page-1', 'page-2']));
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

  it('retries only failed page ids after a generation task fails', async () => {
    mocks.getTaskStatus.mockResolvedValue({
      data: {
        status: 'FAILED',
        error_message: '模型返回内容无效',
        progress: { completed: 2, failed: 1, total: 5, failed_page_ids: ['page-4'] },
      },
    });
    mocks.generateNativeDeck.mockResolvedValue({ data: { task_id: 'retry-task' } });

    render(
      <NativeDeckWorkspaceLoader
        projectId="native-1"
        slides={[]}
        generationTaskId="task-1"
        onHome={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '重新生成失败页面' }));
    await waitFor(() => expect(mocks.generateNativeDeck).toHaveBeenCalledWith('native-1', ['page-4']));
  }, 10000);
});
