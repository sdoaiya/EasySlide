import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSettingsModal } from '@/components/shared/ProjectSettingsModal';

describe('ProjectSettingsModal export copy', () => {
  it('describes export settings with built-in Paddle OCR and keeps Baidu for inpaint only', () => {
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
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出设置' }));

    expect(screen.getByText('内置 Paddle 解析（推荐）')).toBeInTheDocument();
    expect(screen.getByText('PaddleOCR-VL 内置解析，无需额外 OCR Key，适合当前默认导出流程')).toBeInTheDocument();
    expect(screen.getByText('百度 Inpaint 服务获取')).toBeInTheDocument();
    expect(screen.queryByText(/百度高精度OCR/)).not.toBeInTheDocument();
    expect(screen.queryByText('百度抹除服务获取')).not.toBeInTheDocument();
  });
});
