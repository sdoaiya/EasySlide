import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('DesktopTitleBar', () => {
  afterEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
  });

  it('uses compact native window controls with accessible names', async () => {
    const minimizeWindow = vi.fn();
    const maximizeWindow = vi.fn();
    const closeWindow = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        minimizeWindow,
        maximizeWindow,
        closeWindow,
      },
    });
    vi.resetModules();
    const { DesktopTitleBar } = await import('@/components/shared/DesktopTitleBar');

    render(<DesktopTitleBar />);

    expect(screen.getByTestId('desktop-title-bar')).toHaveClass('h-10');
    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    expect(minimizeWindow).toHaveBeenCalledOnce();
    expect(maximizeWindow).toHaveBeenCalledOnce();
    expect(closeWindow).toHaveBeenCalledOnce();
  });
});
