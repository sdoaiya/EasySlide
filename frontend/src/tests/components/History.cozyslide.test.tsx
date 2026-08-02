import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { History } from '@/pages/History';
import { useProjectCatalogStore } from '@/store/useProjectCatalogStore';

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
  const card = screen.getByRole('button', { name: new RegExp(title) });
  if (!card) throw new Error(`card not found for ${title}`);
  fireEvent.click(card);
}

describe('History EasySlide clone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    localStorage.clear();
    // 目录 store 的 30s 新鲜窗口会缓存首个响应；每个用例重置快照
    useProjectCatalogStore.setState({ snapshots: {}, inflight: {}, lastFetchedAt: {} });
    endpointMocks.listProjects.mockResolvedValue({ data: { projects: [], total: 0 } });
    endpointMocks.syncProject.mockResolvedValue(undefined);
  });

  it('renders the compact editorial workbench and empty state', async () => {
    const { container } = render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    expect(container.firstElementChild?.className).toContain('bg-[var(--app-background)]');
    expect(container.firstElementChild?.className).not.toContain('banana');
    expect(await screen.findByRole('heading', { name: '作品工作台' })).toBeInTheDocument();
    expect(screen.getByText(/PPT、视频与播客/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜索项目或灵感...' })).toBeInTheDocument();
    expect(screen.queryByText(/从想法到成稿/)).not.toBeInTheDocument();
    expect(await screen.findByText('暂无项目')).toBeInTheDocument();
    expect(screen.getAllByText('创建新项目').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '灵感墙' })).toBeInTheDocument();
    expect(screen.getByAltText('EasySlide Logo')).toBeInTheDocument();

    // 应用导航为桌面左侧工具架（216px 可折叠）
    const navBar = screen.getByRole('navigation', { name: '工作台导航' });
    expect(navBar).toHaveClass('lg:fixed', 'lg:w-[216px]');
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
      <MemoryRouter initialEntries={['/history']}>
        <Routes><Route path="/history" element={<History />} /></Routes>
      </MemoryRouter>
    );

    await screen.findByText('项目总数');
    const completedCard = screen.getByText('已完成').parentElement?.parentElement?.parentElement;
    const generatingCard = screen.getByText('生成中').parentElement?.parentElement?.parentElement;
    expect(completedCard).toHaveTextContent('4');
    expect(generatingCard).toHaveTextContent('2');
  });

  it('uses the four-column content project wall on home', async () => {
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
          workspaces: [
            { id: 'w1', project_id: 'p1', kind: 'ppt', state: 'ready', revision: 1, source_kind: 'migration', settings: {} },
            { id: 'w2', project_id: 'p1', kind: 'video', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
            { id: 'w3', project_id: 'p1', kind: 'podcast', state: 'uninitialized', revision: 0, source_kind: 'manual', settings: {} },
          ],
          pages: [{ page_id: 'pg1', order_index: 0, status: 'COMPLETED', generated_image_url: '/files/p1/page.png' }],
        }],
      },
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    expect(await screen.findByText('共赢出海 - 为企业搭建出海高速路')).toBeInTheDocument();
    expect(screen.getByText('项目列表')).toBeInTheDocument();
    expect(screen.getByText('支持项目编辑、重命名、删除及批量管理。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('16') && content.includes('1') && content.includes('4'))).toBeInTheDocument();
    // PPT 同时出现在类型筛选按钮与项目卡片徽标中，需断言存在而非唯一
    expect(screen.getAllByText('PPT').length).toBeGreaterThan(0);
    expect(screen.getByTestId('project-grid')).toHaveClass('xl:grid-cols-4');
    const inspirationWall = screen.getByRole('heading', { name: '灵感墙' }).closest('section');
    expect(inspirationWall).not.toBeNull();
    expect(within(inspirationWall!).getAllByRole('img')).toHaveLength(3);
    expect(within(inspirationWall!).getByRole('img', { name: '共赢出海 - 为企业搭建出海高速路 项目预览' })).toHaveAttribute('src', '/files/p1/page.png');
    expect(within(inspirationWall!).getByRole('img', { name: '精选模板 2' })).toBeInTheDocument();
    expect(endpointMocks.listProjects).toHaveBeenCalledWith(4, 0, undefined, undefined);
    expect(screen.getByTestId('project-grid').innerHTML).not.toContain('shadow-sm');
  });

  it('migrates the old five-project preference to four projects per page', async () => {
    localStorage.setItem('history_page_size', '5');

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    await waitFor(() => expect(endpointMocks.listProjects).toHaveBeenCalledWith(4, 0, undefined, undefined));
  });

  it('shows a persisted snapshot immediately but still calibrates it after restart and invalidation', async () => {
    const key = { limit: 4, offset: 0, status: null, workspace: null } as const;
    const staleProject = { project_id: 'stale', project_title: '本地快照', status: 'DRAFT', pages: [] } as any;
    useProjectCatalogStore.setState({
      snapshots: { '[4,0,"",""]': { projects: [staleProject], total: 1, stats: null, fetchedAt: Date.now() } },
      inflight: {},
      lastFetchedAt: {},
    });
    endpointMocks.listProjects.mockResolvedValue({ data: { projects: [], total: 0 } });
    const callsBefore = endpointMocks.listProjects.mock.calls.length;

    await useProjectCatalogStore.getState().loadCatalog(key);
    expect(endpointMocks.listProjects).toHaveBeenCalledTimes(callsBefore + 1);

    useProjectCatalogStore.getState().invalidate(key);
    await useProjectCatalogStore.getState().loadCatalog(key);
    expect(endpointMocks.listProjects).toHaveBeenCalledTimes(callsBefore + 2);
  });

  it('keeps the original list layout on /history', async () => {
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 1,
        projects: [{ project_id: 'p-list', project_title: '列表项目', status: 'DRAFT', pages: [] }],
      },
    });

    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: '我的项目' })).toBeInTheDocument();
    expect(screen.getByTestId('project-list')).toHaveClass('space-y-2');
    expect(screen.getByTestId('project-list').innerHTML).not.toContain('shadow-sm');
    expect(screen.queryByTestId('project-grid')).not.toBeInTheDocument();
    const editButton = screen.getByRole('button', { name: '编辑' });
    expect(editButton.parentElement).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      '[@media(hover:none)]:opacity-100'
    );
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
          <Route path="/project/:projectId/ppt/editor" element={<div>原生编辑器</div>} />
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
          <Route path="/project/:projectId/ppt/editor" element={<div>native preview</div>} />
          <Route path="/project/:projectId/ppt/detail" element={<div>detail page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('native in progress');
    clickProjectCard('native in progress');

    await waitFor(() => expect(endpointMocks.syncProject).toHaveBeenCalledWith('native-1'));
    expect(await screen.findByText('native preview')).toBeInTheDocument();
  });
});
