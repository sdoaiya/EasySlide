import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar';

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('renders the workspace regions and independently collapses side panels', () => {
    render(
      <WorkspaceShell
        toolbar={<span>命令栏</span>}
        sidebar={<span>页面栏</span>}
        inspector={<span>属性栏</span>}
        statusBar={<WorkspaceStatusBar>已保存</WorkspaceStatusBar>}
      >
        <span>画布</span>
      </WorkspaceShell>
    );

    expect(screen.getByRole('banner')).toHaveTextContent('命令栏');
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveTextContent('页面栏');
    expect(screen.getByRole('main')).toHaveTextContent('画布');
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveTextContent('属性栏');
    expect(screen.getByRole('main').parentElement).toHaveStyle({
      gridTemplateColumns: 'minmax(0, var(--workspace-sidebar-width)) minmax(0, 1fr) minmax(0, var(--workspace-inspector-width))',
    });
    expect(screen.getByRole('contentinfo')).toHaveTextContent('已保存');
    expect(screen.getByRole('contentinfo')).toHaveClass('workspace-status-bar');
    expect(screen.getByRole('main')).toHaveStyle({ paddingBottom: 'var(--workspace-statusbar-height)' });
    expect(screen.getByRole('main').parentElement).toHaveStyle({
      gridTemplateAreas: '"toolbar toolbar toolbar" "sidebar canvas inspector"',
    });
    fireEvent.click(screen.getByRole('button', { name: '收起页面栏' }));
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '收起属性栏' }));
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'true');
  });

  it('omits the sidebar column and toggle when the rail moved into project navigation', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar={null} inspector="属性栏">
        画布
      </WorkspaceShell>
    );

    const shell = screen.getByRole('main').parentElement;
    expect(screen.queryByRole('complementary', { name: '页面栏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收起页面栏' })).not.toBeInTheDocument();
    expect(shell).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, var(--workspace-inspector-width))',
    });
    expect(shell).toHaveStyle({
      gridTemplateAreas: '"toolbar toolbar toolbar" "canvas inspector"',
    });
  });

  it('keeps long inspector content inside its own scroll container', () => {
    render(
      <WorkspaceShell
        toolbar="命令栏"
        sidebar="页面栏"
        inspector={<div style={{ minHeight: 2400 }}>大量页面属性</div>}
        statusBar="状态栏"
      >
        画布
      </WorkspaceShell>
    );

    const shell = screen.getByRole('main').parentElement;
    const inspector = screen.getByRole('complementary', { name: '属性栏' });
    const inspectorContent = inspector.firstElementChild;

    expect(shell).toHaveStyle({
      gridTemplateColumns: 'minmax(0, var(--workspace-sidebar-width)) minmax(0, 1fr) minmax(0, var(--workspace-inspector-width))',
    });
    expect(inspector).toHaveClass('overflow-y-hidden');
    expect(inspectorContent).toHaveClass('overflow-y-auto');
  });

  it('omits the inspector when it is not provided', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" statusBar="状态栏">
        画布
      </WorkspaceShell>
    );

    expect(screen.queryByRole('complementary', { name: '属性栏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收起属性栏' })).not.toBeInTheDocument();
  });

  it('expands the canvas and hides editing chrome in presentation mode', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" inspector="属性栏" statusBar="状态栏" presenting>
        画布
      </WorkspaceShell>
    );

    const shell = screen.getByRole('main').parentElement;
    expect(shell).toHaveAttribute('data-presenting', 'true');
    expect(shell).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr)' });
    expect(shell).toHaveStyle({ gridTemplateAreas: '"canvas"' });
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('main')).not.toHaveStyle({ paddingBottom: 'var(--workspace-statusbar-height)' });
    expect(shell?.querySelector('header')).toHaveStyle({ display: 'none' });
    expect(shell?.querySelector('[aria-label="页面栏"]')).toHaveStyle({ display: 'none' });
    expect(shell?.querySelector('footer')).toHaveStyle({ display: 'none' });
  });

  it('does not reserve status bar space when the status bar is hidden', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" hideStatusBar>
        画布
      </WorkspaceShell>
    );

    expect(screen.getByRole('main')).not.toHaveStyle({ paddingBottom: 'var(--workspace-statusbar-height)' });
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('can hide only the page-rail toggle while keeping the inspector toggle available', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" inspector="属性栏" hideSidebarToggle>
        画布
      </WorkspaceShell>
    );

    expect(screen.queryByRole('button', { name: '收起页面栏' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起属性栏' }));
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'true');
  });

  it('uses a closed overlay inspector without shrinking the canvas at narrow desktop widths', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" inspector="属性栏" statusBar="状态栏">
        画布
      </WorkspaceShell>
    );

    const shell = screen.getByRole('main').parentElement;
    const inspector = shell?.querySelector('[aria-label="属性栏"]');

    expect(shell).toHaveAttribute('data-inspector-layout', 'drawer');
    expect(shell).toHaveStyle({ gridTemplateColumns: 'minmax(0, var(--workspace-sidebar-width)) minmax(0, 1fr) minmax(0, 0)' });
    expect(inspector).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: '打开属性栏' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '打开属性栏' }));
    expect(inspector).toHaveAttribute('data-collapsed', 'false');
    expect(inspector).toHaveStyle({ visibility: 'visible' });
    expect(inspector).toHaveTextContent('属性栏');
  });

  it('uses the overlay inspector below 1200px and closes it with Escape', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(max-width: 1279px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));

    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" inspector="属性栏" statusBar="状态栏">
        画布
      </WorkspaceShell>
    );

    const shell = screen.getByRole('main').parentElement;
    const inspector = shell?.querySelector('[aria-label="属性栏"]');
    expect(shell).toHaveAttribute('data-inspector-layout', 'drawer');
    expect(inspector).toHaveStyle({ bottom: 'var(--workspace-statusbar-height)' });
    fireEvent.click(screen.getByRole('button', { name: '打开属性栏' }));
    expect(inspector).toHaveAttribute('data-collapsed', 'false');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(inspector).toHaveAttribute('data-collapsed', 'true');
  });

  it('keeps panel controls available in the status bar when the toolbar is external', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    render(
      <WorkspaceShell hideToolbar toolbar={null} sidebar="页面栏" inspector="属性栏" statusBar="图片模式">
        画布
      </WorkspaceShell>
    );

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开属性栏' }));
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'false');
    fireEvent.click(screen.getByRole('button', { name: '收起页面栏' }));
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveAttribute('data-collapsed', 'true');
  });

  it('uses soft shadows instead of hard panel borders when requested', () => {
    render(
      <WorkspaceShell toolbar="命令栏" sidebar="页面栏" inspector="属性栏" softBorders>
        画布
      </WorkspaceShell>
    );

    const sidebar = screen.getByRole('complementary', { name: '页面栏' });
    const inspector = screen.getByRole('complementary', { name: '属性栏' });

    expect(sidebar).not.toHaveClass('border-r');
    expect(inspector).not.toHaveClass('border-l');
    expect(sidebar.className).toContain('shadow-[inset_-1px_0_0_rgba(');
    expect(inspector.className).toContain('shadow-[inset_1px_0_0_rgba(');
  });
});
