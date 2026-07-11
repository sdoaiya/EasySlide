import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ExportTasksPanel } from '@/components/shared/ExportTasksPanel';
import { useExportTasksStore } from '@/store/useExportTasksStore';

const restoreActiveTasks = useExportTasksStore.getState().restoreActiveTasks;

describe('ExportTasksPanel pause controls', () => {
  afterEach(() => {
    cleanup();
    act(() => useExportTasksStore.setState({ tasks: [], restoreActiveTasks }));
  });

  it('keeps paused tasks active and shows pause/resume icon buttons', () => {
    act(() => useExportTasksStore.setState({
        restoreActiveTasks: vi.fn(),
        tasks: [
          { id: 'running', taskId: 'task-1', projectId: 'project-a', type: 'editable-pptx', status: 'RUNNING', createdAt: new Date().toISOString() },
          { id: 'paused', taskId: 'task-2', projectId: 'project-a', type: 'video', status: 'PAUSED', createdAt: new Date().toISOString() },
        ],
      }));

    render(<ExportTasksPanel projectId="project-a" />);

    expect(screen.getByRole('button', { name: /暂停任务|Pause task/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /继续任务|Resume task/ })).toBeInTheDocument();
    expect(screen.getByText(/2 (进行中|in progress)/)).toBeInTheDocument();
  });
});
