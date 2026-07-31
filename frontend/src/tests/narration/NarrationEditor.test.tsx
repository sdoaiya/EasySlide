import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NarrationEditor, type NarrationEditorSegment } from '@/components/narration/NarrationEditor';

const speakers = [
  { id: 'host', name: '主持人' },
  { id: 'expert', name: '专家' },
];

const segments: NarrationEditorSegment[] = [
  { segment_id: 'seg-a', speaker_id: 'host', text: '开场', delivery: { emotion: 'friendly' } },
  { segment_id: 'seg-b', speaker_id: 'expert', text: '解释' },
];

describe('NarrationEditor', () => {
  it('以纯受控连续文本编辑单人旁白', () => {
    const onTextChange = vi.fn();

    const { container } = render(
      <NarrationEditor
        mode="single"
        text="现有旁白"
        segments={segments}
        speakers={speakers}
        onTextChange={onTextChange}
        onSegmentsChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '旁白文案' }), {
      target: { value: '修改后的旁白' },
    });

    expect(onTextChange).toHaveBeenCalledWith('修改后的旁白');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(container.querySelector('.fixed, .sticky')).not.toBeInTheDocument();
  });

  it('切换角色和编辑文案时保留 segment_id 及扩展字段', async () => {
    const user = userEvent.setup();
    const onSegmentsChange = vi.fn();

    render(
      <NarrationEditor
        mode="dialogue"
        text=""
        segments={segments}
        speakers={speakers}
        onTextChange={vi.fn()}
        onSegmentsChange={onSegmentsChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '第 1 段角色' }), 'expert');
    expect(onSegmentsChange).toHaveBeenLastCalledWith([
      { ...segments[0], speaker_id: 'expert' },
      segments[1],
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: '第 2 段文案' }), {
      target: { value: '更新解释' },
    });
    expect(onSegmentsChange).toHaveBeenLastCalledWith([
      segments[0],
      { ...segments[1], text: '更新解释' },
    ]);
    expect(screen.queryByText('主音色')).not.toBeInTheDocument();
  });

  it('支持键盘增删和上下移动片段且不重建既有 ID', async () => {
    const user = userEvent.setup();
    const onSegmentsChange = vi.fn();

    render(
      <NarrationEditor
        mode="dialogue"
        text=""
        segments={segments}
        speakers={speakers}
        onTextChange={vi.fn()}
        onSegmentsChange={onSegmentsChange}
      />,
    );

    const moveUp = screen.getByRole('button', { name: '上移第 2 段' });
    moveUp.focus();
    await user.keyboard('{Enter}');
    expect(onSegmentsChange).toHaveBeenLastCalledWith([segments[1], segments[0]]);

    await user.click(screen.getByRole('button', { name: '删除第 1 段' }));
    expect(onSegmentsChange).toHaveBeenLastCalledWith([segments[1]]);

    await user.click(screen.getByRole('button', { name: '添加对话片段' }));
    const added = onSegmentsChange.mock.calls[onSegmentsChange.mock.calls.length - 1]?.[0] as NarrationEditorSegment[];
    expect(added.slice(0, 2).map((segment) => segment.segment_id)).toEqual(['seg-a', 'seg-b']);
    expect(added[2]).toMatchObject({ speaker_id: 'host', text: '' });
    expect(added[2].segment_id).toBeTruthy();

    expect(screen.getByRole('button', { name: '上移第 1 段' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下移第 2 段' })).toBeDisabled();
  });
});
