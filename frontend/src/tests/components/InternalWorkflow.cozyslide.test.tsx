import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlineEditor } from '@/pages/OutlineEditor';
import { DetailEditor } from '@/pages/DetailEditor';
import { SlidePreview } from '@/pages/SlidePreview';

const mocks = vi.hoisted(() => {
  const project = {
    id: 'project-1',
    title: 'EasySlide demo',
    creation_type: 'ppt_renovation',
    pages: [] as any[],
    idea_prompt: '',
    outline_text: '',
    description_text: '',
    outline_requirements: '',
    description_requirements: '',
    updated_at: '2026-07-02T00:00:00Z',
  };

  const store = {
    currentProject: project,
    syncProject: vi.fn(),
    updatePageLocal: vi.fn(),
    saveAllPages: vi.fn(),
    reorderPages: vi.fn(),
    deletePageById: vi.fn(),
    addNewPage: vi.fn(),
    generateOutlineStream: vi.fn(),
    generateDescriptions: vi.fn(),
    generatePageDescription: vi.fn(),
    regenerateRenovationPage: vi.fn(),
    generatePageImage: vi.fn(),
    generateImages: vi.fn(),
    regeneratePageImage: vi.fn(),
    isGlobalLoading: false,
    isOutlineStreaming: false,
    taskProgress: null,
    pageGeneratingTasks: {},
    warningMessage: null,
    setError: vi.fn(),
  };

  const toastShow = vi.fn();

  return { store, toastShow };
});

vi.mock('@/store/useProjectStore', () => {
  const useProjectStore = Object.assign(vi.fn(() => mocks.store), {
    getState: vi.fn(() => mocks.store),
  });
  return { useProjectStore };
});

vi.mock('@/store/useExportTasksStore', () => ({
  useExportTasksStore: () => ({
    addTask: vi.fn(),
    pollTask: vi.fn(),
    tasks: [],
    restoreActiveTasks: vi.fn(),
  }),
}));

vi.mock('@/api/client', () => ({
  getImageUrl: vi.fn(() => ''),
  getStaticAssetUrl: vi.fn((path: string) => path),
}));

vi.mock('@/api/endpoints', () => ({
  refineOutline: vi.fn(),
  refineDescriptions: vi.fn(),
  updateProject: vi.fn().mockResolvedValue({ data: {} }),
  addPage: vi.fn(),
  getTaskStatus: vi.fn(),
  getSettings: vi.fn(() => new Promise(() => {})),
  updateSettings: vi.fn().mockResolvedValue({ data: {} }),
  listUserTemplates: vi.fn(() => new Promise(() => {})),
  getImageVersions: vi.fn(() => new Promise(() => {})),
  getPageImageVersions: vi.fn(() => new Promise(() => {})),
  setCurrentImageVersion: vi.fn(),
  uploadTemplate: vi.fn(),
  exportPPTX: vi.fn(),
  exportPDF: vi.fn(),
  exportImages: vi.fn(),
  exportEditablePPTX: vi.fn(),
  exportVideo: vi.fn(),
  getElevenLabsVoices: vi.fn().mockResolvedValue({ data: { voices: [] } }),
}));

vi.mock('@/hooks/useImagePaste', () => ({
  buildMaterialsMarkdown: vi.fn(() => ''),
  useImagePaste: () => ({
    handlePaste: vi.fn(),
    handleFiles: vi.fn(),
    isUploading: false,
  }),
}));

vi.mock('@/components/shared/MarkdownTextarea', () => ({
  MarkdownTextarea: React.forwardRef(({ value = '', onChange, placeholder }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      insertAtCursor: vi.fn(),
      focus: vi.fn(),
    }));
    return (
      <textarea
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
      />
    );
  }),
}));

vi.mock('@/components/shared', () => ({
  Button: ({ children, icon, ...props }: any) => (
    <button type="button" {...props}>
      {icon}
      {children}
    </button>
  ),
  Loading: ({ message }: any) => <div>{message}</div>,
  AiRefineInput: ({ placeholder }: any) => <input aria-label={placeholder} placeholder={placeholder} />,
  FilePreviewModal: () => null,
  ReferenceFileList: () => null,
  MaterialSelector: () => null,
  ImportMarkdownModal: () => null,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <section><h2>{title}</h2>{children}</section> : null),
  Textarea: ({ label, value = '', onChange, placeholder }: any) => (
    <label>
      {label}
      <textarea value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  ),
  ProjectSettingsModal: () => null,
  ExportTasksPanel: () => null,
  TextStyleSelector: () => null,
  useToast: () => ({ show: mocks.toastShow, ToastContainer: () => null }),
  useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }),
}));

vi.mock('@/components/outline/OutlineCard', () => ({
  OutlineCard: ({ page }: any) => <article>{page?.outline_content?.title}</article>,
}));

vi.mock('@/components/preview/DescriptionCard', () => ({
  DescriptionCard: ({ page }: any) => <article>{page?.outline_content?.title}</article>,
}));

vi.mock('@/components/preview/SlideCard', () => ({
  SlideCard: ({ page }: any) => <article>{page?.outline_content?.title}</article>,
}));

vi.mock('@/components/shared/MaterialGeneratorModal', () => ({
  MaterialGeneratorModal: () => null,
}));

vi.mock('@/components/shared/TemplateSelector', () => ({
  TemplateSelector: () => null,
  getTemplateFile: vi.fn(),
}));

vi.mock('@/components/shared/PresetCapsules', () => ({
  default: ({ type }: { type: string }) => (
    <div data-testid={`${type}-presets`}>
      <button type="button" data-testid={`${type}-add-preset`} className="text-sky-600">
        自定义
      </button>
    </div>
  ),
}));

function renderAt(path: string, element: React.ReactNode) {
  window.history.pushState({}, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:projectId/*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EasySlide internal workflow chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.currentProject.pages = [];
    mocks.store.currentProject.creation_type = 'ppt_renovation';
    mocks.store.generateOutlineStream.mockResolvedValue({ complete: true });
  });

  it('labels the outline editor as the content-structure step', () => {
    const { container } = renderAt('/project/project-1/outline', <OutlineEditor />);

    expect(screen.getByText('Step 1 · 内容结构')).toBeInTheDocument();
    expect(screen.getByText('整理想法、素材和页面顺序')).toBeInTheDocument();
    expect(screen.getByText('还没有页面')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/banana|yellow|orange|amber/);
  });

  it('waits for a manual click before generating an idea outline', async () => {
    mocks.store.currentProject.creation_type = 'idea';

    renderAt('/project/project-1/outline', <OutlineEditor />);

    expect(mocks.store.generateOutlineStream).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '自动生成大纲' }));

    await waitFor(() => {
      expect(mocks.store.generateOutlineStream).toHaveBeenCalledTimes(1);
    });
  });

  it('labels the detail editor as the page-narrative step', () => {
    const { container } = renderAt('/project/project-1/detail', <DetailEditor />);

    expect(screen.getByText('Step 2 · 页面叙事')).toBeInTheDocument();
    expect(screen.getByText('补全每页描述和视觉线索')).toBeInTheDocument();
    expect(screen.getByText('还没有页面')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/banana|yellow|orange|amber/);
  });

  it('labels the preview as the visual-delivery step', () => {
    renderAt('/project/project-1/preview', <SlidePreview />);

    expect(screen.getByText('Step 3 · 视觉成稿')).toBeInTheDocument();
    expect(screen.getByText('生成图片、预览并导出交付')).toBeInTheDocument();
    expect(screen.getByText('还没有页面')).toBeInTheDocument();
  });

  it('fits the slide preview within the available viewport height', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      generated_image_path: '/files/page-1.png',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    expect(screen.getByTestId('slide-preview-viewport')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('slide-preview-canvas').style.width).toContain('cqh');
  });

  it('shows backend ElevenLabs voice errors when enabling TTS fails', async () => {
    const endpoints = await import('@/api/endpoints');
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      generated_image_path: '/files/page-1.png',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    vi.mocked(endpoints.getSettings).mockResolvedValueOnce({
      data: { output_language: 'zh', elevenlabs_api_key_length: 1 },
    } as any);
    vi.mocked(endpoints.getElevenLabsVoices).mockRejectedValueOnce({
      response: {
        data: {
          error: { message: 'ElevenLabs API Key 未配置' },
        },
      },
      message: 'Request failed with status code 400',
    });

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: '导出为讲解视频' }));
    fireEvent.click(await screen.findByRole('button', { name: '高级配置' }));
    fireEvent.click(screen.getByLabelText('使用 ElevenLabs 语音合成'));

    await waitFor(() => {
      expect(mocks.toastShow).toHaveBeenCalledWith({
        message: 'ElevenLabs API Key 未配置',
        type: 'error',
      });
    });
  });
});
