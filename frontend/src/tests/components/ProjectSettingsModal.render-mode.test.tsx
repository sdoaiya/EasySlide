import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsModal } from '@/components/shared/ProjectSettingsModal';
import { useProjectStore } from '@/store/useProjectStore';

const renderModal = (renderMode?: 'image' | 'native') => render(
  <ProjectSettingsModal
    isOpen
    renderMode={renderMode}
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

describe('ProjectSettingsModal render mode', () => {
  beforeEach(() => useProjectStore.setState({ currentProject: null }));

  it('uses the current project mode when callers omit renderMode', () => {
    useProjectStore.setState({ currentProject: { render_mode: 'native' } as never });
    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: '导出设置' }));

    expect(screen.queryByText('MinerU提取')).not.toBeInTheDocument();
  });

  it('hides image reconstruction settings for native projects', () => {
    renderModal('native');

    fireEvent.click(screen.getByRole('tab', { name: '导出设置' }));

    expect(screen.queryByText('内置 Paddle 解析（推荐）')).not.toBeInTheDocument();
    expect(screen.queryByText('MinerU提取')).not.toBeInTheDocument();
    expect(screen.queryByText('背景图获取方法')).not.toBeInTheDocument();
    expect(screen.queryByText('高保真可编辑导出')).not.toBeInTheDocument();
    expect(screen.queryByText(/文本样式提取/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '允许返回半成品' })).toBeInTheDocument();
  });

  it('keeps image reconstruction settings for image projects', () => {
    renderModal('image');

    fireEvent.click(screen.getByRole('tab', { name: '导出设置' }));

    expect(screen.getByText('MinerU提取')).toBeInTheDocument();
    expect(screen.getByText('背景图获取方法')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '高保真可编辑导出' })).toBeInTheDocument();
  });

  it('keeps the title and export save action outside the scroll area at 760px', () => {
    renderModal('native');

    fireEvent.click(screen.getByRole('tab', { name: '导出设置' }));

    const dialog = screen.getByRole('dialog', { name: '设置' });
    const scrollArea = within(dialog).getByTestId('project-settings-scroll');
    const saveButton = within(dialog).getByRole('button', { name: '保存导出设置' });

    expect(within(dialog).getByRole('tablist', { name: '设置' })).toBeInTheDocument();
    expect(scrollArea).not.toContainElement(saveButton);
    expect(within(dialog).getByRole('heading', { name: '设置' })).toBeInTheDocument();
  });

  it('resets the tab scroll position and leaves space after the settings sidebar', () => {
    renderModal('native');

    const scrollArea = screen.getByTestId('project-settings-scroll');
    scrollArea.scrollTop = 240;
    fireEvent.click(screen.getByRole('tab', { name: '全局设置' }));

    expect(scrollArea.scrollTop).toBe(0);
    expect(scrollArea).toHaveClass('px-6', 'py-0');
    expect(scrollArea.closest('[class~="-mb-7"]')).not.toBeNull();
  });
});
