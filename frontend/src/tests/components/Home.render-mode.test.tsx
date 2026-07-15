import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from '@/pages/Home';
import { dashiThemes } from '@/native-deck/dashiThemes';

const initializeProject = vi.fn();

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: () => ({ initializeProject, isGlobalLoading: false }),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listUserTemplates: vi.fn(() => new Promise(() => {})),
    listUserStyleTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  };
});

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', isDark: false, setTheme: vi.fn() }),
}));

vi.mock('@/components/shared/TemplateSelector', () => ({
  TemplateSelector: () => <div data-testid="template-selector" />,
  getTemplateFile: vi.fn(),
}));

const renderHome = () => render(
  <MemoryRouter initialEntries={['/create']}>
    <Routes>
      <Route path="/create" element={<Home />} />
    </Routes>
  </MemoryRouter>
);

describe('Home render mode selection', () => {
  beforeEach(() => {
    initializeProject.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
  });

  it('defaults to the accessible image mode card', () => {
    renderHome();

    expect(screen.getByRole('radio', { name: '图片生成' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '原生可编辑' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('生成高质量图片页面，可导出 PDF / PPTX。')).toBeInTheDocument();
  });

  it('shows all native themes with preview details and a stable image fallback', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('radio', { name: '原生可编辑' }));

    const themeGroup = screen.getByRole('radiogroup', { name: '原生主题' });
    expect(within(themeGroup).getAllByRole('radio')).toHaveLength(12);
    expect(screen.getByRole('radio', { name: '轻拟态风' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(dashiThemes[0].description)).toBeInTheDocument();
    expect(screen.getByText(dashiThemes[0].useCases)).toBeInTheDocument();

    const preview = screen.getByRole('img', { name: '轻拟态风主题预览' });
    expect(preview).toHaveAttribute('src', '/assets/native-theme-previews/theme01.webp');
    fireEvent.error(preview);
    expect(screen.queryByRole('img', { name: '轻拟态风主题预览' })).not.toBeInTheDocument();
    expect(screen.getAllByText('轻拟态风').some((element) => element.offsetParent !== null || element.isConnected)).toBe(true);
  });

  it('uses a single cyan border focus treatment for the create textarea', () => {
    renderHome();

    const frame = screen.getByRole('textbox', { name: /生成一份关于/ }).parentElement?.parentElement;
    expect(frame).toHaveClass('focus-within:!border-cyan-500', 'focus-within:!ring-0');
    expect(frame).not.toHaveClass('focus-within:ring-banana-500', 'border-2');
  });

  it('sends native mode and the selected DashiAI theme when creating a project', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('radio', { name: '原生可编辑' }));
    expect(screen.getByText('生成可编辑页面，导出不依赖版面解析服务。')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '轻拟态风' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: '深浅代码风' }));
    await user.type(screen.getByRole('textbox', { name: /生成一份关于/ }), '原生项目');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(initializeProject).toHaveBeenCalledOnce());

    const call = initializeProject.mock.calls[0];
    expect(call[0]).toBe('idea');
    expect(call[1].trim()).toBe('原生项目');
    expect(call.slice(2)).toEqual([
      undefined,
      undefined,
      undefined,
      '16:9',
      'native',
      'theme03',
      undefined,
    ]);
  });

  it('sends core01 when classic native generation is selected', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('radio', { name: '原生可编辑' }));
    await user.click(screen.getByRole('radio', { name: '经典原生生成' }));
    await user.type(screen.getByRole('textbox', { name: /生成一份关于/ }), '经典原生项目');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(initializeProject).toHaveBeenCalledOnce());

    expect(initializeProject.mock.calls[0].slice(6, 8)).toEqual(['native', 'core01']);
  });

  it('hides image templates in native mode but keeps text style as a generation hint', async () => {
    const user = userEvent.setup();
    renderHome();

    expect(screen.getByTestId('template-selector')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '原生可编辑' }));

    expect(screen.queryByTestId('template-selector')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/描述您想要的 PPT 风格/), '科技蓝风格');
    await user.type(screen.getByRole('textbox', { name: /生成一份关于/ }), '原生项目');
    await user.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() => expect(initializeProject).toHaveBeenCalledOnce());
    expect(initializeProject.mock.calls[0][3]).toBe('科技蓝风格');
  });
});
