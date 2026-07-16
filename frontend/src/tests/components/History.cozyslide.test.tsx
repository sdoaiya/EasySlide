import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { History } from '@/pages/History';

const endpointMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  syncProject: vi.fn(),
  setCurrentProject: vi.fn(),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listProjects: endpointMocks.listProjects,
  };
});

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: () => ({
    syncProject: endpointMocks.syncProject,
    setCurrentProject: endpointMocks.setCurrentProject,
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    isDark: false,
    setTheme: vi.fn(),
  }),
}));

function clickProjectCard(title: string) {
  const heading = screen.getByText(title);
  const card = heading.closest('h3')?.parentElement?.parentElement?.parentElement?.parentElement as HTMLElement | null;
  if (!card) throw new Error(`card not found for ${title}`);
  fireEvent.click(card);
}

describe('History EasySlide clone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    localStorage.clear();
    endpointMocks.listProjects.mockResolvedValue({ data: { projects: [], total: 0 } });
    endpointMocks.syncProject.mockResolvedValue(undefined);
  });

  it('renders my-projects copy and branded empty state', async () => {
    const { container } = render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    expect(container.firstElementChild?.className).toContain('bg-[#f5f9fc]');
    expect(container.firstElementChild?.className).not.toContain('banana');
    expect(await screen.findByRole('heading', { name: '我的项目' })).toBeInTheDocument();
    expect(screen.getByText('统一查看与管理当前账户下的项目内容。')).toBeInTheDocument();
    expect(screen.getByText('暂无项目')).toBeInTheDocument();
    expect(screen.getByText('创建新项目')).toBeInTheDocument();
    expect(screen.getByAltText('EasySlide Logo')).toBeInTheDocument();
    expect(screen.queryByText('历史项目')).not.toBeInTheDocument();
  });

  it('uses server-wide project stats instead of the current page only', async () => {
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 10,
        stats: { total: 10, completed: 4, generating: 2, in_progress: 4 },
        projects: [{
          project_id: 'p1',
          project_title: '当前页项目',
          status: 'DRAFT',
          pages: [],
        }],
      },
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    await screen.findByText('项目总数');
    const completedCard = screen.getByText('已完成').parentElement?.parentElement?.parentElement;
    const generatingCard = screen.getByText('生成中').parentElement?.parentElement?.parentElement;
    expect(completedCard).toHaveTextContent('4');
    expect(generatingCard).toHaveTextContent('2');
  });

  it('matches the ezppt-like project dashboard structure', async () => {
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 16,
        projects: [{
          project_id: 'p1',
          project_title: '共赢出海 - 为企业搭建出海高速路',
          idea_prompt: '出海方案',
          creation_type: 'renovation',
          status: 'COMPLETED',
          created_at: '2026-06-16T18:12:00Z',
          updated_at: '2026-06-16T18:12:00Z',
          pages: [{ page_id: 'pg1', order_index: 0, status: 'COMPLETED', generated_image_url: '/files/p1/page.png' }],
        }],
      },
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    expect(await screen.findByText('项目总数')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('项目列表')).toBeInTheDocument();
    expect(screen.getByText('支持项目编辑、重命名、删除及批量管理。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('16') && content.includes('1') && content.includes('4'))).toBeInTheDocument();
    expect(screen.getByText('翻新')).toBeInTheDocument();
  });

  it('routes from the latest synced project instead of the stale history item', async () => {
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 1,
        projects: [{
          project_id: 'native-1',
          project_title: '原生项目',
          render_mode: 'native',
          status: 'DESCRIPTIONS_GENERATED',
          created_at: '2026-07-12T10:00:00Z',
          updated_at: '2026-07-12T10:00:00Z',
          pages: [{ page_id: 'page-1', order_index: 0, status: 'DESCRIPTION_GENERATED', description_content: { text: '旧数据' } }],
        }],
      },
    });
    endpointMocks.syncProject.mockResolvedValueOnce({
      project_id: 'native-1',
      render_mode: 'native',
      status: 'NATIVE_DECK_GENERATED',
      pages: [{ page_id: 'page-1', native_layout: 'PulseCover', status: 'NATIVE_GENERATED' }],
    });

    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
          <Route path="/project/:projectId/preview" element={<div>原生编辑器</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('原生项目');
    clickProjectCard('原生项目');

    await waitFor(() => expect(endpointMocks.syncProject).toHaveBeenCalledWith('native-1'));
    expect(await screen.findByText('原生编辑器')).toBeInTheDocument();
  });

  it('restores an in-flight native generation from project localStorage', async () => {
    localStorage.setItem('nativeDeckGenerationTask:native-1', 'task-1');
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 1,
        projects: [{
          project_id: 'native-1',
          project_title: 'native in progress',
          render_mode: 'native',
          status: 'DESCRIPTIONS_GENERATED',
          created_at: '2026-07-12T10:00:00Z',
          updated_at: '2026-07-12T10:00:00Z',
          pages: [{ page_id: 'page-1', order_index: 0, status: 'DESCRIPTION_GENERATED', description_content: { text: 'waiting for native layout' } }],
        }],
      },
    });
    endpointMocks.syncProject.mockResolvedValueOnce({
      project_id: 'native-1',
      render_mode: 'native',
      status: 'DESCRIPTIONS_GENERATED',
      pages: [{ page_id: 'page-1', status: 'DESCRIPTION_GENERATED', description_content: { text: 'waiting for native layout' } }],
    });

    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
          <Route path="/project/:projectId/preview" element={<div>native preview</div>} />
          <Route path="/project/:projectId/detail" element={<div>detail page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('native in progress');
    clickProjectCard('native in progress');

    await waitFor(() => expect(endpointMocks.syncProject).toHaveBeenCalledWith('native-1'));
    expect(await screen.findByText('native preview')).toBeInTheDocument();
  });
});
