import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    extra_requirements: '',
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
    restoreImageGeneration: vi.fn(),
    pauseImageGeneration: vi.fn(),
    resumeImageGeneration: vi.fn(),
    regeneratePageImage: vi.fn(),
    isGlobalLoading: false,
    isOutlineStreaming: false,
    taskProgress: null,
    pageGeneratingTasks: {},
    activeImageTask: null as any,
    imageQualityReport: null as any,
    warningMessage: null,
    setError: vi.fn(),
  };

  const toastShow = vi.fn();
  let exportTasks: any[] = [];
  const addExportTask = vi.fn((task: any) => {
    exportTasks = [{ ...task, createdAt: new Date().toISOString() }, ...exportTasks];
  });

  return {
    store,
    toastShow,
    get exportTasks() {
      return exportTasks;
    },
    set exportTasks(value: any[]) {
      exportTasks = value;
    },
    addExportTask,
  };
});

vi.mock('@/store/useProjectStore', () => {
  const useProjectStore = Object.assign(vi.fn(() => mocks.store), {
    getState: vi.fn(() => mocks.store),
  });
  return { useProjectStore };
});

vi.mock('@/store/useExportTasksStore', () => ({
  useExportTasksStore: () => ({
    addTask: mocks.addExportTask,
    pollTask: vi.fn(),
    tasks: mocks.exportTasks,
    restoreActiveTasks: vi.fn(),
  }),
}));

vi.mock('@/api/client', () => ({
  getImageUrl: vi.fn((path: string) => `http://127.0.0.1:5000${path}`),
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
  getFishAudioVoices: vi.fn(),
  getFishAudioCapabilities: vi.fn().mockResolvedValue({
    data: { voice_design: { supported: false, reason: '当前免费模型未确认 Voice Design 官方 API 契约' } },
  }),
  previewFishNarration: vi.fn(),
  getProjectNarrations: vi.fn(() => Promise.resolve({
    data: {
      pages: mocks.store.currentProject.pages.map(page => ({
        page_id: page.page_id,
        current_version_id: `version-${page.page_id}`,
      })),
    },
  })),
  autoMatchPageTemplates: vi.fn().mockResolvedValue({ data: {} }),
  preflightExportVideo: vi.fn().mockResolvedValue({
    data: {
      can_export: true,
      errors: [],
      warnings: [],
      total_pages: 1,
      pages_with_narration: 1,
      missing_images: [],
      missing_narration: [],
    },
  }),
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
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <section role="dialog" aria-label={title}><h2>{title}</h2>{children}</section> : null),
  Textarea: ({ label, value = '', onChange, placeholder, ...props }: any) => (
    <label>
      {label}
      <textarea value={value} onChange={onChange} placeholder={placeholder} {...props} />
    </label>
  ),
  ProjectSettingsModal: () => null,
  ExportTasksPanel: () => <div>导出任务面板</div>,
  TextStyleSelector: () => null,
  useToast: () => ({ show: mocks.toastShow, ToastContainer: () => null }),
  useConfirm: () => ({ confirm: vi.fn(), ConfirmDialog: null }),
  SegmentedControl: ({ options, value, onChange, ariaLabel }: any) => (
    <div role="radiogroup" aria-label={ariaLabel}>{options.map((option: any) => (
      <button key={option.value} type="button" role="radio" aria-label={option.label} aria-checked={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
    ))}</div>
  ),
  VoicePicker: () => <div>声音选择器</div>,
  VoiceComparisonDialog: () => null,
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
  TemplateSelector: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect(null, 'gorden-data-viz-deck')}>
      选择 Gorden 数据模板
    </button>
  ),
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
    localStorage.removeItem('slidePreviewImageGenerationSettings');
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('slidePreviewImageGenerationSettings:')) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem('skip1KResolutionWarning');
    mocks.exportTasks = [];
    mocks.store.currentProject = {
      id: 'project-1',
      title: 'EasySlide demo',
      creation_type: 'ppt_renovation',
      pages: [],
      idea_prompt: '',
      outline_text: '',
      description_text: '',
      outline_requirements: '',
      description_requirements: '',
      extra_requirements: '',
      updated_at: '2026-07-02T00:00:00Z',
    };
    mocks.store.currentProject.pages = [];
    mocks.store.activeImageTask = null;
    mocks.store.imageQualityReport = null;
    mocks.store.warningMessage = null;
    mocks.store.pageGeneratingTasks = {};
    mocks.store.generateOutlineStream.mockResolvedValue({ complete: true });
    mocks.store.syncProject.mockResolvedValue(mocks.store.currentProject);
    (window as any).electronAPI = {
      saveDownload: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('labels the outline editor as the content-structure step', () => {
    const { container } = renderAt('/project/project-1/outline', <OutlineEditor />);

    expect(screen.getByText('Step 1 · 内容结构')).toBeInTheDocument();
    expect(screen.getByText('Step 1 · 内容结构')).not.toHaveClass('rounded-full');
    expect(screen.getByText('Step 1 · 内容结构')).toHaveClass('rounded-[var(--app-radius-control)]');
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
    expect(screen.getByText('Step 3 · 视觉成稿')).not.toHaveClass('rounded-full');
    expect(screen.getByText('Step 3 · 视觉成稿')).toHaveClass('rounded-[var(--app-radius-control)]');
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

    expect(screen.getByRole('main').parentElement).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr) minmax(0, 344px)',
    });
    expect(screen.getByTestId('slide-preview-viewport')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('slide-preview-canvas').style.width).toContain('cqh');
  });

  it('keeps the multi-select toolbar outside the thumbnail scroll area', () => {
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

    const toolbar = screen.getByTestId('slide-multiselect-toolbar');
    const thumbnailScroll = screen.getByTestId('slide-thumbnail-scroll');
    expect(thumbnailScroll).not.toContainElement(toolbar);
    expect(toolbar.parentElement).toBe(thumbnailScroll.parentElement);
  });

  it('keeps long outline and description content inside the inspector width', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      outline_content: {
        title: 'Slide 1',
        points: ['这是一个非常长的页面大纲要点，用来验证属性栏中的文本会在固定宽度内断行而不会撑开布局'],
      },
      description_content: {
        text: '这是一段很长的页面描述内容，用来验证描述区域会保持属性栏宽度并在内部换行。'.repeat(4),
      },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    const outline = screen.getByTestId('preview-page-outline');
    const description = screen.getByTestId('preview-page-description');
    expect(outline).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-hidden');
    expect(outline.querySelector('ul')).toHaveClass('min-w-0', 'max-w-full');
    expect(outline.querySelector('li')).toHaveClass('min-w-0', 'max-w-full');
    expect(outline.querySelector('li span:last-child')).toHaveClass('min-w-0', 'break-words');
    expect(description).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-hidden');
    expect(description.querySelector('p')).toHaveClass('min-w-0', 'max-w-full', 'break-words');
  });

  it('edits the project AI requirements from the page inspector', async () => {
    const endpoints = await import('@/api/endpoints');
    mocks.store.currentProject.extra_requirements = '保持统一配色';
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    const requirements = screen.getByRole('textbox', { name: '项目硬性要求' });
    expect(requirements).toHaveValue('保持统一配色');
    fireEvent.change(requirements, { target: { value: '减少文字，突出关键数据' } });
    fireEvent.click(screen.getByRole('button', { name: '保存项目要求' }));

    await waitFor(() => {
      expect(endpoints.updateProject).toHaveBeenCalledWith('project-1', {
        extra_requirements: '减少文字，突出关键数据',
      });
    });
  });

  it('resolves description image URLs inside the edit dialog', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      generated_image_path: '/files/page-1.png',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: {
        text: '<div><img src="/files/mineru/demo/imgs/source.jpg" alt="Image" /></div>',
      },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);
    fireEvent.click(screen.getByRole('button', { name: '页面属性：编辑当前页' }));

    expect(screen.getByAltText('Desc image 1')).toHaveAttribute(
      'src',
      'http://127.0.0.1:5000/files/mineru/demo/imgs/source.jpg',
    );
  });

  it('edits and saves outline and description from the page inspector', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      outline_content: { title: '旧标题', points: ['旧要点'] },
      description_content: { text: '旧描述' },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '编辑大纲' }));
    fireEvent.change(screen.getByRole('textbox', { name: '页面大纲标题' }), { target: { value: '新标题' } });
    fireEvent.change(screen.getByRole('textbox', { name: '页面大纲要点' }), { target: { value: '新要点 1\n新要点 2' } });
    fireEvent.click(within(screen.getByTestId('preview-page-outline')).getByRole('button', { name: '保存' }));
    expect(mocks.store.updatePageLocal).toHaveBeenCalledWith('page-1', {
      outline_content: { title: '新标题', points: ['新要点 1', '新要点 2'] },
    });

    fireEvent.click(screen.getByRole('button', { name: '编辑描述' }));
    fireEvent.change(screen.getByRole('textbox', { name: '页面描述内容' }), { target: { value: '新描述' } });
    fireEvent.click(within(screen.getByTestId('preview-page-description')).getByRole('button', { name: '保存' }));
    expect(mocks.store.updatePageLocal).toHaveBeenCalledWith('page-1', {
      description_content: { text: '新描述' },
    });
  });

  it('keeps the image edit footer visible while the modal content scrolls', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    expect(screen.getByTestId('edit-page-footer')).toHaveClass('sticky', 'bottom-0');
  });

  it('pauses active image generation when leaving the preview page', () => {
    mocks.store.activeImageTask = {
      task_id: 'image-task-active',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 2, completed: 0, page_ids: ['page-1', 'page-2'] },
    };

    const { unmount } = renderAt('/project/project-1/preview', <SlidePreview />);
    unmount();

    expect(mocks.store.pauseImageGeneration).toHaveBeenCalledTimes(1);
  });

  it('labels the image generation primary action as start generation', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'DESCRIPTION_GENERATED',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    expect(screen.getByRole('button', { name: '开始生成 (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /批量生成图片/ })).not.toBeInTheDocument();
  });

  it('labels the page edit image action as start generation', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    expect(screen.getByRole('heading', { name: '编辑页面' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始生成' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成图片' })).not.toBeInTheDocument();
  });

  it('uses saved image generation settings when starting a batch', async () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'DESCRIPTION_GENERATED',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    mocks.store.generateImages.mockResolvedValueOnce(undefined);
    const endpoints = await import('@/api/endpoints');
    vi.mocked(endpoints.getSettings).mockResolvedValueOnce({
      data: { image_resolution: '2K' },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '图片生成设置' }));
    fireEvent.click(screen.getByText('高级设置'));
    fireEvent.change(screen.getByLabelText('生成并发'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('视觉密度'), { target: { value: 'rich' } });
    fireEvent.change(screen.getByLabelText('视觉风格'), { target: { value: 'tech' } });
    fireEvent.change(screen.getByLabelText('PPT 构图安全区'), { target: { value: 'text-left' } });
    fireEvent.click(screen.getByRole('radio', { name: '纪实' }));
    fireEvent.change(screen.getByLabelText('特殊视觉要求'), { target: { value: '蓝绿色科技感' } });
    fireEvent.click(screen.getByLabelText('使用模板约束'));
    fireEvent.click(screen.getByRole('button', { name: '保存图片生成设置' }));
    fireEvent.click(screen.getByRole('button', { name: '开始生成 (1)' }));

    await waitFor(() => {
      expect(mocks.store.generateImages).toHaveBeenCalledWith(
        ['page-1'],
        {
          maxWorkers: 2,
          useTemplate: false,
          density: 'rich',
          style: 'tech',
          composition: 'text-left',
          restraint: 'documentary',
          customPrompt: '蓝绿色科技感',
        },
      );
    });
  }, 15_000);

  it('shows quality reminders for conflicting image prompt requirements', () => {
    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '图片生成设置' }));
    fireEvent.click(screen.getByText('高级设置'));
    fireEvent.change(screen.getByLabelText('视觉风格'), { target: { value: 'photo' } });
    fireEvent.change(screen.getByLabelText('PPT 构图安全区'), { target: { value: 'text-left' } });
    fireEvent.click(screen.getByRole('radio', { name: '纪实' }));
    fireEvent.change(screen.getByLabelText('特殊视觉要求'), {
      target: { value: 'cinematic neon ultra-detailed flat illustration，主体在左侧' },
    });

    expect(screen.getByRole('status')).toHaveTextContent('生成质量提醒');
    expect(screen.getByRole('status')).toHaveTextContent('高渲染词');
    expect(screen.getByRole('status')).toHaveTextContent('真实商业摄影');
    expect(screen.getByRole('status')).toHaveTextContent('纪实');
    expect(screen.getByRole('status')).toHaveTextContent('左文右图');
  });

  it('keeps image generation settings scoped to the current project', async () => {
    const endpoints = await import('@/api/endpoints');
    vi.mocked(endpoints.getSettings).mockResolvedValue({
      data: { image_resolution: '2K' },
    } as any);
    mocks.store.generateImages.mockResolvedValue(undefined);
    mocks.store.currentProject = {
      ...mocks.store.currentProject,
      id: 'project-1',
      pages: [{
        id: 'page-1',
        page_id: 'page-1',
        order_index: 0,
        status: 'DESCRIPTION_GENERATED',
        outline_content: { title: 'Slide 1', points: [] },
        description_content: { text: 'Desc 1' },
      }],
    };

    const first = renderAt('/project/project-1/preview', <SlidePreview />);
    fireEvent.click(screen.getByRole('button', { name: '图片生成设置' }));
    fireEvent.change(screen.getByLabelText('生成并发'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('视觉密度'), { target: { value: 'rich' } });
    fireEvent.change(screen.getByLabelText('视觉风格'), { target: { value: 'tech' } });
    fireEvent.click(screen.getByRole('button', { name: '保存图片生成设置' }));
    first.unmount();

    mocks.store.generateImages.mockClear();
    mocks.store.currentProject = {
      ...mocks.store.currentProject,
      id: 'project-2',
      pages: [{
        id: 'page-2',
        page_id: 'page-2',
        order_index: 0,
        status: 'DESCRIPTION_GENERATED',
        outline_content: { title: 'Slide 2', points: [] },
        description_content: { text: 'Desc 2' },
      }],
    };

    renderAt('/project/project-2/preview', <SlidePreview />);
    fireEvent.click(screen.getByRole('button', { name: '开始生成 (1)' }));

    await waitFor(() => {
      expect(mocks.store.generateImages).toHaveBeenCalledWith(
        ['page-2'],
        {
          maxWorkers: 4,
          useTemplate: true,
          density: 'standard',
          style: 'theme',
          composition: 'auto',
          restraint: 'strong',
          customPrompt: '',
        },
      );
    });
  }, 15_000);

  it('migrates legacy global image generation settings into the current project once', async () => {
    const endpoints = await import('@/api/endpoints');
    vi.mocked(endpoints.getSettings).mockResolvedValue({
      data: { image_resolution: '2K' },
    } as any);
    localStorage.setItem('slidePreviewImageGenerationSettings', JSON.stringify({
      maxWorkers: 2,
      useTemplate: false,
      density: 'rich',
      style: 'tech',
      customPrompt: '旧版设置',
    }));
    mocks.store.generateImages.mockResolvedValue(undefined);
    mocks.store.currentProject = {
      ...mocks.store.currentProject,
      id: 'legacy-project',
      pages: [{
        id: 'legacy-page',
        page_id: 'legacy-page',
        order_index: 0,
        status: 'DESCRIPTION_GENERATED',
        outline_content: { title: 'Legacy Slide', points: [] },
        description_content: { text: 'Legacy Desc' },
      }],
    };

    renderAt('/project/legacy-project/preview', <SlidePreview />);
    fireEvent.click(screen.getByRole('button', { name: '开始生成 (1)' }));

    await waitFor(() => {
      expect(mocks.store.generateImages).toHaveBeenCalledWith(
        ['legacy-page'],
        {
          maxWorkers: 2,
          useTemplate: false,
          density: 'rich',
          style: 'tech',
          composition: 'auto',
          restraint: 'strong',
          customPrompt: '旧版设置',
        },
      );
    });
    expect(localStorage.getItem('slidePreviewImageGenerationSettings')).toBeNull();
    expect(localStorage.getItem('slidePreviewImageGenerationSettings:legacy-project')).toContain('旧版设置');
  });

  it('uses the primary image action to pause and resume an active generation task', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'GENERATING',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    mocks.store.activeImageTask = {
      task_id: 'image-task-1',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 1, completed: 0, page_ids: ['page-1'] },
    };

    const { rerender } = renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '暂停生成' }));
    expect(mocks.store.pauseImageGeneration).toHaveBeenCalledTimes(1);

    mocks.store.activeImageTask = {
      ...mocks.store.activeImageTask,
      status: 'PAUSED',
    };
    rerender(
      <MemoryRouter initialEntries={['/project/project-1/preview']}>
        <Routes>
          <Route path="/project/:projectId/*" element={<SlidePreview />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '继续生成' }));
    expect(mocks.store.resumeImageGeneration).toHaveBeenCalledTimes(1);
  });

  it('allows selecting failed pages for targeted image generation', async () => {
    const endpoints = await import('@/api/endpoints');
    mocks.store.currentProject.pages = [
      {
        id: 'page-ready',
        page_id: 'page-ready',
        order_index: 0,
        status: 'COMPLETED',
        generated_image_path: '/files/page-ready.png',
        outline_content: { title: 'Ready Slide', points: [] },
        description_content: { text: 'Ready desc' },
      },
      {
        id: 'page-failed',
        page_id: 'page-failed',
        order_index: 1,
        status: 'FAILED',
        outline_content: { title: 'Failed Slide', points: [] },
        description_content: { text: 'Failed desc' },
      },
    ];
    vi.mocked(endpoints.getSettings).mockResolvedValueOnce({
      data: { image_resolution: '2K' },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '多选' }));
    fireEvent.click(screen.getAllByRole('button', { name: '选择第 2 页' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '生成选中页面 (1)' }));

    await waitFor(() => {
      expect(mocks.store.generateImages).toHaveBeenCalledWith(
        ['page-failed'],
        { maxWorkers: 4, useTemplate: true, density: 'standard', style: 'theme', composition: 'auto', restraint: 'strong', customPrompt: '' },
      );
    });
  }, 15_000);

  it('shows image generation progress below the main preview canvas', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'GENERATING',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    mocks.store.activeImageTask = {
      task_id: 'image-task-progress',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 3, completed: 1, page_ids: ['page-1', 'page-2', 'page-3'] },
    };

    renderAt('/project/project-1/preview', <SlidePreview />);

    const progress = screen.getByText('正在生成 1 / 3');
    expect(progress.closest('footer')).not.toBeNull();
  });

  it('opens image quality details and locates the affected page', async () => {
    const endpoints = await import('@/api/endpoints');
    vi.mocked(endpoints.getSettings).mockResolvedValueOnce({
      data: { image_resolution: '2K' },
    } as any);
    mocks.store.currentProject.pages = [
      {
        id: 'page-1',
        page_id: 'page-1',
        order_index: 0,
        status: 'COMPLETED',
        generated_image_path: '/files/page-1.png',
        outline_content: { title: '封面', points: [] },
        description_content: { text: 'Desc 1' },
      },
      {
        id: 'page-2',
        page_id: 'page-2',
        order_index: 1,
        status: 'COMPLETED',
        generated_image_path: '/files/page-2.png',
        outline_content: { title: '质量问题页', points: [] },
        description_content: { text: 'Desc 2' },
      },
    ];
    mocks.store.imageQualityReport = {
      total: 2,
      completed: 2,
      quality_summary: { checked: 2, passed: 1, warnings: 1 },
      pages: [{
        page_id: 'page-2',
        status: 'completed',
        qa: {
          status: 'warning',
          width: 1024,
          height: 1024,
          issues: ['resolution_mismatch'],
        },
      }],
    };

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '查看图片质量提醒，共 1 页' }));
    const dialog = screen.getByRole('dialog', { name: '图片质量提醒' });
    expect(dialog).toHaveTextContent('第 2 页 · 质量问题页');
    expect(dialog).toHaveTextContent('实际尺寸：1024 × 1024 px');
    expect(dialog).toHaveTextContent('图片分辨率与生成设置不一致');
    expect(dialog).not.toHaveTextContent('resolution_mismatch');

    fireEvent.click(within(dialog).getByRole('button', { name: '定位此页' }));

    expect(within(screen.getByTestId('slide-preview-canvas')).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/files/page-2.png'),
    );

    fireEvent.click(screen.getByRole('button', { name: '查看图片质量提醒，共 1 页' }));
    const reopenedDialog = screen.getByRole('dialog', { name: '图片质量提醒' });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: '重新生成' }));

    await waitFor(() => {
      expect(mocks.store.generatePageImage).toHaveBeenCalledWith(
        'page-2',
        true,
        expect.objectContaining({ qualityIssues: ['resolution_mismatch'] }),
      );
    });
  });

  it('shows a retry action when the selected image page failed', async () => {
    const endpoints = await import('@/api/endpoints');
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'FAILED',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    vi.mocked(endpoints.getSettings).mockResolvedValueOnce({
      data: { image_resolution: '2K' },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    expect(screen.getByText('生成失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试此页' }));

    await waitFor(() => {
      expect(mocks.store.generatePageImage).toHaveBeenCalledWith(
        'page-1',
        true,
        { maxWorkers: 4, useTemplate: true, density: 'standard', style: 'theme', composition: 'auto', restraint: 'strong', customPrompt: '' },
      );
    });
  });

  it('labels a missing image page action as start generating this page', () => {
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'DESCRIPTION_GENERATED',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];

    renderAt('/project/project-1/preview', <SlidePreview />);

    expect(screen.getByRole('button', { name: '开始生成此页' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成此页' })).not.toBeInTheDocument();
  });

  it('opens the export task panel after starting a PPTX export', async () => {
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
    vi.mocked(endpoints.exportPPTX).mockResolvedValueOnce({
      data: {
        download_url: '/files/project-1/exports/年度经营复盘.pptx',
        filename: '年度经营复盘.pptx',
      },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: '导出为 PPTX' }));
    const startExportButton = screen.getByRole('button', { name: '开始导出' });
    expect(startExportButton).toHaveClass('bg-[var(--app-primary-action)]');
    expect(startExportButton).not.toHaveClass('bg-[var(--app-accent)]');
    fireEvent.click(startExportButton);

    await waitFor(() => {
      expect(screen.getByText('导出任务面板')).toBeInTheDocument();
    });
    expect(mocks.addExportTask).toHaveBeenCalledWith(expect.objectContaining({
      type: 'pptx',
      status: 'COMPLETED',
      filename: '年度经营复盘.pptx',
    }));
    expect((window as any).electronAPI.saveDownload).not.toHaveBeenCalled();
  }, 15_000);

  it.each([
    {
      label: '导出为 PDF',
      endpoint: 'exportPDF',
      type: 'pdf',
      downloadUrl: '/files/project-1/exports/年度经营复盘.pdf',
      filename: '年度经营复盘.pdf',
    },
    {
      label: '导出为图片',
      endpoint: 'exportImages',
      type: 'images',
      downloadUrl: '/files/project-1/exports/年度经营复盘_images.zip',
      filename: '年度经营复盘_images.zip',
    },
  ])('adds a completed $type export task without downloading immediately', async ({ label, endpoint, type, downloadUrl, filename }) => {
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
    vi.mocked((endpoints as any)[endpoint]).mockResolvedValueOnce({
      data: {
        download_url: downloadUrl,
        filename,
      },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(() => {
      expect(screen.getByText('导出任务面板')).toBeInTheDocument();
    });
    expect(mocks.addExportTask).toHaveBeenCalledWith(expect.objectContaining({
      type,
      status: 'COMPLETED',
      filename,
      downloadUrl,
    }));
    expect((window as any).electronAPI.saveDownload).not.toHaveBeenCalled();
  });

  it('applies a Gorden image template in existing projects even when its reference image is unavailable', async () => {
    const endpoints = await import('@/api/endpoints');
    const templateSelector = await import('@/components/shared/TemplateSelector');
    mocks.store.currentProject.pages = [{
      id: 'page-1',
      page_id: 'page-1',
      order_index: 0,
      status: 'COMPLETED',
      generated_image_path: '/files/page-1.png',
      outline_content: { title: 'Slide 1', points: [] },
      description_content: { text: 'Desc 1' },
    }];
    vi.mocked(templateSelector.getTemplateFile).mockResolvedValueOnce(null);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getAllByRole('button', { name: '更换模板' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '选择 Gorden 数据模板' }));

    await waitFor(() => {
      expect(endpoints.updateProject).toHaveBeenCalledWith(
        'project-1',
        { template_pack_id: 'gorden-data-viz-deck' },
      );
    });
    expect(endpoints.uploadTemplate).not.toHaveBeenCalled();
    expect(mocks.toastShow).toHaveBeenCalledWith({
      message: '模板更换成功',
      type: 'success',
    });
  });

  it('sends the selected Ken Burns style when exporting narration video', async () => {
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
      data: { output_language: 'zh' },
    } as any);
    vi.mocked(endpoints.exportVideo).mockResolvedValueOnce({
      data: { task_id: 'video-task-1' },
    } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: '导出为讲解视频' }));
    await screen.findByText('讲解视频导出设置');
    fireEvent.click(screen.getByRole('button', { name: '高级设置' }));
    fireEvent.change(screen.getByLabelText('旁白模式'), { target: { value: 'dialogue' } });
    expect(screen.queryByText('语音音色')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: '晓晓（中文 · 女声）' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Jenny（英文 · 女声）' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '培训课程' }));
    expect(screen.getByLabelText(/启用画面动效/)).toBeChecked();
    fireEvent.change(screen.getByLabelText('镜头动效风格'), { target: { value: 'pan' } });
    const startVideoExportButton = screen.getByRole('button', { name: '开始导出' });
    expect(startVideoExportButton).toHaveClass('bg-[var(--app-primary-action)]');
    fireEvent.click(startVideoExportButton);

    await waitFor(() => {
      expect(endpoints.exportVideo).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          enableKenBurns: true,
          kenBurnsStyle: 'pan',
          directorConfig: expect.objectContaining({
            preset: 'training',
            motion_intensity: 'standard',
          }),
          narrationMode: 'dialogue',
          speakers: expect.arrayContaining([
            expect.objectContaining({ id: 'host' }),
            expect.objectContaining({ id: 'expert' }),
          ]),
        }),
      );
    });
  }, 15_000);

  it('closes narration video settings with Escape', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: '导出为讲解视频' }));
    expect(screen.getByRole('dialog', { name: '讲解视频导出设置' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '讲解视频导出设置' })).not.toBeInTheDocument();
  });

  it('loads Fish Audio voices and sends multi-speaker export options', async () => {
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
    vi.mocked(endpoints.getFishAudioVoices).mockResolvedValueOnce({
      data: {
        voices: [
          { id: 'fish-host', title: '主持人克隆声线', state: 'trained', languages: ['zh'], visibility: 'private' },
          { id: 'fish-guest', title: '嘉宾克隆声线', state: 'trained', languages: ['zh'], visibility: 'private' },
          { id: 'fish-third', title: '第三人克隆声线', state: 'trained', languages: ['zh'], visibility: 'private' },
        ],
      },
    } as any);
    vi.mocked(endpoints.exportVideo).mockResolvedValueOnce({ data: { task_id: 'fish-video-task' } } as any);

    renderAt('/project/project-1/preview', <SlidePreview />);

    fireEvent.click(screen.getByRole('button', { name: '导出 导出' }));
    fireEvent.click(screen.getByRole('button', { name: '导出为讲解视频' }));
    expect(screen.getByRole('dialog', { name: '讲解视频导出设置' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '高级设置' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Fish Audio s2.1-pro-free' }));

    await waitFor(() => expect(screen.getByLabelText('Fish Audio 私有声线')).toHaveValue('fish-host'));
    fireEvent.change(screen.getByLabelText('旁白模式'), { target: { value: 'dialogue' } });
    fireEvent.click(screen.getByRole('button', { name: '添加角色' }));
    expect(screen.getByLabelText('角色 3 私有声线')).toBeInTheDocument();
    expect(screen.getByLabelText('自动匹配场景语气')).toBeChecked();
    fireEvent.click(screen.getByLabelText('自动匹配场景语气'));
    fireEvent.click(screen.getByRole('button', { name: '开始导出' }));

    await waitFor(() => {
      expect(endpoints.preflightExportVideo).toHaveBeenCalledWith('project-1', expect.objectContaining({
        ttsProvider: 'fish_audio',
        narrationMode: 'dialogue',
        speakers: expect.arrayContaining([
          expect.objectContaining({ voice: 'fish-host' }),
          expect.objectContaining({ voice: 'fish-guest' }),
          expect.objectContaining({ voice: 'fish-third' }),
        ]),
      }));
      expect(endpoints.exportVideo).toHaveBeenCalledWith('project-1', expect.objectContaining({
        ttsProvider: 'fish_audio',
        autoEmotion: false,
        narrationMode: 'dialogue',
        speakers: expect.arrayContaining([
          expect.objectContaining({ voice: 'fish-host' }),
          expect.objectContaining({ voice: 'fish-guest' }),
          expect.objectContaining({ voice: 'fish-third' }),
        ]),
      }));
    });
  }, 15_000);
});
