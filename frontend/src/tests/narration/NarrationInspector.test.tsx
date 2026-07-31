import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NarrationInspector } from '@/components/narration/NarrationInspector';

describe('NarrationInspector', () => {
  it('generates from page content when the page has no confirmed narration', () => {
    const onGenerate = vi.fn();
    render(
      <NarrationInspector
        versions={[]}
        onGenerate={onGenerate}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('AI 处理方式')).toHaveValue('generate');
    fireEvent.click(screen.getByRole('button', { name: '生成候选' }));
    expect(onGenerate).toHaveBeenCalledWith('generate', '');
  });
});
