import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('shows native PPTX quality report after completion', async () => {
    act(() => useExportTasksStore.setState({
      restoreActiveTasks: vi.fn(),
      tasks: [{
        id: 'native',
        taskId: 'task-native',
        projectId: 'project-a',
        type: 'native-pptx',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        progress: {
          total: 1,
          completed: 1,
          quality_report: {
            slideCount: 1,
            textObjects: 3,
            shapeObjects: 2,
            imageObjects: 1,
            slideSummaries: [{ index: 1, renderedTextObjects: 3, renderedShapeObjects: 2, renderedImageObjects: 1 }],
            warnings: [],
          },
        },
      }],
    }));

    render(<ExportTasksPanel projectId="project-a" />);

    expect(screen.getByText('原生可编辑 PPTX')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看质量报告' }));
    expect(await screen.findByRole('dialog', { name: '导出质量报告' })).toHaveTextContent('3');
  });
});
