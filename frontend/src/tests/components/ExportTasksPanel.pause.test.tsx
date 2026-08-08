import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('shows only final export tasks in the project task bar', () => {
    act(() => useExportTasksStore.setState({
      restoreActiveTasks: vi.fn(),
      tasks: [
        { id: 'images', taskId: 'task-images', projectId: 'project-a', type: 'generate-images', status: 'RUNNING', createdAt: new Date().toISOString() },
        { id: 'pptx', taskId: 'task-pptx', projectId: 'project-a', type: 'pptx', status: 'COMPLETED', createdAt: new Date().toISOString() },
      ],
    }));

    render(<ExportTasksPanel projectId="project-a" />);

    expect(screen.getByText('PPTX')).toBeInTheDocument();
    expect(screen.queryByText('批量生成图片')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 进行中/)).not.toBeInTheDocument();
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

  it('downloads completed image-mode exports through the desktop save path with the backend filename', () => {
    const saveDownload = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = { saveDownload };
    act(() => useExportTasksStore.setState({
      restoreActiveTasks: vi.fn(),
      tasks: [{
        id: 'pptx',
        taskId: '',
        projectId: 'project-a',
        type: 'pptx',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        downloadUrl: '/files/project-a/exports/年度经营复盘.pptx',
        filename: '年度经营复盘.pptx',
      }],
    }));

    render(<ExportTasksPanel projectId="project-a" />);

    fireEvent.click(screen.getByRole('button', { name: /下载|Download/ }));

    expect(saveDownload).toHaveBeenCalledWith(
      '/files/project-a/exports/年度经营复盘.pptx',
      '年度经营复盘.pptx',
    );
  });

  it('opens export warnings with the editorial surface backdrop', async () => {
    act(() => useExportTasksStore.setState({
      restoreActiveTasks: vi.fn(),
      tasks: [{
        id: 'warn',
        taskId: 'task-warn',
        projectId: 'project-a',
        type: 'video',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        progress: { total: 1, completed: 1, warnings: ['缺少封面页'] },
      }],
    }));

    const { container } = render(<ExportTasksPanel projectId="project-a" />);

    fireEvent.click(screen.getByRole('button', { name: /1 条警告|1 warnings/ }));

    expect(await screen.findByText(/导出警告|Export Warnings/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('bg-black/50');
    expect(container.innerHTML).toContain('bg-[color:var(--app-surface)]/80');
  });

  it('closes warning dialog on Escape and restores focus to its trigger', async () => {
    act(() => useExportTasksStore.setState({
      restoreActiveTasks: vi.fn(),
      tasks: [{
        id: 'warn-focus',
        taskId: 'task-warn-focus',
        projectId: 'project-a',
        type: 'video',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        progress: { total: 1, completed: 1, warnings: ['缺少封面页'] },
      }],
    }));

    render(<ExportTasksPanel projectId="project-a" />);
    const trigger = screen.getByRole('button', { name: /1 条警告|1 warnings/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /导出警告|Export Warnings/ });
    const closeButton = within(dialog).getByRole('button', { name: /关闭 导出警告|Close Export Warnings/ });
    expect(closeButton).toHaveClass('h-10', 'w-10');
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });
});
