import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Home } from '@/pages/Home';

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listUserTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  };
});

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    isDark: false,
    setTheme: vi.fn(),
  }),
}));

describe('Home workspace clone', () => {
  it('does not auto-open the quick start guide on first visit', async () => {
    vi.useFakeTimers();
    localStorage.clear();

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByText(/欢迎使用 EasySlide/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders workspace-oriented creation entry copy', () => {
    const { container } = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(container.firstElementChild?.className).toContain('bg-[#f5f9fc]');
    expect(container.firstElementChild?.className).not.toContain('yellow');
    expect(container.querySelector('#create')).not.toBeInTheDocument();
    expect(screen.queryByTitle('View on GitHub')).not.toBeInTheDocument();
  });



  it('shows the creation form only on the create page', () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/create"]}>
        <Routes>
          <Route path="/create" element={<Home />} />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('#create')).toBeInTheDocument();
    expect(container.querySelector('#create button')?.className).toContain('from-sky-500');
    expect(screen.getAllByText(/PDF \/ PPTX/i).length).toBeGreaterThan(0);
  });


  it('matches the ezppt workspace navigation entries', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation', { name: '工作台导航' });
    expect(within(nav).getByRole('button', { name: '首页' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '创建项目' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '我的项目' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '素材中心' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '素材生成' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: '使用手册' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '设置' })).toBeInTheDocument();
  });

  it('matches the ezppt app hero headline and capability cards', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: '让 AI 协助完成从构思到成稿的 PPT 创作流程。' })).toBeInTheDocument();
    expect(screen.getByText('从想法到成稿，始终轻松、清晰、可控')).toBeInTheDocument();
    expect(screen.getByText('从想法轻松起步')).toBeInTheDocument();
    expect(screen.getByText('每一步均可编辑')).toBeInTheDocument();
    expect(screen.getByText('每一步均可优化')).toBeInTheDocument();
    expect(screen.getByText('资产与模板可复用')).toBeInTheDocument();
  });

  it('removes the showcase and footer from the local workspace page', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.queryByText(/case showcase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/EasySlide.*footer/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/case thumbnails/i)).not.toBeInTheDocument();
  });

});
