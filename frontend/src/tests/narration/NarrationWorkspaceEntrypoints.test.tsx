import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import layoutManifest from '../../../../shared/native-deck/layout-manifest.json';
import { NativeDeckWorkspace } from '@/components/native-deck/NativeDeckWorkspace';
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel';
import { SlidePreview } from '@/pages/SlidePreview';
import { useNativeDeckStore } from '@/store/useNativeDeckStore';

const mocks = vi.hoisted(() => ({
  store: {
    currentProject: {
      id: 'project-1',
      project_id: 'project-1',
      title: '入口测试',
      pages: [{
        id: 'page-1',
        page_id: 'page-1',
        status: 'COMPLETED',
        generated_image_path: '/files/page-1.png',
        outline_content: { title: '第一页', points: [] },
        description_content: { text: '页面描述' },
      }],
    } as Record<string, unknown> | null,
    syncProject: vi.fn().mockResolvedValue(undefined),
    generatePageImage: vi.fn(),
    generateImages: vi.fn(),
    editPageImage: vi.fn(),
    deletePageById: vi.fn(),
    updatePageLocal: vi.fn(),
    isGlobalLoading: false,
    taskProgress: null,
    pageGeneratingTasks: {},
    activeImageTask: null,
    imageQualityReport: null,
    warningMessage: null,
    restoreImageGeneration: vi.fn(),
    pauseImageGeneration: vi.fn(),
    resumeImageGeneration: vi.fn(),
  },
}));

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: Object.assign(vi.fn(() => mocks.store), {
    getState: vi.fn(() => mocks.store),
  }),
}));

vi.mock('@/store/useExportTasksStore', () => ({
  useExportTasksStore: () => ({
    addTask: vi.fn(),
    updateTask: vi.fn(),
    pollTask: vi.fn(),
    tasks: [],
    restoreActiveTasks: vi.fn(),
  }),
}));

vi.mock('@/api/client', () => ({
  apiClient: { put: vi.fn() },
  getImageUrl: vi.fn((path: string) => path),
  getStaticAssetUrl: vi.fn((path: string) => path),
}));

vi.mock('@/api/endpoints', () => ({
  addPage: vi.fn(),
  autoMatchPageTemplates: vi.fn(),
  clearPageTemplate: vi.fn(),
  completeNativePptxExport: vi.fn(),
  createNativePptxExport: vi.fn(),
  deletePage: vi.fn(),
  exportEditablePPTX: vi.fn(),
  exportImages: vi.fn(),
  exportNativeVideo: vi.fn(),
  exportPDF: vi.fn(),
  exportPPTX: vi.fn(),
  exportVideo: vi.fn(),
  generateMaterialImage: vi.fn(),
  getFishAudioVoices: vi.fn(),
  getNativePageVersions: vi.fn(() => new Promise(() => {})),
  getPageImageVersions: vi.fn(() => new Promise(() => {})),
  getProjectNarrations: vi.fn(),
  getSettings: vi.fn(() => new Promise(() => {})),
  getTaskStatus: vi.fn(),
  listUserTemplates: vi.fn(() => new Promise(() => {})),
  preflightExportVideo: vi.fn(),
  restoreNativePageVersion: vi.fn(),
  setCurrentImageVersion: vi.fn(),
  updateNativePptxProgress: vi.fn(),
  updatePageTemplate: vi.fn(),
  updatePagesOrder: vi.fn(),
  updateProject: vi.fn(),
  uploadPageTemplate: vi.fn(),
  uploadTemplate: vi.fn(),
}));

vi.mock('@/hooks/useImagePaste', () => ({
  buildMaterialsMarkdown: vi.fn(() => ''),
  useImagePaste: () => ({ handlePaste: vi.fn(), handleFiles: vi.fn(), isUploading: false }),
}));

vi.mock('@/components/shared/MarkdownTextarea', () => ({
  MarkdownTextarea: React.forwardRef((_props: unknown, ref) => {
    React.useImperativeHandle(ref, () => ({ insertAtCursor: vi.fn(), focus: vi.fn() }));
    return <textarea />;
  }),
}));

vi.mock('@/components/shared', () => ({
  Button: ({ children, icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type="button" {...props}>{icon}{children}</button>
  ),
  Loading: ({ message }: { message?: string }) => <div>{message}</div>,
  Modal: ({ isOpen, title, children }: { isOpen?: boolean; title?: string; children?: React.ReactNode }) => (
    isOpen ? <section role="dialog" aria-label={title}>{children}</section> : null
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  MaterialSelector: () => null,
  ProjectSettingsModal: () => null,
  ExportTasksPanel: () => null,
  TextStyleSelector: () => null,
  SegmentedControl: ({ options, value, onChange, ariaLabel }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void; ariaLabel: string }) => (
    <div role="radiogroup" aria-label={ariaLabel}>{options.map((option) => (
      <button key={option.value} type="button" role="radio" aria-label={option.label} aria-checked={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
    ))}</div>
  ),
  VoicePicker: () => <div>声音选择器</div>,
  VoiceComparisonDialog: () => null,
  useToast: () => ({ show: vi.fn(), ToastContainer: () => null }),
  useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }),
}));

vi.mock('@/components/shared/MaterialGeneratorModal', () => ({ MaterialGeneratorModal: () => null }));
vi.mock('@/components/shared/TemplateSelector', () => ({ TemplateSelector: () => null, getTemplateFile: vi.fn() }));
vi.mock('@/components/preview/SlideCard', () => ({ SlideCard: () => <div>页面预览</div> }));
vi.mock('@/components/narration/NarrationWorkbench', () => ({
  NarrationWorkbench: ({ open }: { open: boolean }) => (
    open ? <section role="dialog" aria-label="视频文案工作台">视频文案工作台</section> : null
  ),
}));

const nativeSlides = [{
  pageId: 'page-1',
  layout: 'core01_agenda',
  props: { title: '议程', items: ['现状', '方案'] },
}];

describe('NarrationWorkbench workspace entrypoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNativeDeckStore.setState({ slides: [], selectedPageId: null, dirtyPageIds: new Set() });
  });

  it('opens the shared workbench from image mode', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/preview']}>
        <Routes>
          <Route path="/project/:projectId/preview" element={<SlidePreview />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '视频文案' }));

    expect(screen.getByRole('dialog', { name: '视频文案工作台' })).toBeInTheDocument();
  });

  it('opens the shared workbench from native mode', () => {
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={nativeSlides}
        layoutContracts={layoutManifest.layouts as unknown as readonly NativeLayoutContract[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '视频文案' }));

    expect(screen.getByRole('dialog', { name: '视频文案工作台' })).toBeInTheDocument();
  });
});
