import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, FileText, FileEdit, ImagePlus, Paperclip, Palette, Lightbulb, HelpCircle, ChevronDown, Upload, RefreshCw, Loader2, X } from 'lucide-react';
import { AppTopNav, Button, SegmentedControl, useToast, MaterialSelector, ReferenceFileList, ReferenceFileSelector, FilePreviewModal, TextStyleSelector } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate, uploadReferenceFile, type ReferenceFile, associateFileToProject, triggerFileParse, associateMaterialsToProject, createPptRenovationProject, extractStyleFromImage, optimizeProjectBrief } from '@/api/endpoints';
import { NativeThemePicker } from '@/components/native-deck/NativeThemePicker';
import { useProjectStore } from '@/store/useProjectStore';
import { devLog } from '@/utils/logger';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import type { ContentWorkspaceKind, Material, NativeImageSettings, RenderMode } from '@/types';
import { useT } from '@/hooks/useT';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { findGordenTemplatePack } from '@/config/gordenTemplatePacks';

type CreationType = 'idea' | 'outline' | 'description' | 'blank' | 'ppt_renovation';

// 支持作为参考文件上传的文档扩展名（与后端 file_parser_service 保持一致）
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'docx', 'pptx', 'doc', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md'];
const DEFAULT_TEMPLATE_VISUAL_SETTINGS: NativeImageSettings = {
  density: 'standard',
  style: 'theme',
  composition: 'auto',
  palette: 'default',
  custom_palette: {},
  chart_theme: 'clean',
  media_style: 'auto',
  tone: 'strategy',
  custom_prompt: '',
  custom_counts: {},
};

const templatePaletteOptions = [['default', '跟随模板'], ['enterprise_blue', '企业蓝'], ['teal', '青绿'], ['black_gold', '黑金'], ['orange_gray', '橙灰'], ['custom', '自定义']] as const;
const templateChartOptions = [['clean', '清爽'], ['consulting', '咨询'], ['contrast', '高对比'], ['executive', '高管']] as const;
const templateMediaOptions = [['auto', '跟随页面'], ['photo', '写实照片'], ['illustration', '克制插画'], ['product', '产品主体'], ['none', '少用图片']] as const;
const templateToneOptions = [['strategy', '战略'], ['sales', '销售'], ['government', '政府'], ['technical', '技术'], ['research', '研究']] as const;
const templateColorKeys = [['accent', '主色'], ['secondary', '辅助'], ['surface', '背景'], ['text', '文字']] as const;
const templatePaletteColors = {
  default: { accent: '#087f8c', secondary: '#d49a2a', surface: '#f7f8f6', text: '#18232d' },
  enterprise_blue: { accent: '#1d4ed8', secondary: '#0f766e', surface: '#f4f7fb', text: '#172033' },
  teal: { accent: '#087f5b', secondary: '#d49a2a', surface: '#f4f8f5', text: '#172720' },
  black_gold: { accent: '#b8860b', secondary: '#111827', surface: '#f7f4ec', text: '#18181b' },
  orange_gray: { accent: '#c05621', secondary: '#475569', surface: '#f7f5f2', text: '#242426' },
} as const;

// 页面特有翻译 - AI 可以直接看到所有文案，保留原始 key 结构
const homeI18n = {
  zh: {
    nav: {
      home: '首页', createProject: '创建项目',
      materialGenerate: '素材生成', materialCenter: '素材中心',
      history: '我的项目', settings: '设置'
    },
    settings: {
      language: { label: '界面语言' },
      theme: { label: '主题模式', light: '浅色', dark: '深色', system: '跟随系统' }
    },
    home: {
      title: '让 AI 协助完成从构思到成稿的 PPT 创作流程。',
      subtitle: '从一句构思生成大纲与页面描述，并持续优化内容结构、版式表达与视觉风格。支持参考文件、资产复用与模板复用，帮助演示文稿生产流程保持连续、规范与可控。',
      tagline: '从想法到成稿，始终轻松、清晰、可控',
      features: {
        oneClick: '一句话生成 PPT',
        naturalEdit: '自然语言修改',
        regionEdit: '指定区域编辑',
        export: '一键导出 PPTX/PDF',
      },
      tabs: {
        idea: '一句话生成',
        outline: '大纲生成',
        description: '描述生成',
        blank: '空白项目',
        ppt_renovation: 'PPT 翻新',
      },
      renderMode: {
        label: '生成模式',
        image: '图片生成',
        native: '原生可编辑',
        imageDescription: '生成高质量图片页面，可导出 PDF / PPTX。',
        nativeDescription: '生成可编辑页面，导出不依赖版面解析服务。',
      },
      tabDescriptions: {
        idea: '输入你的想法，AI 将为你生成完整的 PPT',
        outline: '已有大纲？直接粘贴，AI 将自动切分为结构化大纲',
        description: '已有完整描述？AI 将自动解析并直接生成图片，跳过大纲步骤',
        blank: '从空白画布开始，手动添加页面和内容',
        ppt_renovation: '上传已有的 PDF/PPTX 文件，AI 将解析内容并重新生成翻新后的PPT',
      },
      placeholders: {
        idea: '例如：生成一份关于 AI 发展史的演讲 PPT',
        outline: '粘贴你的 PPT 大纲...',
        description: '粘贴你的完整页面描述...',
      },
      examples: {
        outline: '格式示例：\n\n第一页：AI 的起源\n- 1956年达特茅斯会议\n- 早期研究者的愿景\n\n第二页：机器学习的发展\n- 从规则驱动到数据驱动\n- 经典算法介绍\n\n第三页：未来展望\n- 趋势与挑战\n\n支持标题+要点的形式，也可以只写标题。AI 会自动切分为结构化大纲。',
        description: '格式示例：\n\n第一页：AI 的起源\n介绍人工智能概念的诞生，从1956年达特茅斯会议讲起。页面采用左文右图布局，左侧展示时间线，右侧配一张复古风格的计算机插画。\n\n第二页：机器学习的发展\n讲解从规则驱动到数据驱动的转变。使用深蓝色背景，中央放置算法对比图表，底部列出关键里程碑。\n\n每页可包含内容描述、排版布局、视觉风格等，用空行分隔各页。',
      },
      template: {
        title: '选择风格模板',
        useTextStyle: '使用文字描述风格',
        subtitle: '选择一种最适合当前项目的风格方式，先把整体视觉方向定下来。',
        recommend: '推荐使用',
        extractTitle: '从图片提取风格',
        extractDesc: '如果你已经有喜欢的视觉参考，这是最自然的起点。上传图片后会自动提炼出可编辑的风格描述。',
        extractButton: '开始提取',
        extractImageButton: '选择参考图片',
        extracting: '提取中...',
        resultTitle: '提取结果',
        resultDesc: '提取后的风格描述会显示在这里，你可以继续补充或精简。',
        tabs: {
          extract: '图片提取',
          preset: '预设模板',
          mine: '我的模板',
          material: '素材库',
        },
      },
      actions: {
        selectFile: '选择参考文件',
        parsing: '解析中...',
        createProject: '创建项目',
      },
      renovation: {
        uploadHint: '点击或拖拽上传 PDF / PPTX 文件',
        formatHint: '支持 .pdf, .pptx, .ppt 格式（推荐上传 PDF）',
        keepLayout: '保留原始排版布局',
        onlyPdfPptx: '仅支持 PDF 和 PPTX 文件',
        uploadFile: '请先上传 PDF 或 PPTX 文件',
      },
      messages: {
        enterContent: '请输入内容',
        filesParsing: '还有 {{count}} 个参考文件正在解析中，请等待解析完成',
        projectCreateFailed: '项目创建失败',
        uploadingImage: '正在上传图片并识别内容...',
        imageUploadSuccess: '图片上传成功！已插入到光标位置',
        imageUploadFailed: '图片上传失败',
        fileUploadSuccess: '文件上传成功',
        fileUploadFailed: '文件上传失败',
        fileTooLarge: '文件过大：{{size}}MB，最大支持 200MB',
        fileUploadInProgress: '正在上传文件，请等待当前上传完成后再试',
        unsupportedFileType: '不支持的文件类型: {{type}}',
        loadTemplateFailed: '加载模板失败，请重新选择或上传模板',
        pptTip: '建议先在本地将 PPTX 转为 PDF 后再上传，可获得更好的兼容性和更快的处理速度',
        filesAdded: '已添加 {{count}} 个参考文件',
        imageRemoved: '已移除图片',
        extractSuccess: '风格提取成功',
        extractFailed: '风格提取失败',
        serviceTestTip: '建议先到设置页底部进行服务测试，避免后续功能异常',
        verifying: '正在验证 API 配置...',
        verifyFailed: '请在设置页连接 OpenAI 或配置正确的 API Key，并按需进行服务测试',
      },
    },
  },
  en: {
    nav: {
      home: 'Home', createProject: 'Create Project',
      materialGenerate: 'Material Generation', materialCenter: 'Material Center',
      history: 'My Projects', settings: 'Settings'
    },
    settings: {
      language: { label: 'Interface Language' },
      theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' }
    },
    home: {
      title: 'Let AI support the full presentation workflow from concept to final deck.',
      subtitle: 'Generate outlines and page descriptions from a single idea, then keep refining content structure, layout expression, and visual style with reusable assets and templates.',
      tagline: 'From idea to final deck, clear and controllable',
      features: {
        oneClick: 'One-click PPT generation',
        naturalEdit: 'Natural language editing',
        regionEdit: 'Region-specific editing',
        export: 'Export to PPTX/PDF',
      },
      tabs: {
        idea: 'From Idea',
        outline: 'Outline',
        description: 'Description',
        blank: 'Blank Project',
        ppt_renovation: 'PPT Renovation',
      },
      renderMode: {
        label: 'Generation mode',
        image: 'Image generation',
        native: 'Native editable',
        imageDescription: 'Generate image-based slides for PDF / PPTX export.',
        nativeDescription: 'Generate editable slides without layout parsing services.',
      },
      tabDescriptions: {
        idea: 'Enter your idea, AI will generate a complete PPT for you',
        outline: 'Have an outline? Paste it directly, AI will split it into a structured outline',
        description: 'Have detailed descriptions? AI will parse and generate images directly, skipping the outline step',
        blank: 'Start from an empty canvas and add pages and content manually',
        ppt_renovation: 'Upload an existing PDF/PPTX file, AI will parse its content and regenerate the renovated PPT',
      },
      placeholders: {
        idea: 'e.g., Generate a presentation about the history of AI',
        outline: 'Paste your PPT outline...',
        description: 'Paste your complete page descriptions...',
      },
      examples: {
        outline: 'Format example:\n\nSlide 1: The Origins of AI\n- 1956 Dartmouth Conference\n- Vision of early researchers\n\nSlide 2: The Rise of Machine Learning\n- From rule-based to data-driven\n- Classic algorithms overview\n\nSlide 3: Future Outlook\n- Trends and challenges\n\nTitles with bullet points, or titles only. AI will split it into a structured outline.',
        description: 'Format example:\n\nSlide 1: The Origins of AI\nIntroduce the birth of AI, starting from the 1956 Dartmouth Conference. Use a left-text right-image layout with a timeline on the left and a retro-style computer illustration on the right.\n\nSlide 2: The Rise of Machine Learning\nExplain the shift from rule-based to data-driven approaches. Dark blue background, algorithm comparison chart in the center, key milestones at the bottom.\n\nEach slide can include content, layout, and visual style. Separate slides with blank lines.',
      },
      template: {
        title: 'Select Style Template',
        useTextStyle: 'Use text description for style',
        subtitle: 'Choose a visual direction before generating slides.',
        recommend: 'Recommended',
        extractTitle: 'Extract style from image',
        extractDesc: 'Upload a reference image and turn it into an editable style description.',
        extractButton: 'Start extraction',
        extractImageButton: 'Choose reference image',
        extracting: 'Extracting...',
        resultTitle: 'Extraction Result',
        resultDesc: 'The extracted style description appears here and can be refined.',
        tabs: {
          extract: 'Image Extract',
          preset: 'Preset',
          mine: 'My Templates',
          material: 'Materials',
        },
      },
      actions: {
        selectFile: 'Select reference file',
        parsing: 'Parsing...',
        createProject: 'Create Project',
      },
      renovation: {
        uploadHint: 'Click or drag to upload PDF / PPTX file',
        formatHint: 'Supports .pdf, .pptx, .ppt formats (PDF recommended)',
        keepLayout: 'Keep original layout',
        onlyPdfPptx: 'Only PDF and PPTX files are supported',
        uploadFile: 'Please upload a PDF or PPTX file first',
      },
      messages: {
        enterContent: 'Please enter content',
        filesParsing: '{{count}} reference file(s) are still parsing, please wait',
        projectCreateFailed: 'Failed to create project',
        uploadingImage: 'Uploading and recognizing image...',
        imageUploadSuccess: 'Image uploaded! Inserted at cursor position',
        imageUploadFailed: 'Failed to upload image',
        fileUploadSuccess: 'File uploaded successfully',
        fileUploadFailed: 'Failed to upload file',
        fileTooLarge: 'File too large: {{size}}MB, maximum 200MB',
        fileUploadInProgress: 'A file upload is already in progress — please wait for it to finish',
        unsupportedFileType: 'Unsupported file type: {{type}}',
        loadTemplateFailed: 'Failed to load the template. Please select or upload it again',
        pptTip: 'We recommend converting your PPTX to PDF locally before uploading for better compatibility and faster processing',
        filesAdded: 'Added {{count}} reference file(s)',
        imageRemoved: 'Image removed',
        extractSuccess: 'Style extracted successfully',
        extractFailed: 'Style extraction failed',
        serviceTestTip: 'Test services in Settings first to avoid issues',
        verifying: 'Verifying API configuration...',
        verifyFailed: 'Please connect OpenAI or configure a valid API Key in Settings, then run service tests when needed',
      },
    },
  },
};

function TemplateVisualSettingsPanel({ value, onChange, disabled }: {
  value: NativeImageSettings;
  onChange: (settings: NativeImageSettings) => void;
  disabled?: boolean;
}) {
  const palette = value.palette || 'default';
  const colors = palette === 'custom'
    ? { ...templatePaletteColors.default, ...(value.custom_palette || {}) }
    : templatePaletteColors[palette as keyof typeof templatePaletteColors] || templatePaletteColors.default;
  const update = (patch: Partial<NativeImageSettings>) => onChange({ ...value, ...patch });

  return (
    <section className="mt-3 space-y-3 border-t border-[var(--app-border)] pt-3" aria-label="模板视觉调节">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
          <span>配色</span>
          <select aria-label="模板配色" disabled={disabled} value={palette} onChange={(event) => update({ palette: event.target.value as NativeImageSettings['palette'] })} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none">
            {templatePaletteOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
          <span>图表</span>
          <select aria-label="模板图表风格" disabled={disabled} value={value.chart_theme || 'clean'} onChange={(event) => update({ chart_theme: event.target.value as NativeImageSettings['chart_theme'] })} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none">
            {templateChartOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
          <span>图片</span>
          <select aria-label="模板图片策略" disabled={disabled} value={value.media_style || 'auto'} onChange={(event) => update({ media_style: event.target.value as NativeImageSettings['media_style'] })} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none">
            {templateMediaOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
          <span>语气</span>
          <select aria-label="模板文案语气" disabled={disabled} value={value.tone || 'strategy'} onChange={(event) => update({ tone: event.target.value as NativeImageSettings['tone'] })} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] focus:border-[var(--app-accent)] focus:outline-none">
            {templateToneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {templateColorKeys.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] text-[var(--app-text-secondary)]">
            <span className="h-3 w-3 rounded-sm border border-[var(--app-border)]" style={{ background: colors[key] }} />
            <span>{label}</span>
            {palette === 'custom' && <input aria-label={`自定义${label}`} type="color" disabled={disabled} value={colors[key]} onChange={(event) => update({ custom_palette: { ...(value.custom_palette || {}), [key]: event.target.value } })} className="h-5 w-5 border-0 bg-transparent p-0" />}
          </label>
        ))}
      </div>
    </section>
  );
}

export const Home: React.FC<{ showNavigation?: boolean }> = ({ showNavigation = true }) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const t = useT(homeI18n); // 组件内翻译 + 自动 fallback 到全局
  const { initializeProject, isGlobalLoading } = useProjectStore();
  const { show, ToastContainer } = useToast();
  
  const [activeTab, setActiveTab] = useState<CreationType>('idea');
  const [initialWorkspace, setInitialWorkspace] = useState<ContentWorkspaceKind>('ppt');
  const [renderMode, setRenderMode] = useState<RenderMode>('image');
  const [nativeTheme, setNativeTheme] = useState('theme01');
  const [templateVisualSettings, setTemplateVisualSettings] = useState<NativeImageSettings>(DEFAULT_TEMPLATE_VISUAL_SETTINGS);
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const [useTemplateStyle, setUseTemplateStyle] = useState(false);
  const [useNativeTextStyle, setUseNativeTextStyle] = useState(false);
  const [templateStyle, setTemplateStyle] = useState('');
  const [isExtractingStyle, setIsExtractingStyle] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isAspectRatioOpen, setIsAspectRatioOpen] = useState(false);
  const [renovationFile, setRenovationFile] = useState<File | null>(null);
  const [keepLayout, setKeepLayout] = useState(false);
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [isOptimizingBrief, setIsOptimizingBrief] = useState(false);
  const [briefNote, setBriefNote] = useState('');
  const [briefError, setBriefError] = useState('');
  const renovationFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);

  // 持久化草稿到 sessionStorage，确保跳转设置页后返回时内容不丢失
  useEffect(() => {
    if (content) {
      sessionStorage.setItem('home-draft-content', content);
    }
  }, [content]);

  useEffect(() => {
    sessionStorage.setItem('home-draft-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (initialWorkspace !== 'ppt' && (activeTab === 'ppt_renovation' || activeTab === 'blank')) {
      setActiveTab('idea');
    }
  }, [activeTab, initialWorkspace]);


  // 检查是否有当前项目 & 加载用户模板
  useEffect(() => {
    const projectId = localStorage.getItem('currentProjectId');
    setCurrentProjectId(projectId);

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('加载用户模板失败:', error);
      }
    };
    loadTemplates();
  }, []);

  const textareaRef = useRef<MarkdownTextareaRef>(null);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);

  // Callback to insert at cursor position in the textarea
  const insertAtCursor = useCallback((markdown: string) => {
    textareaRef.current?.insertAtCursor(markdown);
  }, []);

  // 图片粘贴使用统一 hook（批量支持，不对非图片文件发出警告，由下方 handlePaste 处理文档）
  const { handlePaste: handleImagePaste, handleFiles: handleImageFiles, isUploading: isUploadingImage } = useImagePaste({
    projectId: null,
    setContent,
    showToast: show,
    warnUnsupportedTypes: false,
    insertAtCursor,
  });

  const handleMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setContent);
    textareaRef.current?.insertAtCursor(markdown + '\n');
  }, [setContent]);

  // 检测粘贴事件，图片走 hook，文档走独立逻辑
  const handlePaste = async (e: React.ClipboardEvent<HTMLElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 分类：图片 vs 文档 vs 不支持
    let hasImages = false;
    const docFiles: File[] = [];
    const unsupportedExts: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;

      if (file.type.startsWith('image/')) {
        hasImages = true;
      } else {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        if (fileExt && ALLOWED_DOC_EXTENSIONS.includes(fileExt)) {
          docFiles.push(file);
        } else {
          unsupportedExts.push(fileExt || file.type);
        }
      }
    }

    // 图片交给 hook 处理（批量上传）
    if (hasImages) {
      handleImagePaste(e);
    }

    // 文档文件逐个上传
    if (docFiles.length > 0) {
      if (!hasImages) e.preventDefault();
      for (const file of docFiles) {
        await handleFileUpload(file);
      }
    }

    // 不支持的文件类型提示
    if (unsupportedExts.length > 0 && !hasImages && docFiles.length === 0) {
      show({ message: t('home.messages.unsupportedFileType', { type: unsupportedExts.join(', ') }), type: 'info' });
    }
  };

  // 上传文件
  // 在 Home 页面，文件始终上传为全局文件（不关联项目），因为此时还没有项目
  const handleFileUpload = useCallback(async (file: File) => {
    if (isUploadingFile) return;

    // 检查文件大小（前端预检查）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      show({ 
        message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }), 
        type: 'error' 
      });
      return;
    }

    // 检查是否是PPT文件，提示建议使用PDF
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (fileExt === 'ppt' || fileExt === 'pptx') 
      show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
    
    setIsUploadingFile(true);
    try {
      // 在 Home 页面，始终上传为全局文件
      const response = await uploadReferenceFile(file, null);
      if (response?.data?.file) {
        const uploadedFile = response.data.file;
        setReferenceFiles(prev => [...prev, uploadedFile]);
        show({ message: t('home.messages.fileUploadSuccess'), type: 'success' });
        
        // 如果文件状态为 pending，自动触发解析
        if (uploadedFile.parse_status === 'pending') {
          try {
            const parseResponse = await triggerFileParse(uploadedFile.id);
            // 使用解析接口返回的文件对象更新状态
            if (parseResponse?.data?.file) {
              const parsedFile = parseResponse.data.file;
              setReferenceFiles(prev => 
                prev.map(f => f.id === uploadedFile.id ? parsedFile : f)
              );
            } else {
              // 如果没有返回文件对象，手动更新状态为 parsing（异步线程会稍后更新）
              setReferenceFiles(prev => 
                prev.map(f => f.id === uploadedFile.id ? { ...f, parse_status: 'parsing' as const } : f)
              );
            }
          } catch (parseError: any) {
            console.error('触发文件解析失败:', parseError);
            // 解析触发失败不影响上传成功提示
          }
        }
      } else {
        show({ message: t('home.messages.fileUploadFailed'), type: 'error' });
      }
    } catch (error: any) {
      console.error('文件上传失败:', error);
      
      // 特殊处理413错误
      if (error?.response?.status === 413) {
        show({
          message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }),
          type: 'error'
        });
      } else {
        show({
          message: `${t('home.messages.fileUploadFailed')}: ${error?.response?.data?.error?.message || error.message || ''}`.replace(/: $/, ''),
          type: 'error'
        });
      }
    } finally {
      setIsUploadingFile(false);
    }
  }, [isUploadingFile, show, t]);

  // 拖拽进来的文档文件：按扩展名过滤后复用 handleFileUpload（逐个上传+自动触发解析）
  const handleDocumentFiles = useCallback(async (files: File[]) => {
    // 已有上传在进行时告知用户，避免文件被静默丢弃（handleFileUpload 的 isUploadingFile 守卫）
    if (isUploadingFile) {
      show({ message: t('home.messages.fileUploadInProgress'), type: 'info' });
      return;
    }

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && ALLOWED_DOC_EXTENSIONS.includes(ext)) {
        accepted.push(file);
      } else {
        rejected.push(ext || file.type || file.name);
      }
    }

    if (rejected.length > 0) {
      // 去重扩展名，避免一次拖入多个同类型不支持文件时 toast 重复冗长
      show({
        message: t('home.messages.unsupportedFileType', {
          type: Array.from(new Set(rejected)).join(', '),
        }),
        type: 'info',
      });
    }

    for (const file of accepted) {
      await handleFileUpload(file);
    }
  }, [isUploadingFile, handleFileUpload, show, t]);

  // 从当前项目移除文件引用（不删除文件本身）
  const handleFileRemove = (fileId: string) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 文件状态变化回调
  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setReferenceFiles(prev => 
      prev.map(f => f.id === updatedFile.id ? updatedFile : f)
    );
  };

  // 点击回形针按钮 - 打开文件选择器
  const handlePaperclipClick = () => {
    setIsFileSelectorOpen(true);
  };

  // 从选择器选择文件后的回调
  const handleFilesSelected = (selectedFiles: ReferenceFile[]) => {
    // 合并新选择的文件到列表（去重）
    setReferenceFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
      // 合并时，如果文件已存在，更新其状态（可能解析状态已改变）
      const updated = prev.map(f => {
        const updatedFile = selectedFiles.find(sf => sf.id === f.id);
        return updatedFile || f;
      });
      return [...updated, ...newFiles];
    });
    show({ message: t('home.messages.filesAdded', { count: selectedFiles.length }), type: 'success' });
  };

  // 获取当前已选择的文件ID列表，传递给选择器（使用 useMemo 避免每次渲染都重新计算）
  const selectedFileIds = useMemo(() => {
    return referenceFiles.map(f => f.id);
  }, [referenceFiles]);

  // 文件选择变化
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }

    // 清空 input，允许重复选择同一文件
    e.target.value = '';
  };

  const tabConfig = {
    idea: {
      icon: <Sparkles size={20} />,
      label: t('home.tabs.idea'),
      placeholder: t('home.placeholders.idea'),
      description: t('home.tabDescriptions.idea'),
      example: null as string | null,
    },
    outline: {
      icon: <FileText size={20} />,
      label: t('home.tabs.outline'),
      placeholder: t('home.placeholders.outline'),
      description: t('home.tabDescriptions.outline'),
      example: t('home.examples.outline'),
    },
    description: {
      icon: <FileEdit size={20} />,
      label: t('home.tabs.description'),
      placeholder: t('home.placeholders.description'),
      description: t('home.tabDescriptions.description'),
      example: t('home.examples.description'),
    },
    blank: {
      icon: <FileText size={20} />,
      label: t('home.tabs.blank'),
      placeholder: '',
      description: t('home.tabDescriptions.blank'),
      example: null as string | null,
    },
    ppt_renovation: {
      icon: <RefreshCw size={20} />,
      label: t('home.tabs.ppt_renovation'),
      placeholder: '',
      description: t('home.tabDescriptions.ppt_renovation'),
      example: null as string | null,
    },
  };

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    // 总是同步当前文件选择；切换到视觉模板时清掉旧上传文件，避免旧文件残留参与生成。
    setSelectedTemplate(templateFile);
    
    // 处理模板 ID
    if (templateId) {
      // 判断是用户模板还是预设模板
      // 预设模板 ID 通常是 '1', '2', '3' 等短字符串
      // 用户模板 ID 通常较长（UUID 格式）
      if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
        // 预设模板
        setSelectedPresetTemplateId(templateId);
        setSelectedTemplateId(null);
      } else {
        // 用户模板
        setSelectedTemplateId(templateId);
        setSelectedPresetTemplateId(null);
      }
    } else {
      // 如果没有 templateId，可能是直接上传的文件
      // 清空所有选择状态
      setSelectedTemplateId(null);
      setSelectedPresetTemplateId(null);
    }
  };

  const handleStyleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsExtractingStyle(true);
    try {
      const result = await extractStyleFromImage(file);
      if (result.data?.style_description) {
        setTemplateStyle(result.data.style_description);
        setUseTemplateStyle(true);
        setSelectedTemplate(null);
        setSelectedTemplateId(null);
        setSelectedPresetTemplateId(null);
        show({ message: t('home.messages.extractSuccess'), type: 'success' });
      }
    } catch (error: any) {
      show({ message: `${t('home.messages.extractFailed')}: ${error?.message || ''}`, type: 'error' });
    } finally {
      setIsExtractingStyle(false);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI 优化简报：只回填表单，不落库、不创建工作区；429/超时显示稳定中文错误。
  const handleOptimizeBrief = async () => {
    setBriefError('');
    setBriefNote('');
    if (!content.trim() && !audience.trim() && !goal.trim()) {
      setBriefError('请先填写主题、受众或目标中的至少一项，再让 AI 优化。');
      return;
    }
    setIsOptimizingBrief(true);
    try {
      const topicCandidate = activeTab === 'idea' ? content.trim() : '';
      const result = await optimizeProjectBrief({
        topic: topicCandidate,
        audience: audience.trim(),
        goal: goal.trim(),
      });
      if (result.data) {
        setAudience(result.data.audience || audience);
        setGoal(result.data.goal || goal);
        if (topicCandidate && result.data.topic) {
          setContent(result.data.topic);
        }
        setBriefNote(result.data.rationale || 'AI 已生成优化建议，请检查后开始生成。');
      } else {
        setBriefError('AI 优化失败，请稍后重试');
      }
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error?.message || error?.message || '';
      setBriefError(status === 429 || message.includes('429')
        ? 'AI 服务当前请求过于频繁，请稍后重试，或在设置中切换文本模型。'
        : (message || 'AI 优化失败，请稍后重试'));
    } finally {
      setIsOptimizingBrief(false);
    }
  };

  const handleSubmit = async () => {
    // For ppt_renovation, validate file instead of content
    if (activeTab === 'ppt_renovation') {
      if (!renovationFile) {
        show({ message: t('home.renovation.uploadFile'), type: 'error' });
        return;
      }
    } else if (activeTab !== 'blank' && !content.trim()) {
      show({ message: t('home.messages.enterContent'), type: 'error' });
      return;
    }

    // 检查是否有正在解析的文件
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: t('home.messages.filesParsing', { count: parsingFiles.length }),
        type: 'info'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // PPT 翻新模式：走独立的上传+异步解析流程
      if (initialWorkspace === 'ppt' && activeTab === 'ppt_renovation' && renovationFile) {
        const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;
        const result = await createPptRenovationProject(renovationFile, {
          keepLayout,
          templateStyle: styleDesc,
        });

        const projectId = result.data?.project_id;
        const taskId = result.data?.task_id;
        if (!projectId) {
          show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
          return;
        }

        // Save project ID and task ID for DetailEditor to poll
        localStorage.setItem('currentProjectId', projectId);
        if (taskId) {
          localStorage.setItem('renovationTaskId', taskId);
        }

        // Clear draft
        sessionStorage.removeItem('home-draft-content');
        sessionStorage.removeItem('home-draft-tab');

        // Navigate to detail editor (will poll for task completion with skeleton UI)
        navigate(`/project/${projectId}/ppt/detail`);
        return;
      }

      // 图片模式下模板决定视觉骨架，文字描述风格只作为可选微调。
      const selectedGordenTemplate = renderMode === 'image'
        ? findGordenTemplatePack(selectedTemplateId)
        : undefined;

      // 如果有模板ID但没有File，按需加载。Gorden 视觉模板以 template_pack_id/style 为主，
      // 参考图只是增强提示，加载失败不能阻断项目创建。
      let templateFile = selectedTemplate;
      if (!templateFile && (selectedTemplateId || selectedPresetTemplateId)) {
        const templateId = selectedTemplateId || selectedPresetTemplateId;
        if (templateId) {
          const loadedTemplateFile = await getTemplateFile(templateId, userTemplates);
          if (loadedTemplateFile) {
            templateFile = loadedTemplateFile;
          } else if (!selectedGordenTemplate) {
            show({ message: t('home.messages.loadTemplateFailed'), type: 'error' });
            return;
          }
        }
      }
      
      const imageTextStyleDesc = renderMode === 'image' && useTemplateStyle ? templateStyle.trim() : '';
      const nativeTextStyleDesc = renderMode === 'native' && useNativeTextStyle ? templateStyle.trim() : '';
      const styleDesc = [
        selectedGordenTemplate?.style,
        imageTextStyleDesc,
        nativeTextStyleDesc,
      ].filter(Boolean).join('\n') || undefined;

      // 传递参考文件ID列表，确保 AI 生成时能读取参考文件内容
      const refFileIds = referenceFiles
        .filter(f => f.parse_status === 'completed')
        .map(f => f.id);

      await initializeProject(activeTab as 'idea' | 'outline' | 'description' | 'blank', content, templateFile || undefined, styleDesc, refFileIds.length > 0 ? refFileIds : undefined, aspectRatio, renderMode, nativeTheme, selectedGordenTemplate?.id, renderMode === 'image' ? templateVisualSettings : undefined, initialWorkspace, audience.trim() || goal.trim() ? { audience, goal } : undefined);
      
      // 根据类型跳转到不同页面
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
        return;
      }
      
      // 关联未完成解析的参考文件（已完成的在 initializeProject 中关联）
      if (referenceFiles.length > 0) {
        const unassociatedFiles = referenceFiles.filter(f => f.parse_status !== 'completed');
        if (unassociatedFiles.length > 0) {
          devLog(`Associating ${unassociatedFiles.length} remaining reference files to project ${projectId}:`, unassociatedFiles);
          try {
            await Promise.all(
              unassociatedFiles.map(async file => {
                const response = await associateFileToProject(file.id, projectId);
                return response;
              })
            );
          } catch (error) {
            console.error('Failed to associate reference files:', error);
          }
        }
      }
      
      // 关联图片素材到项目（解析content中的markdown图片链接）
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const materialUrls: string[] = [];
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        materialUrls.push(match[2]); // match[2] 是 URL
      }
      
      if (materialUrls.length > 0) {
        devLog(`Associating ${materialUrls.length} materials to project ${projectId}:`, materialUrls);
        try {
          const response = await associateMaterialsToProject(projectId, materialUrls);
          devLog('Materials associated successfully:', response);
        } catch (error) {
          console.error('Failed to associate materials:', error);
          // 不影响主流程，继续执行
        }
      } else {
        devLog('No materials to associate');
      }
      
      const nextRoute = initialWorkspace === 'video'
        ? `/project/${projectId}/video`
        : initialWorkspace === 'podcast'
          ? `/project/${projectId}/podcast`
          : `/project/${projectId}/ppt/outline`;
      navigate(nextRoute);
    } catch (error: any) {
      console.error('创建项目失败:', error);
      const msg = error?.response?.data?.error?.message || error?.message || t('home.messages.projectCreateFailed');
      show({ message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-reference-canvas min-h-screen bg-[var(--app-background)] text-[var(--app-text)] ">
      {showNavigation && <AppTopNav />}

      <main className="mx-auto w-full max-w-[1152px] px-5 pb-12 pt-6 md:px-10">
        <header className="mb-5">
          <h1 id="create-title" className="text-xl font-semibold leading-7 text-[var(--app-text)]">{t('nav.createProject')}</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--app-text-secondary)]">
            先选择首次工作区，再从想法、现有内容或参考资料开始创作。
          </p>
        </header>

        <section
          id="create"
          aria-labelledby="create-title"
          className="border-y border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-5 md:px-5 md:py-6"
        >
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold text-[var(--app-text-secondary)]">首次工作区</p>
            <SegmentedControl
              ariaLabel="首次工作区"
              value={initialWorkspace}
              onChange={setInitialWorkspace}
              disabled={isSubmitting || isGlobalLoading}
              className="grid w-full grid-cols-3 rounded-[var(--app-radius-control)] p-1 [&>button]:w-full [&>button]:rounded-[var(--app-radius-control)]"
              options={[
                { value: 'ppt', label: 'PPT' },
                { value: 'video', label: '视频' },
                { value: 'podcast', label: '播客' },
              ]}
            />
          </div>
          <SegmentedControl
            ariaLabel="创建方式"
            value={activeTab}
            onChange={setActiveTab}
            disabled={isSubmitting || isGlobalLoading}
            className="mb-5 grid w-full grid-cols-2 rounded-[var(--app-radius-control)] p-1 sm:grid-cols-5 [&>button]:w-full [&>button]:rounded-[var(--app-radius-control)]"
            options={(Object.keys(tabConfig) as CreationType[])
              .filter((type) => initialWorkspace === 'ppt' || (type !== 'ppt_renovation' && type !== 'blank'))
              .map((type) => ({ value: type, label: tabConfig[type].label }))}
          />

            {initialWorkspace === 'ppt' && activeTab !== 'ppt_renovation' && (
              <div className="mb-4">
                <SegmentedControl
                  ariaLabel={t('home.renderMode.label')}
                  value={renderMode}
                  onChange={setRenderMode}
                  disabled={isSubmitting || isGlobalLoading}
                  className="w-full rounded-[var(--app-radius-control)] p-1 [&>button]:flex-1 [&>button]:rounded-[var(--app-radius-control)]"
                  options={[
                    { value: 'image', label: t('home.renderMode.image') },
                    { value: 'native', label: t('home.renderMode.native') },
                  ]}
                />
                <p className="mt-2 text-xs leading-5 text-[var(--app-text-secondary)]">
                  {renderMode === 'image' ? t('home.renderMode.imageDescription') : t('home.renderMode.nativeDescription')}
                </p>
              </div>
            )}

          <div className="mb-4 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3.5 py-2.5 text-sm text-[var(--app-text-secondary)]">
            <div className="flex flex-wrap items-center gap-2">
              <Lightbulb size={16} className="shrink-0 text-[var(--app-accent)]" />
              <span className="font-medium">{tabConfig[activeTab].description}</span>
              <span className="text-xs text-[var(--app-text-tertiary)]">{initialWorkspace === 'ppt' ? 'PDF / PPTX' : initialWorkspace === 'video' ? '场景时间线' : '节目片段'}</span>
              {tabConfig[activeTab].example && (
                <span className="relative group/tip inline-flex">
                  <HelpCircle size={15} className="text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-accent)]" />
                  <span className="absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 whitespace-pre-line rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-xs leading-relaxed text-[var(--app-text-secondary)] shadow-[var(--app-shadow-floating)] group-hover/tip:block md:w-80">
                    {tabConfig[activeTab].example}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* 输入区 - 带工具栏 */}
          <div className="mb-2">
            {activeTab === 'blank' ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-4 rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-6 text-center">
                <p className="text-sm text-[var(--app-text-secondary)]">{t('home.tabDescriptions.blank')}</p>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={isSubmitting || isGlobalLoading}
                >
                  {t('home.actions.createProject')}
                </Button>
              </div>
            ) : activeTab === 'ppt_renovation' ? (
              /* PPT 翻新：文件上传区 */
              <div className="space-y-4">
                <div
                  className="relative rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] p-3"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file && (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt'))) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
                      }
                    } else {
                      show({ message: t('home.renovation.onlyPdfPptx'), type: 'error' });
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => renovationFileInputRef.current?.click()}
                    className="flex min-h-28 w-full items-center justify-center rounded-[var(--app-radius-control)] px-4 text-center transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                    aria-label={renovationFile ? `更换文件 ${renovationFile.name}` : t('home.renovation.uploadHint')}
                  >
                  {renovationFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={24} className="text-[var(--app-accent)]" />
                      <div className="text-left">
                        <p className="max-w-md truncate text-sm font-medium text-[var(--app-text)]" title={renovationFile.name}>{renovationFile.name}</p>
                        <p className="text-xs text-[var(--app-text-tertiary)]">{(renovationFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload size={28} className="mx-auto text-[var(--app-text-tertiary)]" />
                      <p className="text-sm text-[var(--app-text-secondary)]">{t('home.renovation.uploadHint')}</p>
                      <p className="text-xs text-[var(--app-text-tertiary)]">{t('home.renovation.formatHint')}</p>
                    </div>
                  )}
                  </button>
                  {renovationFile && (
                    <button
                      type="button"
                      onClick={() => setRenovationFile(null)}
                      className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-error)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                      aria-label={`移除文件 ${renovationFile.name}`}
                      title="移除文件"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                <input
                  ref={renovationFileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
                      }
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={keepLayout}
                      onChange={(e) => setKeepLayout(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--app-border-strong)] accent-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                    />
                    <span>{t('home.renovation.keepLayout')}</span>
                  </label>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    loading={isSubmitting || isGlobalLoading}
                    disabled={!renovationFile}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            ) : (
            <MarkdownTextarea
              ref={textareaRef}
              placeholder={tabConfig[activeTab].placeholder}
              value={content}
              onChange={setContent}
              onPaste={handlePaste}
              onFiles={handleImageFiles}
              onDocumentFiles={handleDocumentFiles}
              onSelectFromLibrary={() => setIsMaterialSelectorOpen(true)}
              rows={activeTab === 'idea' ? 4 : 8}
              className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] text-sm shadow-none transition-colors focus-within:!border-[var(--app-accent)] focus-within:!ring-0 [&_[contenteditable]:focus-visible]:!outline-none [&_[contenteditable]]:!h-[140px] [&_[contenteditable]]:!min-h-0 [&_[contenteditable]]:resize-none"
              toolbarLeft={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePaperclipClick}
                    className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                    title={t('home.actions.selectFile')}
                    aria-label={t('home.actions.selectFile')}
                  >
                    <Paperclip size={18} />
                  </button>
                  {/* 画面比例选择 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsAspectRatioOpen(!isAspectRatioOpen)}
                      className="flex h-10 items-center gap-1 rounded-[var(--app-radius-control)] px-2 text-xs font-medium text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                      title={i18n.language?.startsWith('zh') ? '画面比例' : 'Aspect Ratio'}
                      aria-haspopup="menu"
                      aria-expanded={isAspectRatioOpen}
                    >
                      <span>{aspectRatio}</span>
                      <ChevronDown size={12} className={`transition-transform ${isAspectRatioOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isAspectRatioOpen && (
                      <>
                        <button type="button" aria-label="关闭画面比例菜单" className="fixed inset-0 z-40 cursor-default" onClick={() => setIsAspectRatioOpen(false)} />
                        <div role="menu" className="absolute bottom-full left-0 z-50 mb-1 min-w-[92px] rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-[var(--app-shadow-floating)]">
                          {ASPECT_RATIO_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={aspectRatio === opt.value}
                              onClick={() => { setAspectRatio(opt.value); setIsAspectRatioOpen(false); }}
                              className={`w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--app-surface-hover)] ${aspectRatio === opt.value ? 'font-semibold text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              }
              toolbarRight={
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={isSubmitting || isGlobalLoading}
                  disabled={
                    !content.trim() ||
                    isUploadingImage ||
                    referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                  }
                >
                  {referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                    ? t('home.actions.parsing')
                    : t('common.next')}
                </Button>
              }
            />
            )}
          </div>

          {/* 项目简报：可选定位字段 + AI 优化，不阻塞生成 */}
          {activeTab !== 'ppt_renovation' && (
            <section aria-label="项目简报" className="mb-4 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--app-text)]">项目简报（可选）</p>
                  <p className="mt-0.5 text-xs text-[var(--app-text-tertiary)]">受众与目标会作为跨工作区的共享上下文，可留空直接开始。</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={isOptimizingBrief ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  loading={isOptimizingBrief}
                  disabled={isSubmitting || isGlobalLoading || (!content.trim() && !audience.trim() && !goal.trim())}
                  onClick={() => void handleOptimizeBrief()}
                >
                  AI 优化简报
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
                  <span>受众</span>
                  <input
                    aria-label="受众"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    placeholder="例如：管理层、客户或公众"
                    disabled={isSubmitting || isGlobalLoading}
                    className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-tertiary)] focus:border-[var(--app-accent)] focus:outline-none"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
                  <span>内容目标</span>
                  <input
                    aria-label="内容目标"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="例如：形成决策共识或推动下一步行动"
                    disabled={isSubmitting || isGlobalLoading}
                    className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-tertiary)] focus:border-[var(--app-accent)] focus:outline-none"
                  />
                </label>
              </div>
              {briefNote && <p className="mt-2 text-xs text-[var(--app-accent)]">{briefNote}</p>}
              {briefError && <p role="alert" className="mt-2 text-xs text-[var(--app-danger)]">{briefError}</p>}
            </section>
          )}

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          <ReferenceFileList
            files={referenceFiles}
            onFileClick={setPreviewFileId}
            onFileDelete={handleFileRemove}
            onFileStatusChange={handleFileStatusChange}
            deleteMode="remove"
            className="mb-4"
            showToast={show}
          />

          {initialWorkspace === 'ppt' && (renderMode === 'image' ? <div className="mb-6 border-t border-[var(--app-border)] pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Palette size={18} className="flex-shrink-0 text-[var(--app-accent)]" />
                <h3 className="text-[15px] font-semibold leading-[22px] text-[var(--app-text)]">
                  {t('home.template.title')}
                </h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={isExtractingStyle ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                onClick={() => styleImageInputRef.current?.click()}
                disabled={isExtractingStyle}
              >
                {isExtractingStyle ? t('home.template.extracting') : t('home.template.extractTitle')}
              </Button>
              <input
                ref={styleImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleStyleImageSelect}
                className="hidden"
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-text-secondary)]">
                <input
                  type="checkbox"
                  checked={useTemplateStyle}
                  onChange={(e) => setUseTemplateStyle(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--app-border-strong)] accent-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                />
                <span>{t('home.template.useTextStyle')}</span>
              </label>
            </div>

            {useTemplateStyle && (
              <div className="mb-4">
                <TextStyleSelector
                  value={templateStyle}
                  onChange={setTemplateStyle}
                  onToast={show}
                />
              </div>
            )}
            <TemplateSelector
              onSelect={handleTemplateSelect}
              selectedTemplateId={selectedTemplateId}
              selectedPresetTemplateId={selectedPresetTemplateId}
              selectedTemplateDetails={(
                <TemplateVisualSettingsPanel
                  value={templateVisualSettings}
                  onChange={setTemplateVisualSettings}
                  disabled={isSubmitting || isGlobalLoading}
                />
              )}
              showUpload={true}
              projectId={currentProjectId}
            />
          </div> : (
            <div data-testid="native-text-style" className="mb-6 border-t border-[var(--app-border)] pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Palette size={18} className="flex-shrink-0 text-[var(--app-accent)]" />
                  <h3 className="text-[15px] font-semibold leading-[22px] text-[var(--app-text)]">文字描述风格</h3>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useNativeTextStyle}
                    onChange={(event) => setUseNativeTextStyle(event.target.checked)}
                    disabled={isSubmitting || isGlobalLoading}
                    className="h-4 w-4 rounded border-[var(--app-border-strong)] accent-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                  />
                  <span>使用文字描述风格</span>
                </label>
              </div>
              {useNativeTextStyle && <TextStyleSelector value={templateStyle} onChange={setTemplateStyle} onToast={show} />}
              <div data-testid="native-preset-styles" className="mt-5 border-t border-[var(--app-border)] pt-5">
                <NativeThemePicker value={nativeTheme} onChange={setNativeTheme} disabled={isSubmitting || isGlobalLoading} />
              </div>
            </div>
          ))}

        </section>

      </main>
      <ToastContainer />
      {/* 从素材库选择插入到文本框 */}
      <MaterialSelector
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleMaterialSelect}
        multiple
        mediaKindFilter={['image']}
      />
      {/* 参考文件选择器 */}
      {/* 在 Home 页面，始终查询全局文件，因为此时还没有项目 */}
      <ReferenceFileSelector
        projectId={null}
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        multiple={true}
        initialSelectedIds={selectedFileIds}
      />
      
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
    </div>
  );
};
