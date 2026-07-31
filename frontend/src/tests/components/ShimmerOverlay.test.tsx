import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShimmerOverlay } from '@/components/shared/ShimmerOverlay';

describe('ShimmerOverlay', () => {
  it('uses a neutral editorial shimmer instead of an accent gradient', () => {
    const { container } = render(<ShimmerOverlay show />);

    expect(container.innerHTML).toContain('linear-gradient');
    expect(container.innerHTML).not.toContain('bg-gradient-to-r');
    expect(container.innerHTML).not.toContain('app-accent-soft');
  });
});
