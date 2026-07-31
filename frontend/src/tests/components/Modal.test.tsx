import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from '@/components/shared/Modal';

describe('Modal', () => {
  it('uses the editorial surface overlay instead of a black backdrop', async () => {
    render(<Modal isOpen onClose={() => {}} title="测试弹窗">内容</Modal>);

    expect(await screen.findByRole('dialog', { name: '测试弹窗' })).toBeInTheDocument();
    await waitFor(() => expect(document.body.innerHTML).toContain('bg-[color:var(--app-surface)]/80'));
    expect(document.body.innerHTML).not.toContain('bg-black/48');
  });
});
