import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('renders the token-driven creation workspace', () => {
    const { container } = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(container.firstElementChild).toHaveClass('create-reference-canvas');
    expect(container.firstElementChild?.className).not.toContain('yellow');
    expect(container.querySelector('#create')).toBeInTheDocument();
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
    const createNavButton = within(screen.getByRole('navigation', { name: '工作台导航' })).getByRole('button', { name: '创建项目' });
    expect(createNavButton).toHaveAttribute('aria-current', 'page');
    expect(createNavButton).toHaveClass('bg-[var(--app-surface)]');
    expect(screen.getByRole('button', { name: '下一步' })).toHaveClass('bg-[var(--app-primary-action)]');
    expect(screen.getAllByText(/PDF \/ PPTX/i).length).toBeGreaterThan(0);
  });


  it('matches the ezppt workspace navigation entries', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation', { name: '工作台导航' });
    // 阶段4：应用导航为顶部横条
    expect(nav).toHaveClass('sticky', 'top-0', 'h-16');
    expect(nav).not.toHaveClass('lg:overflow-hidden');
    expect(within(nav).getByRole('button', { name: '首页' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '创建项目' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '我的项目' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '素材中心' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: '素材生成' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: '使用手册' })).not.toBeInTheDocument();
    const settingsButton = within(nav).getByRole('button', { name: '设置' });
    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton).not.toHaveTextContent('设置');
    expect(within(nav).getByRole('button', { name: '界面语言' })).not.toHaveTextContent(/EN|中/);
    fireEvent.click(within(nav).getByRole('button', { name: '主题模式' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EasySlide' })).toBeInTheDocument();
  });

  it('keeps creation controls focused on the real workflow instead of a marketing hero', () => {
    const { container } = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: '创建项目' })).toBeInTheDocument();
    expect(container.querySelector('#create')).toHaveClass('border-y', 'bg-[var(--app-surface)]');
    expect(container.querySelector('#create')).not.toHaveClass('rounded-[var(--app-radius-modal)]');
    expect(screen.getByRole('radiogroup', { name: '创建方式' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: '生成模式' })).toBeInTheDocument();
    expect(screen.queryByText('从想法到成稿，始终轻松、清晰、可控')).not.toBeInTheDocument();
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
