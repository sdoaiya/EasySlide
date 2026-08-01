import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { checkAccessCode, verifyAccessCode } from '@/api/endpoints';

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    checkAccessCode: vi.fn().mockRejectedValue(new Error('backend unavailable')),
    verifyAccessCode: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({ data: { theme: 'light', language: 'zh', ai_provider_format: 'openai' } }),
    getOpenAIOAuthStatus: vi.fn().mockResolvedValue({ data: { connected: false, account_id: null } }),
    getOpenAIOAuthModels: vi.fn().mockResolvedValue({ data: { text_models: [], image_models: [], models: [] } }),
    listUserTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
    checkForUpdates: vi.fn().mockResolvedValue({ data: { status: 'unknown', update_available: false, message: '', repository: '', current: { is_docker: false }, latest: null } }),
  };
});

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: () => ({
    currentProject: null,
    syncProject: vi.fn(),
    error: null,
    setError: vi.fn(),
  }),
}));

describe('EasySlide public routes', () => {
  it('opens the public landing page at the root route', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /让每一页/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(checkAccessCode).not.toHaveBeenCalled();
  });

  it('opens the canonical home route directly', async () => {
    window.history.pushState({}, '', '/home');

    render(<App />);

    expect(await screen.findByRole('navigation', { name: '工作台导航' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/home'));
    expect(checkAccessCode).toHaveBeenCalled();
  });

  it('opens protected settings directly for local use when access-code status is unavailable', async () => {
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect((await screen.findAllByText(/Default AI Provider|默认 AI 提供商/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText('请登录后再使用，获取更佳体验')).not.toBeInTheDocument();
    expect(checkAccessCode).toHaveBeenCalled();
  });

  it('keeps the workspace navigation mounted while switching pages', async () => {
    window.history.pushState({}, '', '/home');

    render(<App />);

    const navigation = await screen.findByRole('navigation', { name: '工作台导航' });
    fireEvent.click(within(navigation).getByRole('button', { name: '创建项目' }));

    expect(await screen.findByRole('heading', { level: 1, name: '创建项目' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '工作台导航' })).toBe(navigation);
  });

  it('redirects the discarded v2 studio route back to the existing workspace', async () => {
    window.history.pushState({}, '', '/v2');

    render(<App />);

    expect(await screen.findByRole('navigation', { name: '工作台导航' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/home'));
  });

  it('returns to the app workspace from the optional local access-code panel', async () => {
    vi.mocked(checkAccessCode).mockResolvedValueOnce({ data: { enabled: true } });
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByText('本机访问口令')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));

    await waitFor(() => expect(window.location.pathname).toBe('/home'));
  });

  it('uses a minimal local access-code panel when access-code protection is explicitly enabled', async () => {
    vi.mocked(checkAccessCode).mockResolvedValueOnce({ data: { enabled: true } });
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByText('本机访问口令')).toBeInTheDocument();
    expect(screen.getByLabelText('访问口令')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '进入工作台' })).toBeInTheDocument();
    expect(screen.queryByText('拼图验证')).not.toBeInTheDocument();
    expect(screen.queryByText('或使用第三方账号登录')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用 OpenAI 登录' })).not.toBeInTheDocument();
  });

  it('unlocks the app after a valid optional local access code', async () => {
    vi.mocked(checkAccessCode).mockResolvedValueOnce({ data: { enabled: true } });
    vi.mocked(verifyAccessCode).mockResolvedValueOnce({ data: { valid: true } });
    window.history.pushState({}, '', '/settings');

    render(<App />);

    fireEvent.change(await screen.findByLabelText('访问口令'), { target: { value: 'local-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect((await screen.findAllByText(/Default AI Provider|默认 AI 提供商/i)).length).toBeGreaterThan(0);
    expect(verifyAccessCode).toHaveBeenCalledWith('local-secret');
  });
});
