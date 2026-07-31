import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  Eraser,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Maximize2,
  Minimize2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { useT } from '@/hooks/useT';
import { Textarea } from './Textarea';
import { Button } from './Button';
import { useToast } from './Toast';
import { MaterialSelector, materialUrlToFile } from './MaterialSelector';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { useProjectStore } from '@/store/useProjectStore';
import { Skeleton } from './Loading';
import {
  getTaskStatus,
  processMaterialImage,
  type Material,
  type MaterialProcessOperation,
  type MaterialSelectionRect,
} from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import type { Task } from '@/types';

const materialGeneratorI18n = {
  zh: {
    material: {
      title: '素材工具箱',
      saveToLibraryNote: '所有处理结果都会作为新素材保存到素材库，原图不会被覆盖。',
      generatedResult: '处理结果',
      generatedPreview: '处理结果会展示在这里',
      sourceImage: '处理目标图',
      sourceImageHint: '整图编辑、框选编辑、智能擦除都需要先选择一张目标图。',
      referenceImages: '参考图片（可选）',
      mainReference: '主参考图',
      extraReference: '额外参考图',
      clickToUpload: '点击上传',
      selectFromLibrary: '从素材库选择',
      promptLabel: '编辑指令',
      promptPlaceholderGenerate: '例如：蓝紫色渐变背景，带几何图形和科技感线条，用于科技主题标题页...',
      promptPlaceholderEdit: '例如：把主视觉改成银色金属质感，整体更高级，保留主体构图...',
      promptPlaceholderRegion: '例如：把选区里的按钮改成玻璃拟态风格，并补上高光细节...',
      promptPlaceholderErase: '可选：补充擦除后的背景要求，例如“补成纯白台面纹理”',
      aspectRatioLabel: '生成比例',
      toolModeLabel: '工具模式',
      toolGenerate: '生成新素材',
      toolEditFull: '整图编辑',
      toolRegionEdit: '框选编辑',
      toolEraseRegion: '智能擦除',
      runTool: '执行工具',
      toolGenerateDesc: '从文本或参考图生成新图',
      toolEditFullDesc: '基于现有图整体重绘',
      toolRegionEditDesc: '只聚焦选区进行修改',
      toolEraseRegionDesc: '擦掉选区内容并补背景',
      selectionLabel: '选区',
      selectionHint: '打开选区模式后，在图片上拖拽框选要处理的区域。',
      selectionReady: '已选择 {{width}} × {{height}} px 区域',
      selectionEmpty: '尚未选择区域',
      startSelection: '开始框选',
      stopSelection: '结束框选',
      applyModeLabel: '区域结果应用方式',
      applyOverlay: '只把选区覆盖回原图',
      applyReplaceFull: '直接用整张结果覆盖',
      useResultAsSource: '将结果作为新源图继续处理',
      clearResult: '清空结果',
      enterFullscreen: '全屏展开',
      exitFullscreen: '退出全屏',
      messages: {
        enterPrompt: '请输入编辑指令',
        chooseSource: '请先选择一张处理目标图',
        chooseSelection: '请先框选要处理的区域',
        materialAdded: '已添加 {{count}} 个素材',
        sourceLoaded: '已载入源图',
        generateSuccess: '素材处理成功，已保存到历史素材库',
        generateSuccessGlobal: '素材处理成功，已保存到全局素材库',
        generateComplete: '处理完成，但未找到结果图片地址',
        generateFailed: '素材处理失败',
        generateTimeout: '处理超时，请稍后到素材库查看',
        pollingFailed: '轮询任务状态失败，请稍后到素材库查看',
        noTaskId: '素材处理失败：未返回任务ID',
        loadMaterialFailed: '加载素材失败',
        resultPromoted: '已将结果设为新的源图',
      },
    },
  },
  en: {
    material: {
      title: 'Material Toolbox',
      saveToLibraryNote: 'Every processed result is saved as a new material. The original image stays untouched.',
      generatedResult: 'Result',
      generatedPreview: 'Processed output will appear here',
      sourceImage: 'Source Image',
      sourceImageHint: 'Full-image edit, region edit, and smart erase all need a source image first.',
      referenceImages: 'Reference Images (Optional)',
      mainReference: 'Primary Reference',
      extraReference: 'Extra References',
      clickToUpload: 'Click to upload',
      selectFromLibrary: 'Select from Library',
      promptLabel: 'Instruction',
      promptPlaceholderGenerate: 'e.g. Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...',
      promptPlaceholderEdit: 'e.g. Restyle the image with brushed silver metal details while keeping the main composition...',
      promptPlaceholderRegion: 'e.g. Turn the selected button into glassmorphism with subtle highlights...',
      promptPlaceholderErase: 'Optional: describe what should fill the erased region, such as "clean white tabletop texture"',
      aspectRatioLabel: 'Aspect Ratio',
      toolModeLabel: 'Tool Mode',
      toolGenerate: 'Generate',
      toolEditFull: 'Full Edit',
      toolRegionEdit: 'Region Edit',
      toolEraseRegion: 'Smart Erase',
      runTool: 'Run Tool',
      toolGenerateDesc: 'Create a new material from prompt or refs',
      toolEditFullDesc: 'Restyle the whole source image',
      toolRegionEditDesc: 'Focus edits on the selected region',
      toolEraseRegionDesc: 'Remove selected content and heal the background',
      selectionLabel: 'Selection',
      selectionHint: 'Turn on selection mode, then drag on the image to choose the target region.',
      selectionReady: 'Selected {{width}} × {{height}} px area',
      selectionEmpty: 'No selection yet',
      startSelection: 'Start Selection',
      stopSelection: 'End Selection',
      applyModeLabel: 'How to apply the region result',
      applyOverlay: 'Overlay only the selected region',
      applyReplaceFull: 'Replace with the full generated image',
      useResultAsSource: 'Use result as new source',
      clearResult: 'Clear Result',
      enterFullscreen: 'Expand Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      messages: {
        enterPrompt: 'Please enter an instruction',
        chooseSource: 'Please choose a source image first',
        chooseSelection: 'Please select a region first',
        materialAdded: 'Added {{count}} material(s)',
        sourceLoaded: 'Source image loaded',
        generateSuccess: 'Material processed successfully and saved to the project library',
        generateSuccessGlobal: 'Material processed successfully and saved to the global library',
        generateComplete: 'Processing finished, but no result image URL was returned',
        generateFailed: 'Failed to process material',
        generateTimeout: 'Processing timed out. Please check the material library later',
        pollingFailed: 'Failed to poll task status. Please check the material library later',
        noTaskId: 'Processing failed: no task ID returned',
        loadMaterialFailed: 'Failed to load materials',
        resultPromoted: 'Result is now the new source image',
      },
    },
  },
};

interface MaterialGeneratorModalProps {
  projectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type SelectorTarget = 'source' | 'references';
type DisplayRect = { left: number; top: number; width: number; height: number };
type PersistedMaterialRun = {
  taskId: string | null;
  previewUrl: string | null;
  status: 'idle' | 'pending' | 'completed' | 'failed';
  updatedAt: number;
};
type ToolCard = {
  value: MaterialProcessOperation;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
};

function getRenderedImageRect(img: HTMLImageElement) {
  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;
  const scale = Math.min(img.clientWidth / naturalWidth, img.clientHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = (img.clientWidth - width) / 2;
  const top = (img.clientHeight - height) / 2;
  return { left, top, width, height, naturalWidth, naturalHeight };
}

const TOOL_CARDS: ToolCard[] = [
  { value: 'generate', icon: <Sparkles size={16} />, labelKey: 'material.toolGenerate', descKey: 'material.toolGenerateDesc' },
  { value: 'edit_full', icon: <Wand2 size={16} />, labelKey: 'material.toolEditFull', descKey: 'material.toolEditFullDesc' },
  { value: 'region_edit', icon: <Crop size={16} />, labelKey: 'material.toolRegionEdit', descKey: 'material.toolRegionEditDesc' },
  { value: 'erase_region', icon: <Eraser size={16} />, labelKey: 'material.toolEraseRegion', descKey: 'material.toolEraseRegionDesc' },
];

const MATERIAL_POLL_INTERVAL_MS = 2000;
const MATERIAL_MAX_POLL_ATTEMPTS = 90;

function getMaterialRunStorageKey(projectId?: string | null) {
  return `banana-material-toolbox:${projectId || 'global'}`;
}

export const MaterialGeneratorModal: React.FC<MaterialGeneratorModalProps> = ({
  projectId,
  isOpen,
  onClose,
}) => {
  const t = useT(materialGeneratorI18n);
  const { show } = useToast();
  const currentProject = useProjectStore((s) => s.currentProject);

  const [toolMode, setToolMode] = useState<MaterialProcessOperation>('generate');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [applyMode, setApplyMode] = useState<'overlay_selection' | 'replace_full'>('overlay_selection');
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [refImage, setRefImage] = useState<File | null>(null);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [extraImageUrls, setExtraImageUrls] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<SelectorTarget>('references');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<DisplayRect | null>(null);
  const [selectionPixels, setSelectionPixels] = useState<MaterialSelectionRect | null>(null);

  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const extraInputRef = useRef<HTMLInputElement | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSelectingRegionRef = useRef(false);

  const persistRunState = (next: Partial<PersistedMaterialRun>) => {
    const key = getMaterialRunStorageKey(projectId);
    const current: PersistedMaterialRun = (() => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) {
          return { taskId: null, previewUrl: null, status: 'idle', updatedAt: Date.now() };
        }
        return JSON.parse(raw);
      } catch {
        return { taskId: null, previewUrl: null, status: 'idle', updatedAt: Date.now() };
      }
    })();

    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        ...next,
        updatedAt: Date.now(),
      } satisfies PersistedMaterialRun)
    );
  };

  const readPersistedRunState = (): PersistedMaterialRun | null => {
    try {
      const raw = sessionStorage.getItem(getMaterialRunStorageKey(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      const projectAspectRatio =
        (projectId && currentProject?.id === projectId && currentProject.image_aspect_ratio) || '16:9';
      setAspectRatio(projectAspectRatio);
      setApplyMode('overlay_selection');
    }
  }, [isOpen, projectId, currentProject]);

  useEffect(() => {
    const nextUrl = sourceImage ? URL.createObjectURL(sourceImage) : null;
    setSourceImageUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [sourceImage]);

  useEffect(() => {
    const nextUrl = refImage ? URL.createObjectURL(refImage) : null;
    setRefImageUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [refImage]);

  useEffect(() => {
    const nextUrls = extraImages.map((file) => URL.createObjectURL(file));
    setExtraImageUrls(nextUrls);
    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [extraImages]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (toolMode === 'generate') {
      setIsSelectionMode(false);
      setSelectionStart(null);
      setSelectionRect(null);
      setSelectionPixels(null);
    }
  }, [toolMode]);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const persisted = readPersistedRunState();
    if (!persisted) return;

    if (persisted.previewUrl) {
      setPreviewUrl(persisted.previewUrl);
      setIsCompleted(persisted.status === 'completed');
    }

    if (persisted.taskId && persisted.status === 'pending') {
      setIsGenerating(true);
      void pollMaterialTask(persisted.taskId);
    }
  }, [isOpen, projectId]);

  const handleSourceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setSourceImage(file);
    setSelectionRect(null);
    setSelectionPixels(null);
    setSelectionStart(null);
    setIsSelectionMode(false);
    if (isCompleted) setIsCompleted(false);
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setRefImage(file);
    if (isCompleted) setIsCompleted(false);
  };

  const handleExtraImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setExtraImages((prev) => [...prev, ...files]);
    if (isCompleted) setIsCompleted(false);
  };

  const removeExtraImage = (index: number) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenMaterialSelector = (target: SelectorTarget) => {
    setSelectorTarget(target);
    setIsMaterialSelectorOpen(true);
  };

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      const files = await Promise.all(materials.map((material) => materialUrlToFile(material)));
      if (files.length === 0) return;

      if (selectorTarget === 'source') {
        setSourceImage(files[0]);
        setSelectionRect(null);
        setSelectionPixels(null);
        setSelectionStart(null);
        setIsSelectionMode(false);
        show({ message: t('material.messages.sourceLoaded'), type: 'success' });
        return;
      }

      if (!refImage) {
        const [first, ...rest] = files;
        setRefImage(first);
        if (rest.length > 0) {
          setExtraImages((prev) => [...prev, ...rest]);
        }
      } else {
        setExtraImages((prev) => [...prev, ...files]);
      }
      show({ message: t('material.messages.materialAdded', { count: files.length }), type: 'success' });
    } catch (error: any) {
      console.error('Failed to load materials:', error);
      show({
        message: `${t('material.messages.loadMaterialFailed')}: ${error.message || t('common.unknownError')}`,
        type: 'error',
      });
    }
  };

  const pollMaterialTask = async (taskId: string) => {
    const targetProjectId = projectId || 'global';
    let attempts = 0;
    stopPolling();

    const poll = async () => {
      try {
        attempts += 1;
        const response = await getTaskStatus(targetProjectId, taskId);
        const task = response.data as Task | undefined;
        if (!task) throw new Error(t('material.messages.generateFailed'));

        if (task.status === 'COMPLETED') {
          const progress = task.progress as { image_url?: string } | undefined;
          const imageUrl = progress?.image_url;
          if (imageUrl) {
            const nextPreviewUrl = getImageUrl(imageUrl);
            setPreviewUrl(nextPreviewUrl);
            const message = projectId
              ? t('material.messages.generateSuccess')
              : t('material.messages.generateSuccessGlobal');
            show({ message, type: 'success' });
            setIsCompleted(true);
            persistRunState({ taskId, previewUrl: nextPreviewUrl, status: 'completed' });
          } else {
            show({ message: t('material.messages.generateComplete'), type: 'error' });
            persistRunState({ taskId, status: 'failed' });
          }
          setIsGenerating(false);
          return;
        } else if (task.status === 'FAILED') {
          show({
            message: task.error_message || t('material.messages.generateFailed'),
            type: 'error',
          });
          setIsGenerating(false);
          persistRunState({ taskId, status: 'failed' });
          return;
        } else if (attempts >= MATERIAL_MAX_POLL_ATTEMPTS) {
          show({ message: t('material.messages.generateTimeout'), type: 'warning' });
          setIsGenerating(false);
          persistRunState({ taskId, status: 'pending' });
          return;
        }
      } catch (error) {
        console.error('Failed to poll task status:', error);
        if (attempts >= MATERIAL_MAX_POLL_ATTEMPTS) {
          show({ message: t('material.messages.pollingFailed'), type: 'error' });
          setIsGenerating(false);
          persistRunState({ taskId, status: 'pending' });
          return;
        }
      }
      pollingIntervalRef.current = setTimeout(poll, MATERIAL_POLL_INTERVAL_MS);
    };

    await poll();
  };

  const handleUseResultAsSource = async () => {
    if (!previewUrl) return;
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const nextSource = new File([blob], `material-result.${ext}`, { type: blob.type || 'image/png' });
      setSourceImage(nextSource);
      setToolMode('edit_full');
      setSelectionRect(null);
      setSelectionPixels(null);
      setIsSelectionMode(false);
      show({ message: t('material.messages.resultPromoted'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to load result as source:', error);
      show({ message: t('material.messages.loadMaterialFailed'), type: 'error' });
    }
  };

  const buildSelectionPayload = () => {
    if (!selectionPixels) return null;
    return selectionPixels;
  };

  const validateBeforeSubmit = () => {
    if (toolMode !== 'erase_region' && !prompt.trim()) {
      show({ message: t('material.messages.enterPrompt'), type: 'error' });
      return false;
    }

    if (toolMode !== 'generate' && !sourceImage) {
      show({ message: t('material.messages.chooseSource'), type: 'error' });
      return false;
    }

    if ((toolMode === 'region_edit' || toolMode === 'erase_region') && !selectionPixels) {
      show({ message: t('material.messages.chooseSelection'), type: 'error' });
      return false;
    }

    return true;
  };

  const handleGenerate = async () => {
    if (!validateBeforeSubmit()) return;

    setIsGenerating(true);
    setIsCompleted(false);
    try {
      const targetProjectId = projectId || 'none';
      const resp = await processMaterialImage(targetProjectId, {
        operation: toolMode,
        prompt: prompt.trim(),
        sourceImage,
        refImage,
        extraImages,
        aspectRatio,
        selection: buildSelectionPayload(),
        applyMode,
      });
      const taskId = resp.data?.task_id;
      if (taskId) {
        persistRunState({ taskId, status: 'pending' });
        await pollMaterialTask(taskId);
      } else {
        show({ message: t('material.messages.noTaskId'), type: 'error' });
        setIsGenerating(false);
        persistRunState({ taskId: null, status: 'failed' });
      }
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.generateFailed'),
        type: 'error',
      });
      setIsGenerating(false);
      persistRunState({ taskId: null, status: 'failed' });
    }
  };

  const handleClose = () => {
    onClose();
  };

  const updateSelectionFromPointer = (clientX: number, clientY: number) => {
    const img = sourceImageRef.current;
    if (!img || !selectionStart) return;

    const containerRect = img.getBoundingClientRect();
    const rendered = getRenderedImageRect(img);

    const currentX = Math.min(
      Math.max(clientX - containerRect.left, rendered.left),
      rendered.left + rendered.width
    );
    const currentY = Math.min(
      Math.max(clientY - containerRect.top, rendered.top),
      rendered.top + rendered.height
    );

    const left = Math.min(selectionStart.x, currentX);
    const top = Math.min(selectionStart.y, currentY);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const finalizeSelection = () => {
    const img = sourceImageRef.current;
    if (!img || !selectionRect) {
      isSelectingRegionRef.current = false;
      setSelectionStart(null);
      return;
    }

    const rendered = getRenderedImageRect(img);
    const x = Math.round(((selectionRect.left - rendered.left) / rendered.width) * rendered.naturalWidth);
    const y = Math.round(((selectionRect.top - rendered.top) / rendered.height) * rendered.naturalHeight);
    const width = Math.round((selectionRect.width / rendered.width) * rendered.naturalWidth);
    const height = Math.round((selectionRect.height / rendered.height) * rendered.naturalHeight);

    if (width > 2 && height > 2) {
      setSelectionPixels({
        x,
        y,
        width,
        height,
        image_width: rendered.naturalWidth,
        image_height: rendered.naturalHeight,
      });
    } else {
      setSelectionRect(null);
      setSelectionPixels(null);
    }

    isSelectingRegionRef.current = false;
    setSelectionStart(null);
  };

  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectionMode || !sourceImageRef.current) return;

    const img = sourceImageRef.current;
    const containerRect = img.getBoundingClientRect();
    const rendered = getRenderedImageRect(img);

    const x = Math.min(
      Math.max(e.clientX - containerRect.left, rendered.left),
      rendered.left + rendered.width
    );
    const y = Math.min(
      Math.max(e.clientY - containerRect.top, rendered.top),
      rendered.top + rendered.height
    );

    isSelectingRegionRef.current = true;
    setSelectionStart({ x, y });
    setSelectionRect({ left: x, top: y, width: 0, height: 0 });
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectionMode || !isSelectingRegionRef.current || !selectionStart) return;
    updateSelectionFromPointer(e.clientX, e.clientY);
  };

  const handleSelectionMouseUp = () => {
    if (!isSelectionMode || !isSelectingRegionRef.current) return;
    finalizeSelection();
  };

  const currentPromptPlaceholder =
    toolMode === 'generate'
      ? t('material.promptPlaceholderGenerate')
      : toolMode === 'edit_full'
      ? t('material.promptPlaceholderEdit')
      : toolMode === 'region_edit'
      ? t('material.promptPlaceholderRegion')
      : t('material.promptPlaceholderErase');

  const selectionEnabled = toolMode === 'region_edit' || toolMode === 'erase_region';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('material.title')}
      size={isFullscreen ? 'full' : 'wide'}
      headerActions={(
        <button
          type="button"
          data-testid="material-fullscreen-toggle"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
          aria-label={isFullscreen ? t('material.exitFullscreen') : t('material.enterFullscreen')}
          title={isFullscreen ? t('material.exitFullscreen') : t('material.enterFullscreen')}
        >
          {isFullscreen ? <Minimize2 size={17} strokeWidth={2} /> : <Maximize2 size={17} strokeWidth={2} />}
        </button>
      )}
    >
      <div className={`grid gap-6 ${isFullscreen ? 'xl:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <aside className="space-y-5 rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow-card)] lg:pr-6">
          <section className="space-y-2">
            <div className="text-sm font-medium text-[var(--app-text)]">
              {t('material.toolModeLabel')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TOOL_CARDS.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  onClick={() => {
                    setToolMode(tool.value);
                    if (isCompleted) setIsCompleted(false);
                  }}
                  title={t(tool.descKey)}
                  className={`rounded-[var(--app-radius-control)] border px-2.5 py-2 text-left transition-colors ${
                    toolMode === tool.value
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)] shadow-[var(--app-shadow-control)]'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-text)]">
                    <span className={toolMode === tool.value ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-tertiary)]'}>
                      {tool.icon}
                    </span>
                    {t(tool.labelKey)}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <Textarea
            label={t('material.promptLabel')}
            placeholder={currentPromptPlaceholder}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (isCompleted) setIsCompleted(false);
            }}
            rows={5}
          />

          {toolMode === 'generate' && (
            <section className="space-y-2">
              <div className="text-sm font-medium text-[var(--app-text)]">{t('material.aspectRatioLabel')}</div>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setAspectRatio(opt.value);
                      if (isCompleted) setIsCompleted(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      aspectRatio === opt.value
                        ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {toolMode === 'region_edit' && (
            <section className="space-y-2">
              <div className="text-sm font-medium text-[var(--app-text)]">{t('material.applyModeLabel')}</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setApplyMode('overlay_selection')}
                  className={`rounded-[var(--app-radius-control)] border px-3 py-2.5 text-left transition-colors ${
                    applyMode === 'overlay_selection'
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)]'
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--app-text)]">{t('material.applyOverlay')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('replace_full')}
                  className={`rounded-[var(--app-radius-control)] border px-3 py-2.5 text-left transition-colors ${
                    applyMode === 'replace_full'
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)]'
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--app-text)]">{t('material.applyReplaceFull')}</div>
                </button>
              </div>
            </section>
          )}

          <section className="space-y-3 border-t border-[var(--app-border)] pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-text)]">
                <ImagePlus size={17} className="text-[var(--app-accent)]" />
                <span>{t('material.referenceImages')}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderOpen size={16} />}
                onClick={() => handleOpenMaterialSelector('references')}
              />
            </div>

            <div className="flex flex-wrap gap-2 items-start">
              <div className="space-y-1.5">
                <div className="text-xs text-[var(--app-text-secondary)]">{t('material.mainReference')}</div>
                <div className="relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)] group">
                  {refImage ? (
                    <>
                      <img
                        src={refImageUrl || ''}
                        alt={t('material.mainReference')}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRefImage(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--app-error)] text-[var(--app-on-color)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-[var(--app-shadow-control)] z-10"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </>
                  ) : (
                    <button
                      data-testid="material-ref-trigger"
                      type="button"
                      onClick={() => refInputRef.current?.click()}
                      className="flex flex-col items-center gap-1"
                    >
                      <ImageIcon size={20} className="text-[var(--app-accent)] opacity-70" />
                      <span className="text-[10px] text-[var(--app-text-secondary)]">{t('material.clickToUpload')}</span>
                    </button>
                  )}
                  <input
                    ref={refInputRef}
                    data-testid="material-ref-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleRefImageChange}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="text-xs text-[var(--app-text-secondary)]">{t('material.extraReference')}</div>
                <div className="flex flex-wrap gap-2">
                  {extraImages.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="relative group">
                      <img
                        src={extraImageUrls[idx] || ''}
                        alt={`extra-${idx + 1}`}
                        className="h-14 w-14 rounded-[var(--app-radius-control)] border border-[var(--app-border)] object-cover shadow-[var(--app-shadow-card)]"
                      />
                      <button
                        onClick={() => removeExtraImage(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--app-error)] text-[var(--app-on-color)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-[var(--app-shadow-control)]"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  <button
                    data-testid="material-extra-trigger"
                    type="button"
                    onClick={() => extraInputRef.current?.click()}
                    className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)]"
                  >
                    <Upload size={14} className="text-[var(--app-accent)] opacity-70" />
                  </button>
                  <input
                    ref={extraInputRef}
                    data-testid="material-extra-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleExtraImagesChange}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose} disabled={isGenerating}>
              {t('common.close')}
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={isGenerating || isCompleted || (toolMode !== 'erase_region' && !prompt.trim())}
              className="shadow-[var(--app-shadow-soft)]"
            >
              {isGenerating ? t('common.generating') : isCompleted ? t('common.completed') : t('material.runTool')}
            </Button>
          </div>
        </aside>

        <section className="min-w-0 flex flex-col">
          <div className="grid grid-cols-2 gap-4 flex-1">
            <div className="flex flex-col rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow-card)]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <Layers size={16} className="text-[var(--app-accent)]" />
                  {t('material.sourceImage')}
                </h4>
                <div className="flex flex-shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm" icon={<FolderOpen size={16} />} onClick={() => handleOpenMaterialSelector('source')} />
                  <Button
                    data-testid="material-source-trigger"
                    variant="ghost"
                    size="sm"
                    icon={<Upload size={16} />}
                    onClick={() => sourceInputRef.current?.click()}
                  />
                  <input
                    ref={sourceInputRef}
                    data-testid="material-source-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSourceImageChange}
                  />
                </div>
              </div>

              <div
                data-testid="material-source-canvas"
                className="relative min-h-[200px] flex-1 overflow-hidden rounded-[var(--app-radius-panel)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)]"
                onMouseDown={handleSelectionMouseDown}
                onMouseMove={handleSelectionMouseMove}
                onMouseUp={handleSelectionMouseUp}
                onMouseLeave={handleSelectionMouseUp}
              >
                {sourceImageUrl ? (
                  <>
                    {selectionEnabled && (
                      <button
                        data-testid="material-selection-toggle"
                        type="button"
                        onClick={() => {
                          setIsSelectionMode((prev) => !prev);
                          isSelectingRegionRef.current = false;
                          setSelectionStart(null);
                        }}
                        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-[var(--app-radius-control)] bg-[var(--app-surface)]/90 px-3 py-1.5 text-xs font-medium text-[var(--app-accent)] shadow-[var(--app-shadow-floating)]"
                      >
                        <Crop size={13} />
                        {isSelectionMode ? t('material.stopSelection') : t('material.startSelection')}
                      </button>
                    )}
                    <img
                      ref={sourceImageRef}
                      src={sourceImageUrl}
                      alt={t('material.sourceImage')}
                      className="w-full h-full object-contain select-none"
                      draggable={false}
                    />
                    {selectionRect && (
                      <div
                        className="pointer-events-none absolute border-2 border-[var(--app-accent)] bg-[color:var(--app-accent-soft)]"
                        style={{
                          left: selectionRect.left,
                          top: selectionRect.top,
                          width: selectionRect.width,
                          height: selectionRect.height,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-[var(--app-text-tertiary)]">
                    <ImagePlus size={42} className="mb-3 text-[var(--app-accent)] opacity-70" />
                    <div className="text-sm font-medium">{t('material.sourceImage')}</div>
                    <div className="text-xs mt-1 max-w-xs">{t('material.sourceImageHint')}</div>
                  </div>
                )}
              </div>

              {selectionEnabled && (
                <div className="mt-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-3">
                  <div className="mb-1 text-xs font-semibold text-[var(--app-accent)]">
                    {t('material.selectionLabel')}
                  </div>
                  <div className="text-xs text-[var(--app-text-secondary)]">
                    {selectionPixels
                      ? t('material.selectionReady', { width: selectionPixels.width, height: selectionPixels.height })
                      : t('material.selectionHint')}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow-card)]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <Sparkles size={16} className="text-[var(--app-index-green)]" />
                  {t('material.generatedResult')}
                </h4>
                {previewUrl && (
                  <div className="flex flex-shrink-0 gap-1.5">
                    <Button variant="ghost" size="sm" onClick={handleUseResultAsSource} icon={<Layers size={16} />} title={t('material.useResultAsSource')} />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X size={16} />}
                      title={t('material.clearResult')}
                      onClick={() => {
                        setPreviewUrl(null);
                        setIsCompleted(false);
                        persistRunState({ previewUrl: null, status: 'idle', taskId: null });
                      }}
                    />
                  </div>
                )}
              </div>
              {isGenerating ? (
                <div className="min-h-[200px] flex-1 overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] shadow-inner">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : previewUrl ? (
                <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-inner">
                  <img
                    src={previewUrl}
                    alt={t('material.generatedResult')}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-[var(--app-radius-panel)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)] text-sm text-[var(--app-text-tertiary)]">
                  <ImageIcon size={48} className="mb-3 text-[var(--app-accent)] opacity-70" />
                  <div className="font-medium">{t('material.generatedPreview')}</div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--app-text-tertiary)]">
        {t('material.saveToLibraryNote')}
      </p>

      <MaterialSelector
        projectId={projectId || undefined}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterials}
        multiple={selectorTarget === 'references'}
        mediaKindFilter={['image']}
      />
    </Modal>
  );
};
