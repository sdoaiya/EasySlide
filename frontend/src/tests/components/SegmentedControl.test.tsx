import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '@/components/shared/SegmentedControl';

const options = [
  { value: 'image', label: '图片生成' },
  { value: 'disabled', label: '暂不可用', disabled: true },
  { value: 'native', label: '原生可编辑' },
] as const;

describe('SegmentedControl', () => {
  it('exposes its label and selected option with radio semantics', () => {
    render(
      <SegmentedControl
        ariaLabel="项目模式"
        options={options}
        value="image"
        onChange={() => undefined}
      />
    );

    expect(screen.getByRole('radiogroup', { name: '项目模式' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '图片生成' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '原生可编辑' })).toHaveAttribute('aria-checked', 'false');
  });

  it('skips disabled options with right and left arrow keys', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl
        ariaLabel="项目模式"
        options={options}
        value="image"
        onChange={onChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('radio', { name: '图片生成' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('native');

    rerender(
      <SegmentedControl
        ariaLabel="项目模式"
        options={options}
        value="native"
        onChange={onChange}
      />
    );
    fireEvent.keyDown(screen.getByRole('radio', { name: '原生可编辑' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('image');
  });

  it('does not select an individually or wholly disabled option', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl
        ariaLabel="项目模式"
        options={options}
        value="image"
        onChange={onChange}
      />
    );

    expect(screen.getByRole('radio', { name: '暂不可用' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '暂不可用' }));
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <SegmentedControl
        ariaLabel="项目模式"
        options={options}
        value="image"
        onChange={onChange}
        disabled
      />
    );
    expect(screen.getAllByRole('radio')).toEqual(expect.arrayContaining([
      expect.objectContaining({ disabled: true }),
    ]));
    expect(screen.getAllByRole('radio').every((option) => option.hasAttribute('disabled'))).toBe(true);
  });
});
