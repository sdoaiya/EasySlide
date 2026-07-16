import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateSelector } from '@/components/shared/TemplateSelector';
import { listUserTemplates } from '@/api/endpoints';

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listUserTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  };
});

describe('TemplateSelector image-mode Gorden packs', () => {
  it('lets users filter Gorden image templates and inspect the selected visual pack', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { rerender } = render(
      <TemplateSelector mode="preset" onSelect={onSelect} selectedTemplateId={null} />
    );

    expect(listUserTemplates).not.toHaveBeenCalled();
    expect(screen.getByText('21 套中文场景模板，按视觉风格作为图片生成参考')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '数据图表' }));

    expect(screen.getByRole('button', { name: /数据可视化合辑/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新时代新青年红色教育/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /数据可视化合辑/ }));
    expect(onSelect).toHaveBeenCalledWith(null, 'gorden-data-viz-deck');

    rerender(<TemplateSelector mode="preset" onSelect={onSelect} selectedTemplateId="gorden-data-viz-deck" />);

    const selectedSummary = screen.getByRole('region', { name: '已选 Gorden 模板' });
    expect(within(selectedSummary).getByText('已选模板')).toBeInTheDocument();
    expect(within(selectedSummary).getByText('数据可视化合辑')).toBeInTheDocument();
    expect(within(selectedSummary).getByText(/41\s*页/)).toBeInTheDocument();
    expect(within(selectedSummary).getByText(/深蓝与砖红数据视觉/)).toBeInTheDocument();
  });
});
