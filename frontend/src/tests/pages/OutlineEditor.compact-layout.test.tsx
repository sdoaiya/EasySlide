import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlineEditor } from '@/pages/OutlineEditor';

const mocks = vi.hoisted(() => ({
  store: {
    currentProject: {
      id: 'project-1',
      creation_type: 'idea',
      pages: [] as any[],
      idea_prompt: '季度复盘',
      outline_requirements: '',
    },
    syncProject: vi.fn(),
    updatePageLocal: vi.fn(),
    saveAllPages: vi.fn(),
    reorderPages: vi.fn(),
    deletePageById: vi.fn(),
    addNewPage: vi.fn(),
    generateOutlineStream: vi.fn(),
    isGlobalLoading: false,
    isOutlineStreaming: false,
  },
}));

vi.mock('@/store/useProjectStore', () => {
  const useProjectStore = Object.assign(vi.fn(() => mocks.store), {
    getState: vi.fn(() => mocks.store),
  });
  return { useProjectStore };
});

vi.mock('@/api/client', () => ({ getStaticAssetUrl: vi.fn((path: string) => path) }));
vi.mock('@/api/endpoints', () => ({
  refineOutline: vi.fn(),
  updateProject: vi.fn().mockResolvedValue({ data: {} }),
  addPage: vi.fn(),
}));
vi.mock('@/hooks/useImagePaste', () => ({
  buildMaterialsMarkdown: vi.fn(() => ''),
  useImagePaste: () => ({ handlePaste: vi.fn(), handleFiles: vi.fn(), isUploading: false }),
}));
vi.mock('@/components/shared/MarkdownTextarea', () => ({
  MarkdownTextarea: React.forwardRef(({ value = '', onChange, placeholder }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ insertAtCursor: vi.fn() }));
    return <textarea value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />;
  }),
}));
vi.mock('@/components/shared', () => ({
  Button: ({ children, icon, ...props }: any) => <button type="button" {...props}>{icon}{children}</button>,
  Loading: ({ message }: any) => <div>{message}</div>,
  AiRefineInput: () => <input aria-label="AI 修改大纲" />,
  FilePreviewModal: () => null,
  ReferenceFileList: () => null,
  MaterialSelector: () => null,
  ImportMarkdownModal: () => null,
  useToast: () => ({ show: vi.fn(), ToastContainer: () => null }),
  useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }),
}));
vi.mock('@/components/outline/OutlineCard', () => ({
  OutlineCard: ({ page }: any) => <article>{page.outline_content?.title}</article>,
}));
vi.mock('@/components/shared/PresetCapsules', () => ({ default: () => null }));

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/project/project-1/outline']}>
      <Routes>
        <Route path="/project/:projectId/outline" element={<OutlineEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OutlineEditor compact layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.currentProject.pages = [];
    mocks.store.generateOutlineStream.mockResolvedValue({ complete: true });
  });

  it('only generates an outline after the user clicks the generate button', async () => {
    renderEditor();

    expect(mocks.store.generateOutlineStream).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '自动生成大纲' }));

    await waitFor(() => expect(mocks.store.generateOutlineStream).toHaveBeenCalledTimes(1));
  });

  it('collapses the idea fields for an existing outline and uses compact navigation rows', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      outline_content: { title: '经营摘要', points: ['收入增长'] },
    }];
    renderEditor();

    expect(screen.queryByTestId('outline-context-fields')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: '展开构想与要求' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByTestId('outline-context-fields')).toBeInTheDocument();
    expect(screen.getByTestId('outline-page-navigation-item')).toHaveClass('h-20');
    expect(screen.getByTestId('outline-page-navigation-item')).not.toHaveClass('shadow-sm');
  });

  it('keeps page scrolling inside the workspace and navigation floating at the bottom', () => {
    renderEditor();

    const root = screen.getByTestId('outline-editor-workspace');
    const scrollRegion = screen.getByTestId('outline-editor-scroll-region');
    const footer = screen.getByTestId('outline-editor-footer');
    expect(root).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(scrollRegion).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
    expect(scrollRegion).not.toContainElement(footer);
    expect(scrollRegion).toHaveClass('pb-20');
    expect(footer).toHaveClass('fixed', 'bottom-0', 'pointer-events-none');
    const footerBar = screen.getByTestId('outline-editor-footer-bar');
    expect(footerBar).toHaveClass('min-h-[44px]', 'max-w-5xl');
    expect(footerBar).toHaveClass('rounded-[var(--app-radius-panel)]', 'shadow-[var(--app-shadow-floating)]');
    expect(footerBar).toContainElement(screen.getByRole('button', { name: '上一步' }));
    expect(footerBar).toContainElement(screen.getByRole('button', { name: '下一步' }));
  });
});
