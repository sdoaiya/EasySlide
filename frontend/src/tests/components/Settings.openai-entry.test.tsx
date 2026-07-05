import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '@/pages/Settings';

const endpointMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getOpenAIOAuthStatus: vi.fn(),
  getOpenAIOAuthUrl: vi.fn(),
  getOpenAIOAuthModels: vi.fn(),
  getElevenLabsVoices: vi.fn(),
  checkForUpdates: vi.fn(),
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
    getElevenLabsVoices: endpointMocks.getElevenLabsVoices,
    checkForUpdates: endpointMocks.checkForUpdates,
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
    endpointMocks.getElevenLabsVoices.mockResolvedValue({ data: { voices: [] } });
    endpointMocks.checkForUpdates.mockResolvedValue({ data: { status: 'unknown', update_available: false, message: '', repository: '', current: { is_docker: false }, latest: null } });
  });

  it('surfaces OpenAI connection as a first-class settings section', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/AI Provider & OpenAI|AI 提供商与 OpenAI/i)).toBeInTheDocument();
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

  it('keeps Baidu key only for inpaint while Paddle OCR is built in', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Baidu Inpaint Configuration|百度 Inpaint 配置/i)).toBeInTheDocument();
    expect(await screen.findByText(/Baidu Inpaint Service Key|百度 Inpaint 服务 Key/i)).toBeInTheDocument();
    expect(await screen.findByText(/OCR uses built-in PaddleOCR-VL|OCR 已内置 PaddleOCR-VL/i)).toBeInTheDocument();
    expect(screen.queryByText(/Paddle OCR Token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/百度 OCR|Baidu OCR/i)).not.toBeInTheDocument();
  });

  it('uses the local workspace navigation without recreating login entry points', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({
      data: {
        ...connectedSettings,
        language: 'zh',
      },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('EasySlide')).toBeInTheDocument();
    ['首页', '创建项目', '我的项目', '素材中心', '素材生成', '设置'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '使用手册' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入工作台' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回工作台' })).toBeInTheDocument();
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
  });

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
  });

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
});
