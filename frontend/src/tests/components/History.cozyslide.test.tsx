import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { History } from '@/pages/History';

const endpointMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
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
    syncProject: vi.fn(),
    setCurrentProject: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    isDark: false,
    setTheme: vi.fn(),
  }),
}));

describe('History EasySlide clone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    endpointMocks.listProjects.mockResolvedValue({ data: { projects: [], total: 0 } });
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

  it('matches the ezppt-like project dashboard structure', async () => {
    endpointMocks.listProjects.mockResolvedValueOnce({
      data: {
        total: 16,
        projects: [{
          project_id: 'p1',
          project_title: '共盈出海 - 为企业搭建出海高速路',
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
    expect(screen.getByText('共 16 项，第 1 / 4 页')).toBeInTheDocument();
    expect(screen.getByText('翻新')).toBeInTheDocument();
  });
});
