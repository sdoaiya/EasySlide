import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings, SettingsPage } from '@/pages/Settings';

const endpointMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getOpenAIOAuthStatus: vi.fn(),
  getOpenAIOAuthUrl: vi.fn(),
  getOpenAIOAuthModels: vi.fn(),
  getModelOptions: vi.fn(),
  checkForUpdates: vi.fn(),
  clearExportCache: vi.fn(),
}));

const connectedSettings = {
  theme: 'light',
  language: 'en',
  ai_provider_format: 'openai',
  openai_oauth_connected: true,
  openai_oauth_account_id: 'acct_test',
};

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    getSettings: endpointMocks.getSettings,
    getOpenAIOAuthStatus: endpointMocks.getOpenAIOAuthStatus,
    getOpenAIOAuthUrl: endpointMocks.getOpenAIOAuthUrl,
    getOpenAIOAuthModels: endpointMocks.getOpenAIOAuthModels,
    getModelOptions: endpointMocks.getModelOptions,
    checkForUpdates: endpointMocks.checkForUpdates,
    clearExportCache: endpointMocks.clearExportCache,
  };
});

describe('Settings OpenAI entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    endpointMocks.getSettings.mockResolvedValue({ data: connectedSettings });
    endpointMocks.getOpenAIOAuthStatus.mockResolvedValue({ data: { connected: true, account_id: 'acct_test' } });
    endpointMocks.getOpenAIOAuthUrl.mockResolvedValue({
      success: true,
      data: {
        auth_url: 'https://auth.openai.com/oauth/authorize?state=test',
        callback_server_available: true,
      },
    });
    endpointMocks.getOpenAIOAuthModels.mockResolvedValue({
      data: {
        text_models: ['gpt-5.5', 'gpt-5.4-mini'],
        image_models: ['gpt-image-2', 'gpt-image-1'],
        models: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-image-2', 'gpt-image-1'],
      },
    });
    endpointMocks.getModelOptions.mockResolvedValue({
      success: true,
      data: { models: ['gpt-4o-mini', 'gpt-4.1-mini'] },
    });
    endpointMocks.checkForUpdates.mockResolvedValue({ data: { status: 'unknown', update_available: false, message: '', repository: '', current: { is_docker: false }, latest: null } });
    endpointMocks.clearExportCache.mockResolvedValue({
      data: { deleted_files: 3, freed_bytes: 2 * 1024 * 1024, cleared_projects: 1, skipped_active_projects: 0 },
    });
  });

  it('surfaces OpenAI connection as a first-class settings section', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i)).toBeInTheDocument();
    const openAISection = screen.getByTestId('openai-primary-section');
    expect(openAISection.querySelector('h2')?.className).toContain('text-[var(--app-text)]');
    expect(
      Array.from(openAISection.querySelectorAll('div')).some((node) =>
        node.className.includes('bg-[var(--app-index-green)]')
      )
    ).toBe(true);
    const modelConfigSection = screen.getByTestId('model-config-section');
    expect(modelConfigSection.querySelector('h2')?.className).toContain('text-[var(--app-text)]');
    expect(modelConfigSection.querySelector('h2')?.className).not.toContain('text-gray-');
    const serviceTestSection = document.getElementById('settings-tests');
    expect(serviceTestSection?.querySelector('div[class*="border-b"]')?.className).toContain('border-[var(--app-border)]');
    expect(serviceTestSection?.querySelector('div[class*="border-b"]')?.className).not.toContain('border-gray');
    expect((await screen.findAllByText(/Default AI Provider|默认 AI 提供商/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^OpenAI Authorization$|^OpenAI 授权连接$/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Available Models|可用模型/i)).toBeInTheDocument();
    expect(await screen.findByText('gpt-image-2')).toBeInTheDocument();
    expect(screen.queryByText(/^OpenAI 账号连接$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AIHubMix/i)).not.toBeInTheDocument();
    screen.getAllByRole('link').forEach((link) => {
      expect(link.getAttribute('href') || '').not.toContain('aihubmix');
    });
    const openaiPlatformLinks = screen.getAllByRole('link', { name: /OpenAI Platform|访问 OpenAI Platform/i });
    expect(openaiPlatformLinks.length).toBeGreaterThan(0);
    expect(screen.queryByText(/EasySlide Settings Center|EasySlide 设置中心/i)).not.toBeInTheDocument();
    expect(screen.queryByText('EasySlide Workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/管理 AI 提供商、OpenAI 授权、模型、解析、导出与工作区偏好/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^About$|^关于$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current Version|当前版本|Official Website|官方网站|Check for Updates|检查更新/i)).not.toBeInTheDocument();
  });

  it('keeps export settings last and offsets section focus below the shared top nav', async () => {
    const { container } = render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i);
    const settingsNav = screen.getAllByRole('navigation').find((nav) =>
      within(nav).queryByRole('button', { name: /Export Settings|导出设置/i })
    );
    expect(settingsNav).toBeDefined();
    const navButtons = within(settingsNav!).getAllByRole('button');
    expect(navButtons[navButtons.length - 1]).toHaveTextContent(/Export Settings|导出设置/i);

    const sections = Array.from(container.querySelectorAll<HTMLElement>('section[id^="settings-"]'));
    expect(sections[sections.length - 1]?.id).toBe('settings-export');
    sections.forEach((section) => expect(section).toHaveClass('scroll-mt-32'));
  });

  it('clears internal project exports only after confirmation', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Clear Project Export Cache|清理项目导出缓存/i }));
    expect(endpointMocks.clearExportCache).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Clear Cache|确认清理/i }));

    await waitFor(() => expect(endpointMocks.clearExportCache).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Cleared 3 files and freed 2.0 MB|已清理 3 个文件，释放 2.0 MB/i)).toBeInTheDocument();
  }, 15_000);

  it('uses a horizontal section navigator when embedded in project settings', async () => {
    render(
      <MemoryRouter>
        <Settings embedded />
      </MemoryRouter>
    );

    await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i);
    const settingsNav = screen.getByRole('navigation', { name: /Settings|设置/i });
    expect(settingsNav).toHaveAttribute('data-layout', 'embedded');
    expect(settingsNav.closest('aside')).toBeNull();
  });

  it('hides optional parsing, repair, OCR, and TTS settings from the frontend', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i);

    expect(screen.queryByText(/MinerU Configuration|MinerU 配置/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Baidu Inpaint Configuration|百度 Inpaint 配置/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^OCR Service$|^OCR 服务$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paddle PDF Parsing|Paddle PDF 解析/i)).not.toBeInTheDocument();
  });

  it('uses the local workspace navigation without recreating login entry points', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({
      data: {
        ...connectedSettings,
        language: 'zh',
      },
    });

    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );

    const topNav = await screen.findByRole('navigation', { name: '工作台导航' });
    expect(within(topNav).getByRole('button', { name: '设置' })).toHaveAttribute('aria-current', 'page');
    const settingsNav = screen.getByRole('navigation', { name: '设置' });
    expect(settingsNav.closest('aside')).toBeNull();
    expect(settingsNav).toHaveClass('grid-cols-2', 'border-b');
    ['默认 AI 提供商', '模型配置', '导出设置', '高级设置', '服务测试'].forEach((label) => {
      expect(within(settingsNav).getByRole('button', { name: label })).toBeInTheDocument();
    });
    const providerSection = screen.getByTestId('global-api-config-section');
    expect(providerSection).toHaveAttribute('id', 'settings-provider');
    expect(providerSection).toHaveClass('scroll-mt-32');
    fireEvent.click(within(settingsNav).getByRole('button', { name: '默认 AI 提供商' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollIntoView.mock.instances[0]).toBe(providerSection);
    expect(screen.queryByRole('button', { name: '使用手册' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回首页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /登录|Login/i })).not.toBeInTheDocument();
  });

  it('keeps the local settings page usable when initial settings fail to load', async () => {
    endpointMocks.getSettings.mockRejectedValueOnce(new Error('Request failed with status code 500'));

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i)).toBeInTheDocument();
    expect(screen.queryByText(/EasySlide Settings Center|EasySlide 设置中心/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/加载设置失败|Failed to load settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 500/i)).not.toBeInTheDocument();
  }, 15000);

  it('groups OpenAI OAuth models by text and image capability', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/OpenAI Text Models|OpenAI 文本模型/i)).toBeInTheDocument();
    expect(await screen.findByText(/OpenAI Image Models|OpenAI 图片模型/i)).toBeInTheDocument();
    expect(await screen.findByText('gpt-5.5')).toBeInTheDocument();
    expect(await screen.findByText('gpt-image-2')).toBeInTheDocument();
  });

  it('presents OpenAI OAuth as a guided setup flow', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Authorize OpenAI|授权连接 OpenAI/i)).toBeInTheDocument();
    expect(await screen.findByText(/Apply recommended setup|应用推荐配置/i)).toBeInTheDocument();
    expect(await screen.findByText(/Start creating slides|开始创作演示文稿/i)).toBeInTheDocument();
    expect(screen.queryByText('连接 OpenAI 账号')).not.toBeInTheDocument();
  });

  it('shows a clear OpenAI connection prompt before OAuth is connected', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({
      data: {
        ...connectedSettings,
        language: 'zh',
        openai_oauth_connected: false,
        openai_oauth_account_id: undefined,
      },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Please authorize OpenAI first|请先授权连接 OpenAI/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '授权连接 OpenAI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Login with OpenAI' })).not.toBeInTheDocument();
    expect(await screen.findByText('连接后仍失败？')).toBeInTheDocument();
    expect(screen.queryByText('登录后连接失败？')).not.toBeInTheDocument();
    const disabledCodexOptions = await screen.findAllByRole('option', {
      name: /Codex \(OpenAI OAuth\).*(Not connected|未连接)/i,
    });
    expect(disabledCodexOptions.length).toBeGreaterThan(0);
    disabledCodexOptions.forEach((option) => expect(option).toBeDisabled());
    expect(endpointMocks.getOpenAIOAuthModels).not.toHaveBeenCalled();
  });

  it('shows a fallback authorization link when the popup is blocked', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({
      data: {
        ...connectedSettings,
        language: 'zh',
        openai_oauth_connected: false,
        openai_oauth_account_id: undefined,
      },
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: '授权连接 OpenAI' }));

    const fallbackLink = await screen.findByRole('link', { name: '打开授权页面' });
    expect(fallbackLink).toHaveAttribute('href', 'https://auth.openai.com/oauth/authorize?state=test');
    expect(await screen.findByText('授权链接已准备好，若没有弹出窗口，请使用下方入口继续。')).toBeInTheDocument();

    openSpy.mockRestore();
  }, 15000);

  it('uses OpenAI settings even when the settings response is already unwrapped', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({
      ...connectedSettings,
      language: 'zh',
      openai_oauth_connected: false,
      openai_oauth_account_id: undefined,
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue('OpenAI')).toBeInTheDocument();
    expect(screen.queryByText(/^gemini$/)).not.toBeInTheDocument();
  });

  it('applies recommended OpenAI OAuth model settings in one click', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    const applyButton = await screen.findByRole('button', { name: /Use OpenAI recommended setup|应用 OpenAI 推荐配置/i });
    fireEvent.click(applyButton);

    expect(await screen.findByDisplayValue('gpt-5.5')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('gpt-image-2')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Codex (OpenAI OAuth)').length).toBeGreaterThanOrEqual(3);
  });

  it('lets users pick a referenced model for a model field', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    const referenceButtons = await screen.findAllByRole('button', { name: /Model Reference|模型引用/i });
    fireEvent.click(referenceButtons[0]);

    expect(endpointMocks.getModelOptions).toHaveBeenCalledWith({
      provider: 'openai',
      model_type: 'text',
      api_key: '',
      api_base_url: '',
    });

    fireEvent.click(await screen.findByRole('button', { name: 'gpt-4o-mini' }));

    expect(await screen.findByDisplayValue('gpt-4o-mini')).toBeInTheDocument();
  }, 15_000);

  it('shows provider model lookup errors instead of a raw 502 message', async () => {
    endpointMocks.getModelOptions.mockRejectedValueOnce({
      message: 'Request failed with status code 502',
      response: {
        data: {
          error: {
            message: '模型列表读取失败: 请检查 VPN 或 API Base URL',
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    const referenceButtons = await screen.findAllByRole('button', { name: /Model Reference|模型引用/i });
    fireEvent.click(referenceButtons[0]);

    expect(await screen.findByText('模型列表读取失败: 请检查 VPN 或 API Base URL')).toBeInTheDocument();
    expect(screen.queryByText('Request failed with status code 502')).not.toBeInTheDocument();
  });
});
