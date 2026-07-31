import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImagePreviewList from '@/components/shared/ImagePreviewList';

describe('ImagePreviewList', () => {
  it('uses the editorial surface overlay for image captions', () => {
    const { container } = render(<ImagePreviewList content="![封面](/files/cover.png)" />);

    expect(screen.getByAltText('封面')).toBeInTheDocument();
  expect(container.innerHTML).not.toContain('bg-black/70');
  expect(container.innerHTML).toContain('bg-[color:var(--app-surface)]/85');
  expect(container.innerHTML).not.toContain('bg-[color:var(--app-surface)]/85 text-white');
  expect(container.innerHTML).toContain('bg-[color:var(--app-surface)]/85 text-[var(--app-text)]');
  });
});
