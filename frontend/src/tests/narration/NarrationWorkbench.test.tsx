import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NarrationWorkbench } from '@/components/narration/NarrationWorkbench';
import * as endpoints from '@/api/endpoints';


vi.mock('@/api/endpoints', () => ({
  getProjectNarrations: vi.fn(),
  getPageNarrationVersions: vi.fn(),
  createPageNarrationVersion: vi.fn(),
  applyNarrationVersion: vi.fn(),
  discardNarrationCandidate: vi.fn(),
  setPageNarrationLock: vi.fn(),
  createNarrationAiCandidate: vi.fn(),
  previewPageNarration: vi.fn(),
  createNarrationAiJob: vi.fn(),
  getNarrationAiJobResult: vi.fn(),
  pauseNarrationAiJob: vi.fn(),
  resumeNarrationAiJob: vi.fn(),
  cancelNarrationAiJob: vi.fn(),
  listNarrationAiJobs: vi.fn(),
  listNarrationCandidates: vi.fn(),
  batchApplyNarrationCandidates: vi.fn(),
  batchArchiveNarrationCandidates: vi.fn(),
}));

const summary = {
  pages: [{
    page_id: 'page-1', order_index: 0, current_version_id: 'version-1',
    locked: false, revision: 3, word_count: 4, estimated_seconds: 1, candidate_count: 0,
  }],
  total_pages: 1,
  confirmed_pages: 1,
  missing_pages: 0,
  candidate_pages: 0,
};

const version = {
  id: 'version-1', page_id: 'page-1', version_number: 1, mode: 'single' as const,
  language: 'zh-CN', text: '当前确认稿', segments: [], source_type: 'manual' as const,
  status: 'applied' as const, content_hash: 'hash', created_by: 'user',
};

describe('NarrationWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(endpoints.getProjectNarrations).mockResolvedValue({ success: true, message: '', data: summary });
    vi.mocked(endpoints.listNarrationAiJobs).mockResolvedValue({ success: true, message: '', data: { jobs: [], total: 0 } });
    vi.mocked(endpoints.getPageNarrationVersions).mockResolvedValue({
      success: true,
      message: '',
      data: { page_id: 'page-1', revision: 3, current_version_id: 'version-1', locked: false, versions: [version] },
    });
    vi.mocked(endpoints.createPageNarrationVersion).mockResolvedValue({
      success: true,
      message: '',
      data: { version: { ...version, id: 'version-2', text: '人工修改稿' }, revision: 4 },
    });
  });

  it('loads the current version and saves with base revision', async () => {
    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);

    const editor = await screen.findByLabelText('旁白文案');
    expect(editor).toHaveValue('当前确认稿');
    fireEvent.change(editor, { target: { value: '人工修改稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存确认稿' }));

    await waitFor(() => expect(endpoints.createPageNarrationVersion).toHaveBeenCalledWith(
      'project-1',
      'page-1',
      expect.objectContaining({ baseRevision: 3, text: '人工修改稿', mode: 'single' }),
    ));
  });

  it('keeps the local draft when the server reports a revision conflict', async () => {
    vi.mocked(endpoints.createPageNarrationVersion).mockRejectedValue({
      response: { status: 409, data: { error: { message: '旁白已被更新' } } },
    });
    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);

    const editor = await screen.findByLabelText('旁白文案');
    fireEvent.change(editor, { target: { value: '不能丢失的本地草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存确认稿' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('旁白已被更新');
    expect(editor).toHaveValue('不能丢失的本地草稿');
  });

  it('supports Escape without hiding an unsaved draft', async () => {
    const onClose = vi.fn();
    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={onClose} />);
    const editor = await screen.findByLabelText('旁白文案');
    fireEvent.change(editor, { target: { value: '未保存稿' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('请先保存或放弃当前修改');
  });

  it('returns to the current workspace without navigating when closed', async () => {
    const onClose = vi.fn();
    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={onClose} />);

    await screen.findByLabelText('旁白文案');
    fireEvent.click(screen.getByRole('button', { name: '返回当前工作区' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveClass('z-[130]');
  });

  it('generates candidates for missing pages and refreshes without applying them', async () => {
    vi.mocked(endpoints.getProjectNarrations).mockResolvedValue({
      success: true, message: '', data: { ...summary, total_pages: 3, missing_pages: 2 },
    });
    vi.mocked(endpoints.createNarrationAiJob).mockResolvedValue({
      success: true, data: { task_id: 'task-1', status: 'PENDING', total: 2 },
    });
    vi.mocked(endpoints.getNarrationAiJobResult)
      .mockResolvedValueOnce({
        success: true,
        data: { task_id: 'task-1', status: 'PROCESSING', total: 2, completed: 1, failed: 0, skipped: 0, pages: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { task_id: 'task-1', status: 'COMPLETED', total: 2, completed: 2, failed: 0, skipped: 0, pages: [] },
      });

    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);
    await screen.findByLabelText('旁白文案');
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成缺失页' }));

    await waitFor(() => expect(endpoints.createNarrationAiJob).toHaveBeenCalledWith('project-1', {
      scope: 'missing', operation: 'generate',
    }));
    expect(await screen.findByText('1 / 2', {}, { timeout: 2500 })).toBeInTheDocument();
    await waitFor(() => expect(endpoints.getProjectNarrations).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(endpoints.applyNarrationVersion).not.toHaveBeenCalled();
  });

  it('pauses, resumes, and cancels a running batch job', async () => {
    vi.mocked(endpoints.getProjectNarrations).mockResolvedValue({
      success: true, message: '', data: { ...summary, total_pages: 3, missing_pages: 2 },
    });
    vi.mocked(endpoints.createNarrationAiJob).mockResolvedValue({
      success: true, data: { task_id: 'task-1', status: 'PROCESSING', total: 2 },
    });
    vi.mocked(endpoints.pauseNarrationAiJob).mockResolvedValue({ success: true, data: { status: 'PAUSED' } });
    vi.mocked(endpoints.resumeNarrationAiJob).mockResolvedValue({ success: true, data: { status: 'PROCESSING' } });
    vi.mocked(endpoints.cancelNarrationAiJob).mockResolvedValue({ success: true, data: { status: 'CANCELLED' } });

    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);
    await screen.findByLabelText('旁白文案');
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成缺失页' }));
    fireEvent.click(await screen.findByRole('button', { name: '暂停' }));
    expect(await screen.findByRole('button', { name: '恢复' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    fireEvent.click(await screen.findByRole('button', { name: '取消' }));

    await waitFor(() => expect(endpoints.cancelNarrationAiJob).toHaveBeenCalledWith('project-1', 'task-1'));
  });

  it('retries only failed pages from a completed batch job', async () => {
    vi.mocked(endpoints.getProjectNarrations).mockResolvedValue({
      success: true, message: '', data: { ...summary, total_pages: 2, missing_pages: 1 },
    });
    vi.mocked(endpoints.createNarrationAiJob)
      .mockResolvedValueOnce({ success: true, data: { task_id: 'task-1', status: 'PENDING', total: 1 } })
      .mockResolvedValueOnce({ success: true, data: { task_id: 'task-2', status: 'PENDING', total: 1 } });
    vi.mocked(endpoints.getNarrationAiJobResult).mockResolvedValueOnce({
      success: true,
      data: {
        task_id: 'task-1', status: 'COMPLETED', total: 1, completed: 1, failed: 1, skipped: 0,
        pages: [{ page_id: 'page-2', status: 'failed', reason: 'ai_service_error' }],
      },
    });

    render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);
    await screen.findByLabelText('旁白文案');
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成缺失页' }));
    fireEvent.click(await screen.findByRole('button', { name: '重试失败页' }, { timeout: 2500 }));

    await waitFor(() => expect(endpoints.createNarrationAiJob).toHaveBeenLastCalledWith('project-1', {
      scope: 'selected', pageIds: ['page-2'], operation: 'generate',
    }));
  });

  it('clears batch polling when unmounted', async () => {
    const clearTimeout = vi.spyOn(window, 'clearTimeout');
    vi.mocked(endpoints.getProjectNarrations).mockResolvedValue({
      success: true, message: '', data: { ...summary, total_pages: 2, missing_pages: 1 },
    });
    vi.mocked(endpoints.createNarrationAiJob).mockResolvedValue({
      success: true, data: { task_id: 'task-1', status: 'PROCESSING', total: 1 },
    });

    const { unmount } = render(<NarrationWorkbench open projectId="project-1" initialPageId="page-1" onClose={vi.fn()} />);
    await screen.findByLabelText('旁白文案');
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成缺失页' }));
    await screen.findByRole('button', { name: '暂停' });
    unmount();

    expect(clearTimeout).toHaveBeenCalled();
  });
});
