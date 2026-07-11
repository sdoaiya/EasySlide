import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '@/components/shared/Toast';

describe('Toast', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not restart its timer when the close callback changes', () => {
    vi.useFakeTimers();
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const view = render(<Toast message="Export started" duration={2000} onClose={firstClose} />);

    vi.advanceTimersByTime(1000);
    view.rerender(<Toast message="Export started" duration={2000} onClose={latestClose} />);
    vi.advanceTimersByTime(1000);

    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
  });
});
