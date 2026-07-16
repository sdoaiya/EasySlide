import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailEditor } from '@/pages/DetailEditor';

const mocks = vi.hoisted(() => ({
  generateNativeDeck: vi.fn(),
  getTaskStatus: vi.fn(),
  store: {
    currentProject: {
      id: 'project-1',
      creation_type: 'idea',
      render_mode: 'image',
      pages: [] as any[],
      description_requirements: '',
    },
    syncProject: vi.fn(),
    updatePageLocal: vi.fn(),
    generateDescriptions: vi.fn(),
    generatePageDescription: vi.fn(),
    regenerateRenovationPage: vi.fn(),
  },
}));

vi.mock('@/store/useProjectStore', () => ({ useProjectStore: vi.fn(() => mocks.store) }));
vi.mock('@/api/client', () => ({ getStaticAssetUrl: vi.fn((path: string) => path) }));
vi.mock('@/api/endpoints', () => ({
  refineDescriptions: vi.fn(),
  generateNativeDeck: mocks.generateNativeDeck,
  getTaskStatus: mocks.getTaskStatus,
  addPage: vi.fn(),
  updateProject: vi.fn().mockResolvedValue({ data: {} }),
  getSettings: vi.fn(() => new Promise(() => {})),
  updateSettings: vi.fn().mockResolvedValue({ data: {} }),
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
  AiRefineInput: () => <input aria-label="AI 修改描述" />,
  FilePreviewModal: () => null,
  ReferenceFileList: () => null,
  MaterialSelector: () => null,
  ImportMarkdownModal: () => null,
  useToast: () => ({ show: vi.fn(), ToastContainer: () => null }),
  useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }),
}));
vi.mock('@/components/preview/DescriptionCard', () => ({
  DescriptionCard: ({ page }: any) => <article>{page.outline_content?.title}</article>,
}));
vi.mock('@/components/shared/PresetCapsules', () => ({ default: () => null }));

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/project/project-1/detail']}>
      <Routes>
        <Route path="/project/:projectId/detail" element={<DetailEditor />} />
        <Route path="/project/:projectId/preview" element={<div>预览页面</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DetailEditor compact layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.currentProject.render_mode = 'image';
    mocks.store.syncProject.mockResolvedValue(undefined);
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      outline_content: { title: '经营摘要', points: [] },
      description_content: { text: '季度收入同比增长。' },
    }];
  });

  it('keeps card scrolling inside the viewport workspace', () => {
    renderEditor();

    expect(screen.getByTestId('detail-editor-workspace')).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(screen.getByTestId('detail-editor-scroll-region')).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
  });

  it('keeps previous and next actions outside the scrolling region', () => {
    renderEditor();

    const scrollRegion = screen.getByTestId('detail-editor-scroll-region');
    const footer = screen.getByTestId('detail-editor-footer');
    expect(scrollRegion).not.toContainElement(footer);
    expect(scrollRegion).toHaveClass('pb-24');
    expect(footer).toHaveClass('fixed', 'bottom-5', 'left-1/2', '-translate-x-1/2', 'z-50', 'pointer-events-none', 'max-w-xl');
    const footerBar = screen.getByTestId('detail-editor-footer-bar');
    expect(footerBar).toHaveClass('pointer-events-auto', 'rounded-2xl', 'shadow-[0_16px_45px_rgba(15,23,42,0.18)]');
    expect(footerBar).toContainElement(screen.getByRole('button', { name: '上一步' }));
    expect(footerBar).toContainElement(screen.getByRole('button', { name: '开始生成' }));
  });

  it('keeps image projects on the existing direct preview flow', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));

    expect(await screen.findByText('预览页面')).toBeInTheDocument();
    expect(mocks.generateNativeDeck).not.toHaveBeenCalled();
  });

  it('opens native preview without starting page generation', async () => {
    mocks.store.currentProject.render_mode = 'native';
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: '生成页面' }));

    expect(await screen.findByText('预览页面')).toBeInTheDocument();
    expect(mocks.generateNativeDeck).not.toHaveBeenCalled();
    expect(mocks.getTaskStatus).not.toHaveBeenCalled();
    expect(mocks.store.syncProject).not.toHaveBeenCalled();
    expect(localStorage.getItem('nativeDeckGenerationTask:project-1')).toBeNull();
  });
});
