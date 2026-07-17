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

  it('closes success feedback after two seconds by default', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Saved" type="success" onClose={onClose} />);

    vi.advanceTimersByTime(1999);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps error feedback visible until the user closes it', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Export failed" type="error" onClose={onClose} />);

    vi.advanceTimersByTime(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });
});
