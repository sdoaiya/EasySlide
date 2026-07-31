import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSettingsModal } from '@/components/shared/ProjectSettingsModal';

describe('ProjectSettingsModal export copy', () => {
  it('describes export settings with built-in Paddle OCR and keeps Baidu for inpaint only', () => {
    const onHighFidelityChange = vi.fn();
    render(
      <ProjectSettingsModal
        isOpen
        onClose={() => {}}
        extraRequirements=""
        templateStyle=""
        onExtraRequirementsChange={() => {}}
        onTemplateStyleChange={() => {}}
        onSaveExtraRequirements={() => {}}
        onSaveTemplateStyle={() => {}}
        isSavingRequirements={false}
        isSavingTemplateStyle={false}
        onSaveExportSettings={vi.fn()}
        onExportHighFidelityEditableChange={onHighFidelityChange}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: '导出设置' }));

    const selectedOption = screen.getAllByRole('radio')[0].closest('label');
    expect(selectedOption?.className).toContain('rounded-[var(--app-radius-control)]');
    expect(selectedOption?.className).toContain('border-[var(--app-primary-action)]');
    expect(selectedOption?.className).not.toContain('rounded-lg');

    expect(screen.getByRole('radio', { name: '内置 Paddle 解析（推荐）' })).toHaveAttribute(
      'title',
      'PaddleOCR-VL 内置解析，无需额外 OCR Key，适合当前默认导出流程'
    );
    expect(screen.getByText('百度 Inpaint 服务获取')).toBeInTheDocument();
    expect(screen.queryByText(/百度高精度OCR/)).not.toBeInTheDocument();
    expect(screen.queryByText('百度抹除服务获取')).not.toBeInTheDocument();
    expect(screen.getByText('高保真可编辑导出')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '高保真可编辑导出' }));
    expect(onHighFidelityChange).toHaveBeenCalledWith(true);
  });
});
