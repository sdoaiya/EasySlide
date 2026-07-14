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
    expect(screen.getByRole('contentinfo')).toHaveTextContent('已保存');
    fireEvent.click(screen.getByRole('button', { name: '收起页面栏' }));
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '收起属性栏' }));
    expect(screen.getByRole('complementary', { name: '属性栏' })).toHaveAttribute('data-collapsed', 'true');
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
    expect(shell).toHaveStyle({ gridTemplateColumns: 'var(--workspace-sidebar-width) minmax(0, 1fr) 0' });
    expect(inspector).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: '打开属性栏' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '打开属性栏' }));
    expect(inspector).toHaveAttribute('data-collapsed', 'false');
    expect(inspector).toHaveTextContent('属性栏');
  });
});
