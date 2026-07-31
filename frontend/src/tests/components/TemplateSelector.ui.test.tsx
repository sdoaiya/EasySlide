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

    const { container, rerender } = render(
      <TemplateSelector mode="preset" onSelect={onSelect} selectedTemplateId={null} />
    );

    expect(listUserTemplates).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain('bg-black/65');
    expect(container.innerHTML).not.toContain('backdrop-blur-sm');
    expect(container.innerHTML).not.toContain(' shadow z-20');
    expect(screen.getByText('系统预设模板，按视觉风格作为图片生成参考')).toBeInTheDocument();
    const uploadTemplate = screen.getByText('上传模板').closest('label');
    const firstPreset = screen.getByRole('button', { name: /简约商务总结汇报/ });
    expect(uploadTemplate).not.toBeNull();
    expect(uploadTemplate!.compareDocumentPosition(firstPreset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: /运营 PPT 合辑/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /查看全部 \d+ 个模板/ }));
    expect(screen.getByRole('button', { name: /运营 PPT 合辑/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '数据图表' }));

    expect(screen.getByRole('button', { name: /数据可视化合辑/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新时代新青年红色教育/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /数据可视化合辑/ }));
    expect(onSelect).toHaveBeenCalledWith(null, 'gorden-data-viz-deck');

    rerender(
      <TemplateSelector
        mode="preset"
        onSelect={onSelect}
        selectedTemplateId="gorden-data-viz-deck"
        selectedTemplateDetails={<section aria-label="模板视觉调节">视觉调节控件</section>}
      />
    );

    const selectedSummary = screen.getByRole('region', { name: '已选 系统预设模板' });
    expect(within(selectedSummary).getByText('已选模板')).toBeInTheDocument();
    expect(within(selectedSummary).getByText('数据可视化合辑')).toBeInTheDocument();
    expect(within(selectedSummary).getByText(/41\s*页/)).toBeInTheDocument();
    expect(within(selectedSummary).getByText(/深蓝与砖红数据视觉/)).toBeInTheDocument();
    expect(
      Array.from(selectedSummary.querySelectorAll<HTMLElement>('[class]')).every((node) =>
        !node.className.includes('text-gray') && !node.className.includes('dark:')
      )
    ).toBe(true);
    expect(selectedSummary.innerHTML).not.toContain('shadow-sm');
    expect(selectedSummary.innerHTML).not.toContain('ring-black/10');
    expect(within(selectedSummary).getByRole('region', { name: '模板视觉调节' })).toBeInTheDocument();
  });
});
