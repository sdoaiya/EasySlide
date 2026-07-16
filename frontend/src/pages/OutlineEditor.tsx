import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, FileText, Sparkle, Download, Upload, ChevronDown, List, SlidersHorizontal } from 'lucide-react';
import { useT } from '@/hooks/useT';
import PresetCapsules from '@/components/shared/PresetCapsules';
import { getStaticAssetUrl } from '@/api/client';

// 组件内翻译
const outlineI18n = {
  zh: {
    home: { title: 'EasySlide' },
    outline: {
      title: "编辑大纲", workflowStage: "Step 1 · 内容结构", workflowHint: "整理想法、素材和页面顺序", pageCount: "共 {{count}} 页", addPage: "添加页面",
      generateDescriptions: "生成描述", generating: "生成中...", chapter: "章节",
      page: "第 {{num}} 页", titleLabel: "标题", keyPoints: "要点",
      keyPointsPlaceholder: "要点（每行一个）", addKeyPoint: "添加要点",
      deletePage: "删除页面", confirmDeletePage: "确定要删除这一页吗？",
      preview: "预览", clickToPreview: "点击左侧卡片查看详情",
      noPages: "还没有页面", noPagesHint: "点击「添加页面」手动创建，或「自动生成大纲」让 AI 帮你完成",
      parseOutline: "解析大纲", autoGenerate: "自动生成大纲",
      reParseOutline: "重新解析大纲", reGenerate: "重新生成大纲", export: "导出大纲", import: "导入", importExport: "导入/导出",
      aiPlaceholder: "例如：增加一页关于XXX的内容、删除第3页、合并前两页... · Ctrl+Enter提交",
      aiPlaceholderShort: "例如：增加/删除页面... · Ctrl+Enter",
      contextLabels: { idea: "PPT构想", outline: "大纲", description: "描述" },
      inputLabel: { idea: "PPT 构想", outline: "原始大纲", description: "页面描述", ppt_renovation: "原始 PPT 内容" },
      inputPlaceholder: { idea: "输入你的 PPT 构想...", outline: "输入大纲内容...", description: "输入页面描述...", ppt_renovation: "已从 PDF 中提取内容" },
      outlineRequirements: "大纲生成要求",
      outlineRequirementsPlaceholder: "例如：限制在10页以内、每页要点不超过3条、多使用图表...",
      pageNavigation: "页面导航",
      pageNavigationHint: "点击页面可快速定位并修改。",
      expandContext: "展开构想与要求",
      collapseContext: "收起构想与要求",
      importModalTitle: "导入 Markdown",
      importModalDesc: "可直接粘贴 Markdown，也可以上传 `.md` 或 `.txt` 文件。导入的页面会追加到当前项目末尾。",
      importPasteLabel: "粘贴内容",
      importPastePlaceholder: "把大纲或大纲+描述的 Markdown 粘贴到这里...",
      importUploadLabel: "上传文件",
      importUploadHint: "点击选择文件，或拖拽 Markdown 文件到这里",
      importUploadFormatsHint: "支持 `.md`、`.txt`",
      importConfirm: "导入到项目",
      importCancel: "取消",
      messages: {
        outlineEmpty: "大纲不能为空", generateSuccess: "描述生成完成", generateFailed: "生成描述失败",
        generateIncomplete: "大纲生成可能不完整，请检查后重试",
        confirmRegenerate: "重新生成将更新所有页面标题。已有的描述和图片会按位置保留，但如果新大纲页数减少，多出的页面及其内容将被删除。确定继续吗？",
        confirmRegenerateTitle: "确认重新生成",
        lockPageCount: "锁定页面数量（不允许减少，用空白页填补）",
        refineSuccess: "大纲修改成功",
        refineFailed: "修改失败，请稍后重试", exportSuccess: "导出成功",
        importSuccess: "导入成功", importFailed: "导入失败，请检查文件格式", importEmpty: "文件中未找到有效页面",
        importContentEmpty: "请先粘贴内容或上传文件",
        importReadFailed: "读取文件失败，请重试",
        loadingProject: "加载项目中...", generatingOutline: "生成大纲中...",
        saveFailed: "保存失败",
      }
    }
  },
  en: {
    home: { title: 'EasySlide' },
    outline: {
      title: "Edit Outline", workflowStage: "Step 1 · Content Structure", workflowHint: "Organize ideas, sources, and page order", pageCount: "{{count}} pages", addPage: "Add Page",
      generateDescriptions: "Generate Descriptions", generating: "Generating...", chapter: "Chapter",
      page: "Page {{num}}", titleLabel: "Title", keyPoints: "Key Points",
      keyPointsPlaceholder: "Key points (one per line)", addKeyPoint: "Add Key Point",
      deletePage: "Delete Page", confirmDeletePage: "Are you sure you want to delete this page?",
      preview: "Preview", clickToPreview: "Click a card on the left to view details",
      noPages: "No pages yet", noPagesHint: "Click \"Add Page\" to create manually, or \"Auto Generate\" to let AI help you",
      parseOutline: "Parse Outline", autoGenerate: "Auto Generate Outline",
      reParseOutline: "Re-parse Outline", reGenerate: "Regenerate Outline", export: "Export Outline", import: "Import", importExport: "Import/Export",
      aiPlaceholder: "e.g., Add a page about XXX, delete page 3, merge first two pages... · Ctrl+Enter to submit",
      aiPlaceholderShort: "e.g., Add/delete pages... · Ctrl+Enter",
      contextLabels: { idea: "PPT Idea", outline: "Outline", description: "Description" },
      inputLabel: { idea: "PPT Idea", outline: "Original Outline", description: "Page Descriptions", ppt_renovation: "Original PPT Content" },
      inputPlaceholder: { idea: "Enter your PPT idea...", outline: "Enter outline content...", description: "Enter page descriptions...", ppt_renovation: "Content extracted from PDF" },
      outlineRequirements: "Generation Requirements",
      outlineRequirementsPlaceholder: "e.g., Limit to 10 pages, max 3 points per page, use more charts...",
      pageNavigation: "Page Navigation",
      pageNavigationHint: "Click a page to jump there and edit.",
      expandContext: "Expand idea and requirements",
      collapseContext: "Collapse idea and requirements",
      importModalTitle: "Import Markdown",
      importModalDesc: "Paste Markdown directly, or upload a `.md` / `.txt` file. Imported pages will be appended to the current project.",
      importPasteLabel: "Paste Content",
      importPastePlaceholder: "Paste outline or outline+description Markdown here...",
      importUploadLabel: "Upload File",
      importUploadHint: "Click to choose a file, or drag a Markdown file here",
      importUploadFormatsHint: "Supports `.md`, `.txt`",
      importConfirm: "Import into Project",
      importCancel: "Cancel",
      messages: {
        outlineEmpty: "Outline cannot be empty", generateSuccess: "Descriptions generated successfully", generateFailed: "Failed to generate descriptions",
        generateIncomplete: "Outline generation may be incomplete, please review and retry",
        confirmRegenerate: "Regenerating will update all page titles. Existing descriptions and images are preserved by position, but if the new outline has fewer pages, extra pages and their content will be removed. Continue?",
        confirmRegenerateTitle: "Confirm Regenerate",
        lockPageCount: "Lock page count (prevent reduction, fill with blank pages)",
        refineSuccess: "Outline modified successfully",
        refineFailed: "Modification failed, please try again", exportSuccess: "Export successful",
        importSuccess: "Import successful", importFailed: "Import failed, please check file format", importEmpty: "No valid pages found in file",
        importContentEmpty: "Paste some content or upload a file first",
        importReadFailed: "Failed to read file, please try again",
        loadingProject: "Loading project...", generatingOutline: "Generating outline...",
        saveFailed: "Save failed",
      }
    }
  }
};
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Loading, useConfirm, useToast, AiRefineInput, FilePreviewModal, ReferenceFileList, MaterialSelector, ImportMarkdownModal } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { OutlineCard } from '@/components/outline/OutlineCard';
import { useProjectStore } from '@/store/useProjectStore';
import { refineOutline, updateProject, addPage } from '@/api/endpoints';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import type { Material } from '@/types';
import { exportProjectToMarkdown, parseMarkdownPages } from '@/utils/projectUtils';
import type { Page } from '@/types';

// 可排序的卡片包装器
const SortableCard: React.FC<{
  page: Page;
  index: number;
  projectId?: string;
  showToast: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
  onUpdate: (data: Partial<Page>) => void;
  onDelete: () => void;
  onClick: () => void;
  isSelected: boolean;
  isAiRefining?: boolean;
}> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: props.page.id || `page-${props.index}`,
  });

  const style = {
    // 只使用位移变换，不使用缩放，避免拖拽时元素被拉伸
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <OutlineCard {...props} dragHandleProps={listeners} />
    </div>
  );
};

export const OutlineEditor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(outlineI18n);
  const { projectId } = useParams<{ projectId: string }>();
  const fromHistory = (location.state as any)?.from === 'history';
  const {
    currentProject,
    syncProject,
    updatePageLocal,
    saveAllPages,
    reorderPages,
    deletePageById,
    addNewPage,
    generateOutlineStream,
    isGlobalLoading,
    isOutlineStreaming,
  } = useProjectStore();

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isAiRefining, setIsAiRefining] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  // Skeleton fade-out: keep it mounted briefly after streaming ends
  const [skeletonVisible, setSkeletonVisible] = useState(false);
  const [skeletonFading, setSkeletonFading] = useState(false);
  useEffect(() => {
    if (isOutlineStreaming) {
      setSkeletonVisible(true);
      setSkeletonFading(false);
    } else if (skeletonVisible) {
      setSkeletonFading(true);
      const timer = setTimeout(() => {
        setSkeletonVisible(false);
        setSkeletonFading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOutlineStreaming]);
  const { confirm, ConfirmDialog } = useConfirm();
  const { show, ToastContainer } = useToast();

  // 主输入框 ref，用于素材/图片 markdown 插入到光标处。
  const desktopTextareaRef = useRef<MarkdownTextareaRef>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const getInputText = useCallback((project: typeof currentProject) => {
    if (!project) return '';
    if (project.creation_type === 'outline' || project.creation_type === 'ppt_renovation') return project.outline_text || project.idea_prompt || '';
    if (project.creation_type === 'descriptions') return project.description_text || project.idea_prompt || '';
    return project.idea_prompt || '';
  }, []);

  const [inputText, setInputText] = useState('');
  const [isInputDirty, setIsInputDirty] = useState(false);
  const [outlineRequirements, setOutlineRequirements] = useState('');
  const [isRequirementsDirty, setIsRequirementsDirty] = useState(false);
  const reqTextareaRef = useRef<MarkdownTextareaRef>(null);

  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [activeMaterialTarget, setActiveMaterialTarget] = useState<'input' | 'requirements'>('input');

  const handleInputMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setInputText);
    desktopTextareaRef.current?.insertAtCursor(markdown + '\n');
  }, []);

  const handleReqMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setOutlineRequirements);
    reqTextareaRef.current?.insertAtCursor(markdown + '\n');
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!fileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fileMenuOpen]);

  // 项目切换时：强制加载文本
  useEffect(() => {
    if (currentProject) {
      setInputText(getInputText(currentProject));
      setIsInputDirty(false);
      setOutlineRequirements(currentProject.outline_requirements || '');
      setIsRequirementsDirty(false);
    }
  }, [currentProject?.id]);

  const saveInputText = useCallback(async (text: string, creationType: string | undefined) => {
    if (!projectId || !creationType) return;
    try {
      const field = creationType === 'outline'
        ? 'outline_text'
        : creationType === 'descriptions'
          ? 'description_text'
          : 'idea_prompt';
      await updateProject(projectId, { [field]: text } as any);
      await syncProject(projectId);
      setIsInputDirty(false);
    } catch (e) {
      console.error('保存输入文本失败:', e);
      show({ message: t('outline.messages.saveFailed'), type: 'error' });
    }
  }, [projectId, show, syncProject]);

  // Debounced auto-save: save 1s after user stops typing
  useEffect(() => {
    if (!isInputDirty) return;
    const timer = setTimeout(() => {
      saveInputText(inputText, currentProject?.creation_type);
    }, 1000);
    return () => clearTimeout(timer);
  }, [inputText, isInputDirty, saveInputText, currentProject?.creation_type]);

  // Debounced auto-save for outline requirements
  useEffect(() => {
    if (!isRequirementsDirty || !projectId) return;
    const timer = setTimeout(async () => {
      try {
        await updateProject(projectId, { outline_requirements: outlineRequirements });
        setIsRequirementsDirty(false);
      } catch (e) {
        console.error('保存大纲要求失败:', e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [outlineRequirements, isRequirementsDirty, projectId]);

  const handleSaveInputText = useCallback(() => {
    if (!isInputDirty) return;
    saveInputText(inputText, currentProject?.creation_type);
  }, [inputText, isInputDirty, saveInputText, currentProject?.creation_type]);

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    setIsInputDirty(true);
  }, []);

  const insertAtCursor = useCallback((markdown: string) => {
    desktopTextareaRef.current?.insertAtCursor(markdown);
  }, []);

  const { handlePaste: handleImagePaste, handleFiles: handleImageFiles, isUploading: _isUploadingImage } = useImagePaste({
    projectId: projectId || null,
    setContent: setInputText,
    showToast: show,
    insertAtCursor,
  });

  const insertAtReqCursor = useCallback((markdown: string) => {
    reqTextareaRef.current?.insertAtCursor(markdown);
  }, []);

  const { handlePaste: handleReqImagePaste, handleFiles: handleReqImageFiles } = useImagePaste({
    projectId: projectId || null,
    setContent: (updater) => {
      setOutlineRequirements(updater);
      setIsRequirementsDirty(true);
    },
    showToast: show,
    insertAtCursor: insertAtReqCursor,
  });

  const inputLabel = useMemo(() => {
    const type = currentProject?.creation_type || 'idea';
    const key = type === 'descriptions' ? 'description' : type;
    return t(`outline.inputLabel.${key}` as any) || t('outline.contextLabels.idea');
  }, [currentProject?.creation_type, t]);

  const inputPlaceholder = useMemo(() => {
    const type = currentProject?.creation_type || 'idea';
    const key = type === 'descriptions' ? 'description' : type;
    return t(`outline.inputPlaceholder.${key}` as any) || '';
  }, [currentProject?.creation_type, t]);

  // 加载项目数据
  useEffect(() => {
    if (projectId && (!currentProject || currentProject.id !== projectId)) {
      syncProject(projectId);
    }
  }, [projectId, currentProject, syncProject]);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && currentProject) {
      const oldIndex = currentProject.pages.findIndex((p) => p.id === active.id);
      const newIndex = currentProject.pages.findIndex((p) => p.id === over.id);

      const reorderedPages = arrayMove(currentProject.pages, oldIndex, newIndex);
      reorderPages(reorderedPages.map((p) => p.id).filter((id): id is string => id !== undefined));
    }
  };

  const handleGenerateOutline = async () => {
    if (!currentProject) return;

    const doGenerate = async (lockPageCount?: boolean) => {
      try {
        const result = await generateOutlineStream(lockPageCount);
        const { currentProject: updatedProject } = useProjectStore.getState();
        const pageCount = updatedProject?.pages.length ?? 0;
        if (result && (!result.complete || pageCount === 0)) {
          show({ message: t('outline.messages.generateIncomplete'), type: 'warning' });
        }
      } catch (error: any) {
        console.error('生成大纲失败:', error);
        const message = error.friendlyMessage || error.message || t('outline.messages.generateFailed');
        show({ message, type: 'error' });
      }
    };

    if (currentProject.pages.length > 0) {
      confirm(
        t('outline.messages.confirmRegenerate'),
        doGenerate,
        {
          title: t('outline.messages.confirmRegenerateTitle'),
          variant: 'warning',
          checkboxLabel: t('outline.messages.lockPageCount'),
          checkboxDefaultChecked: false
        }
      );
      return;
    }

    await doGenerate();
  };

  const handleAiRefineOutline = useCallback(async (requirement: string, previousRequirements: string[]) => {
    if (!currentProject || !projectId) return;

    try {
      const response = await refineOutline(projectId, requirement, previousRequirements);
      await syncProject(projectId);
      show({
        message: response.data?.message || t('outline.messages.refineSuccess'),
        type: 'success'
      });
    } catch (error: any) {
      console.error('修改大纲失败:', error);
      const errorMessage = error?.response?.data?.error?.message
        || error?.message
        || t('outline.messages.refineFailed');
      show({ message: errorMessage, type: 'error' });
      throw error;
    }
  }, [currentProject, projectId, syncProject, show]);

  // 导出大纲为 Markdown 文件
  const handleExportOutline = useCallback(() => {
    if (!currentProject) return;
    exportProjectToMarkdown(currentProject, { outline: true, description: false });
    show({ message: t('outline.messages.exportSuccess'), type: 'success' });
  }, [currentProject, show]);

  // 导入大纲 Markdown（追加新页面）
  const handleImportOutline = useCallback(async (text: string) => {
    if (!currentProject || !projectId) return;
    try {
      const parsed = parseMarkdownPages(text);
      if (parsed.length === 0) {
        show({ message: t('outline.messages.importEmpty'), type: 'error' });
        throw new Error('empty-import');
      }
      const startIndex = currentProject.pages.reduce((max, p) => Math.max(max, (p.order_index ?? 0) + 1), 0);
      await Promise.all(parsed.map(({ title, points, text: desc, part, extra_fields }, i) =>
        addPage(projectId, {
          outline_content: { title, points },
          description_content: desc ? { text: desc, ...(extra_fields ? { extra_fields } : {}) } : undefined,
          part,
          order_index: startIndex + i,
        })
      ));
      await syncProject(projectId);
      show({ message: t('outline.messages.importSuccess'), type: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'empty-import') {
        throw error;
      }
      show({ message: t('outline.messages.importFailed'), type: 'error' });
      throw error;
    }
  }, [currentProject, projectId, syncProject, show, t]);


  if (!currentProject) {
    return <Loading fullscreen message={t('outline.messages.loadingProject')} />;
  }

  if (isGlobalLoading && !isOutlineStreaming) {
    return <Loading fullscreen message={t('outline.messages.generatingOutline')} />;
  }

  return (
    <div data-testid="outline-editor-workspace" className="h-full min-h-0 overflow-hidden bg-gradient-to-b from-sky-50 via-white to-slate-50 dark:from-background-primary dark:via-background-primary dark:to-background-secondary flex flex-col">
      <header className="bg-white/90 dark:bg-background-secondary/95 backdrop-blur border-b border-sky-100 dark:border-border-primary px-4 md:px-7 py-2 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} />}
              onClick={() => navigate(fromHistory ? '/history' : '/app')}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">{t('common.back')}</span>
            </Button>
            <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="h-8 w-auto" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900 dark:text-foreground-primary">{t('outline.title')}</span>
                <span className="hidden sm:inline rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                  {t('outline.workflowStage')}
                </span>
              </div>
              <p className="hidden md:block text-xs text-slate-500 dark:text-foreground-tertiary">{t('outline.workflowHint')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Plus size={16} />} onClick={addNewPage}>
              {t('outline.addPage')}
            </Button>
            <Button variant="secondary" onClick={handleGenerateOutline} disabled={isOutlineStreaming}>
              {isOutlineStreaming
                ? t('outline.generating')
                : currentProject.pages.length === 0
                  ? currentProject.creation_type === 'outline' ? t('outline.parseOutline') : t('outline.autoGenerate')
                  : currentProject.creation_type === 'outline' ? t('outline.reParseOutline') : t('outline.reGenerate')}
            </Button>
            <div className="relative" ref={fileMenuRef}>
              <Button
                variant="secondary"
                onClick={() => setFileMenuOpen(!fileMenuOpen)}
                icon={<FileText size={16} />}
              >
                {t('outline.importExport')}
                <ChevronDown size={14} className={`ml-1 transition-transform duration-200 ${fileMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
              {fileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-36 rounded-xl border border-sky-100 dark:border-border-primary bg-white dark:bg-background-secondary shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { handleExportOutline(); setFileMenuOpen(false); }}
                    disabled={currentProject.pages.length === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-foreground-tertiary hover:bg-sky-50 dark:hover:bg-background-hover disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download size={14} />
                    {t('outline.export')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsImportModalOpen(true); setFileMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-foreground-tertiary hover:bg-sky-50 dark:hover:bg-background-hover"
                  >
                    <Upload size={14} />
                    {t('outline.import')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <AiRefineInput
            title=""
            placeholder={t('outline.aiPlaceholder')}
            onSubmit={handleAiRefineOutline}
            disabled={false}
            className="!p-0 !bg-transparent !border-0"
            onStatusChange={setIsAiRefining}
          />
        </div>
      </header>

      <main data-testid="outline-editor-scroll-region" className="flex-1 min-h-0 overflow-y-auto p-3 pb-24 md:p-4 md:pb-24">
        {currentProject.pages.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              aria-expanded={isContextExpanded}
              onClick={() => setIsContextExpanded((expanded) => !expanded)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-sky-100 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-sky-50 dark:border-border-primary dark:bg-background-secondary dark:text-foreground-secondary dark:hover:bg-background-hover"
            >
              {isContextExpanded ? t('outline.collapseContext') : t('outline.expandContext')}
              <ChevronDown size={15} className={isContextExpanded ? 'rotate-180' : ''} />
            </button>
          </div>
        )}
        {(currentProject.pages.length === 0 || isContextExpanded) && (
        <section data-testid="outline-context-fields" className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-background-secondary rounded-lg shadow-sm dark:shadow-none border border-sky-100 dark:border-border-primary overflow-hidden">
            <div className="h-12 px-5 flex items-center gap-2 border-b border-slate-100 dark:border-border-secondary">
              {currentProject.creation_type === 'idea'
                ? <Sparkle size={18} className="text-sky-500" />
                : <FileText size={18} className="text-sky-500" />}
              <h2 className="font-bold text-slate-800 dark:text-foreground-primary">{inputLabel}</h2>
            </div>
            <MarkdownTextarea
              ref={desktopTextareaRef}
              value={inputText}
              onChange={handleInputChange}
              onBlur={handleSaveInputText}
              onPaste={handleImagePaste}
              onFiles={handleImageFiles}
              onSelectFromLibrary={() => { setActiveMaterialTarget('input'); setIsMaterialSelectorOpen(true); }}
              placeholder={inputPlaceholder}
              rows={4}
              editorHeight={190}
              className="border-0 rounded-none shadow-none min-h-[96px]"
            />
          </div>

          <div className="bg-white dark:bg-background-secondary rounded-lg shadow-sm dark:shadow-none border border-sky-100 dark:border-border-primary overflow-hidden">
            <div className="h-12 px-5 flex items-center gap-2 border-b border-slate-100 dark:border-border-secondary">
              <SlidersHorizontal size={18} className="text-sky-500" />
              <h2 className="font-bold text-slate-800 dark:text-foreground-primary">{t('outline.outlineRequirements')}</h2>
            </div>
            <div data-testid="outline-requirements-textarea">
              <MarkdownTextarea
                ref={reqTextareaRef}
                value={outlineRequirements}
                onChange={(val) => { setOutlineRequirements(val); setIsRequirementsDirty(true); }}
                onPaste={handleReqImagePaste}
                onFiles={handleReqImageFiles}
                onSelectFromLibrary={() => { setActiveMaterialTarget('requirements'); setIsMaterialSelectorOpen(true); }}
                placeholder={t('outline.outlineRequirementsPlaceholder')}
                rows={4}
                editorHeight={190}
                showImagePreview={false}
                className="border-0 rounded-none shadow-none min-h-[96px]"
              />
            </div>
            <div className="px-5 pb-4">
              <PresetCapsules
                type="outline"
                onAppend={(text) => {
                  setOutlineRequirements((prev) => prev ? `${prev}\n${text}` : text);
                  setIsRequirementsDirty(true);
                }}
              />
            </div>
          </div>
        </section>
        )}

        <ReferenceFileList
          projectId={projectId}
          onFileClick={setPreviewFileId}
          className="mt-4"
          showToast={show}
        />

        <section className="mt-3 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <aside className="bg-white dark:bg-background-secondary rounded-lg shadow-sm border border-sky-100 dark:border-border-primary p-3 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-210px)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-slate-700 dark:text-foreground-primary">
                  <List size={17} className="text-sky-500" />
                  {t('outline.pageNavigation')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{t('outline.pageNavigationHint')}</p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                {t('outline.pageCount', { count: String(currentProject.pages.length) })}
              </span>
            </div>
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
              {currentProject.pages.map((page, index) => {
                const selected = selectedPageId === page.id;
                const navTitle = page.part || page.outline_content?.title || t('outline.titleLabel');
                const navSubtitle = page.part ? page.outline_content?.title : page.outline_content?.points?.[0];
                return (
                  <button
                    key={page.id || `nav-${index}`}
                    type="button"
                    data-testid="outline-page-navigation-item"
                    onClick={() => {
                      setSelectedPageId(page.id || null);
                      document.getElementById(`outline-page-${page.id || index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className={`h-20 w-full overflow-hidden text-left rounded-lg border px-3 py-2 transition-all ${
                      selected
                        ? 'border-sky-300 bg-sky-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-sky-200 hover:bg-sky-50/60 dark:border-border-primary dark:bg-background-secondary dark:hover:bg-background-hover'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-400">{t('outline.page', { num: index + 1 })}</span>
                    <span className="block mt-0.5 text-sm font-bold text-slate-700 dark:text-foreground-primary line-clamp-1">{navTitle}</span>
                    <span className="block text-xs text-slate-500 dark:text-foreground-tertiary line-clamp-1">{navSubtitle || t('outline.keyPoints')}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
          {currentProject.pages.length === 0 && !isOutlineStreaming ? (
            <div className="text-center py-12 md:py-20 bg-white dark:bg-background-secondary rounded-2xl border border-sky-100 dark:border-border-primary shadow-sm">
              <div className="flex justify-center mb-4">
                <FileText size={48} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground-primary mb-2">
                {t('outline.noPages')}
              </h3>
              <p className="text-gray-500 dark:text-foreground-tertiary mb-6">
                {t('outline.noPagesHint')}
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={currentProject.pages.map((p, idx) => p.id || `page-${idx}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4 md:space-y-5">
                  {currentProject.pages.map((page, index) => (
                    <div
                      key={page.id || `page-${index}`}
                      id={`outline-page-${page.id || index}`}
                      className={isOutlineStreaming ? 'animate-slide-in-up' : ''}
                      style={isOutlineStreaming ? { animationDelay: `${index * 60}ms` } : undefined}
                    >
                      <SortableCard
                        page={page}
                        index={index}
                        projectId={projectId}
                        showToast={show}
                        onUpdate={(data) => page.id && updatePageLocal(page.id, data)}
                        onDelete={() => page.id && deletePageById(page.id)}
                        onClick={() => setSelectedPageId(page.id || null)}
                        isSelected={selectedPageId === page.id}
                        isAiRefining={isAiRefining}
                      />
                    </div>
                  ))}
                  {skeletonVisible && (
                    <div
                      className="transition-opacity duration-1000"
                      style={{ opacity: skeletonFading ? 0 : 1 }}
                    >
                      <div className="animate-pulse">
                        <div className="bg-white dark:bg-background-secondary rounded-xl shadow-sm border border-gray-100 dark:border-border-primary p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded mt-1" />
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                              <div className="h-4 w-16 bg-cyan-100 dark:bg-cyan-900/30 rounded" />
                            </div>
                            <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
                            <div className="space-y-2">
                              <div className="h-3.5 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                              <div className="h-3.5 w-4/5 bg-gray-100 dark:bg-gray-800 rounded" />
                              <div className="h-3.5 w-3/5 bg-gray-100 dark:bg-gray-800 rounded" />
                            </div>
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
          </div>
        </section>
      </main>
      <footer data-testid="outline-editor-footer" className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2">
        <div data-testid="outline-editor-footer-bar" className="pointer-events-auto flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-sky-100/80 bg-white/95 px-3 py-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-border-primary dark:bg-background-secondary/95 dark:shadow-none">
          <Button
            variant="secondary"
            icon={<ArrowLeft size={16} />}
            onClick={() => navigate(fromHistory ? '/history' : '/app')}
          >
            {t('common.previous')}
          </Button>
          <Button
            variant="primary"
            icon={<ArrowRight size={16} />}
            onClick={async () => {
              if (isInputDirty && projectId && currentProject) {
                const field = currentProject.creation_type === 'outline'
                  ? 'outline_text'
                  : currentProject.creation_type === 'descriptions'
                    ? 'description_text'
                    : 'idea_prompt';
                try {
                  await updateProject(projectId, { [field]: inputText } as any);
                } catch (e) {
                  console.error('自动保存失败:', e);
                }
              }
              await saveAllPages();
              navigate(`/project/${projectId}/detail`);
            }}
          >
            {t('common.next')}
          </Button>
        </div>
      </footer>
      {ConfirmDialog}
      <ToastContainer />
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      <ImportMarkdownModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportOutline}
        title={t('outline.importModalTitle')}
        description={t('outline.importModalDesc')}
        pasteLabel={t('outline.importPasteLabel')}
        pastePlaceholder={t('outline.importPastePlaceholder')}
        uploadLabel={t('outline.importUploadLabel')}
        uploadHint={t('outline.importUploadHint')}
        uploadFormatsHint={t('outline.importUploadFormatsHint')}
        importButtonLabel={t('outline.importConfirm')}
        cancelButtonLabel={t('outline.importCancel')}
        emptyError={t('outline.messages.importContentEmpty')}
        readFileError={t('outline.messages.importReadFailed')}
      />
      <MaterialSelector
        projectId={projectId}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={activeMaterialTarget === 'input' ? handleInputMaterialSelect : handleReqMaterialSelect}
        multiple
      />
    </div>
  );
};
