import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentSpinePage } from '@/components/content-project/ContentSpinePage';
import { useContentProjectStore } from '@/store/useContentProjectStore';

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: vi.fn(),
}));

const useStore = vi.mocked(useContentProjectStore);

const project = {
  project_id: 'project-1',
  project_title: '季度复盘',
  last_workspace: null,
  spine: {
    revision: 1,
    status: 'draft',
    document: {
      schema_version: 1,
      topic: { value: '季度复盘', needs_confirmation: false },
      content: { value: '本季度经营结果与下一步行动', needs_confirmation: false },
      audience: { value: '', needs_confirmation: true },
      goal: { value: '', needs_confirmation: true },
      sources: [],
      research: [],
      viewpoints: [],
      facts: [],
      sections: [],
      narrative: { opening: '', progression: [], conclusion: '' },
      needs_confirmation: ['/audience', '/goal'],
    },
  },
} as any;

function renderPage(includeWorkspace = false) {
  return render(
    <MemoryRouter initialEntries={['/project/project-1/spine']}>
      <Routes>
        <Route path="/project/:projectId/spine" element={<ContentSpinePage />} />
        {includeWorkspace && <Route path="/project/:projectId/ppt/outline" element={<div>PPT workspace</div>} />}
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContentSpinePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.mockReturnValue({
      project,
      loading: false,
      error: null,
      confirmSpine: vi.fn(),
      updateSpine: vi.fn().mockResolvedValue(undefined),
      optimizeSpine: vi.fn().mockResolvedValue({
        topic: '季度复盘与下一步行动',
        audience: '管理层',
        goal: '形成决策共识并明确下一步行动',
        rationale: '补齐了受众和行动目标。',
      }),
      initializeWorkspace: vi.fn(),
      load: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('provides an entry to complete audience and goal, then saves a new spine document', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('受众'), { target: { value: '管理层' } });
    fireEvent.change(screen.getByLabelText('目标'), { target: { value: '形成决策共识' } });
    fireEvent.click(screen.getByRole('button', { name: '保存定位' }));

    await waitFor(() => expect(useStore.mock.results[0].value.updateSpine).toHaveBeenCalledTimes(1));
    const savedDocument = useStore.mock.results[0].value.updateSpine.mock.calls[0][0];
    expect(savedDocument.audience).toEqual({ value: '管理层', needs_confirmation: false });
    expect(savedDocument.goal).toEqual({ value: '形成决策共识', needs_confirmation: false });
    expect(savedDocument.needs_confirmation).toEqual([]);
  });

  it('fills editable positioning fields with AI suggestions without saving automatically', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('受众'), { target: { value: '管理层' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI 优化定位' }));

    await waitFor(() => expect(useStore.mock.results[0].value.optimizeSpine).toHaveBeenCalledWith({
      topic: '季度复盘', audience: '管理层', goal: '',
    }));
    expect(screen.getByLabelText('主题')).toHaveValue('季度复盘与下一步行动');
    expect(screen.getByLabelText('目标')).toHaveValue('形成决策共识并明确下一步行动');
    expect(useStore.mock.results[0].value.updateSpine).not.toHaveBeenCalled();
  });

  it('continues to the selected workspace after confirming the spine', async () => {
    const completedProject = {
      ...project,
      last_workspace: 'ppt',
      spine: {
        ...project.spine,
        status: 'draft',
        document: {
          ...project.spine.document,
          audience: { value: '管理层', needs_confirmation: false },
          goal: { value: '形成共识', needs_confirmation: false },
          needs_confirmation: [],
        },
      },
    };
    useStore.mockReturnValue({
      ...useStore.mock.results[0]?.value,
      project: completedProject,
      confirmSpine: vi.fn().mockResolvedValue(undefined),
      updateSpine: vi.fn().mockResolvedValue(undefined),
      optimizeSpine: vi.fn(),
    } as any);
    renderPage(true);

    fireEvent.click(screen.getByRole('button', { name: '确认内容主线' }));

    await waitFor(() => expect(screen.getByText('PPT workspace')).toBeInTheDocument());
    expect(useStore.mock.results[0].value.confirmSpine).toHaveBeenCalledTimes(1);
  });
});
