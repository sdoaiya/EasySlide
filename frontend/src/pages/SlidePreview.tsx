// TODO: split components
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useT } from '@/hooks/useT';
import { devLog } from '@/utils/logger';
import { getStaticAssetUrl } from '@/api/client';

// 组件内翻译
const previewI18n = {
  zh: {
    home: { title: 'EasySlide' },
    nav: { home: '首页', materialGenerate: '素材生成' },
    slidePreview: {
      pageGenerating: "该页面正在生成中，请稍候...", generationStarted: "已开始生成图片，请稍候...",
      versionSwitched: "已切换到该版本", outlineSaved: "大纲和描述已保存",
      materialsAdded: "已添加 {{count}} 个素材", exportStarted: "导出任务已开始，可在导出任务面板查看进度",
      cannotRefresh: "无法刷新：缺少项目ID", refreshSuccess: "刷新成功",
      extraRequirementsSaved: "额外要求已保存", styleDescSaved: "风格描述已保存",
      exportSettingsSaved: "导出设置已保存", aspectRatioSaved: "画面比例已保存", loadTemplateFailed: "加载模板失败", templateChanged: "模板更换成功",
      saveFailed: "保存失败: {{error}}", refreshFailed: "刷新失败，请稍后重试",
      loadMaterialFailed: "加载素材失败: {{error}}", templateChangeFailed: "更换模板失败: {{error}}",
      versionSwitchFailed: "切换失败: {{error}}", unknownError: "未知错误",
      regionCropSuccess: "已将选中区域添加为参考图片，可在下方\"上传图片\"中查看与删除",
      regionCropFailed: "无法从当前图片裁剪区域（浏览器安全限制）。可以尝试手动上传参考图片。"
    },
    preview: {
      title: "预览", workflowStage: "Step 3 · 视觉成稿", workflowHint: "生成图片、预览并导出交付", pageCount: "共 {{count}} 页", export: "导出", exportTasks: "导出任务",
      exportPptx: "导出为 PPTX", exportPdf: "导出为 PDF",
      exportEditablePptx: "导出可编辑 PPTX（Beta）", exportImages: "导出为图片",
      exportVideo: "导出为讲解视频",
      pptxExportTitle: "PPTX 导出设置",
      pptxExportSubtitle: "在导出前确认本次 PPTX 的播放设置。",
      pptxTransitionToggle: "启用页面切换动画",
      pptxTransitionDesc: "导出的 PPTX 会为每页设置切换效果；多选效果时，每页会随机使用其中一种。",
      pptxTransitionFade: "淡入淡出",
      pptxTransitionPageTurn: "翻页",
      pptxTransitionPush: "平移切换",
      pptxTransitionWipe: "擦除",
      pptxTransitionSplit: "分割",
      pptxTransitionBlinds: "百叶窗",
      pptxTransitionChecker: "棋盘",
      pptxTransitionWheel: "时钟",
      pptxTransitionRequired: "至少选择一种切换动画",
      pptxStartExport: "开始导出",
      pptxCancel: "取消",
      videoExportTitle: "讲解视频导出设置",
      videoExportSubtitle: "在最后一步统一配置旁白风格，适配路演、总结、发布会或学术报告等不同场景。",
      videoVoiceLabel: "语音音色",
      videoSpeedLabel: "语速",
      videoSpeedHint: "0.7 慢 — 1.0 默认 — 1.2 快",
      videoNarrationPresetTitle: "旁白策略",
      videoNarrationPersona: "演讲者人设",
      videoNarrationAudience: "目标受众",
      videoNarrationTone: "演讲基调",
      videoNarrationTopic: "核心主题",
      videoNarrationTopicPlaceholder: "例如：英伟达的发展史与技术演进",
      videoNarrationLength: "单页字数范围",
      videoNarrationAdvanced: "高级配置",
      videoNarrationCollapse: "收起高级配置",
      videoNarrationAdvancedHint: "这些参数只在导出前生效，不会影响页面内容本身。",
      videoAdvancedOpen: "高级设置",
      videoAdvancedCollapse: "收起高级设置",
      videoNarrationMinWords: "最少字数",
      videoNarrationMaxWords: "最多字数",
      videoNarrationSummaryLabel: "当前策略",
      videoDirectorPreset: "成片风格",
      videoDirectorBusiness: "商务汇报",
      videoDirectorTraining: "培训课程",
      videoDirectorLaunch: "产品发布",
      videoDirectorBrief: "简洁播报",
      videoNarrationGenerateMissing: "自动为缺失旁白的页面生成讲稿",
      videoEnableKenBurns: "启用画面动效",
      videoKenBurnsTip: "为每页幻灯片添加缓慢的缩放或平移动画，让视频画面更有节奏感",
      videoKenBurnsStyle: "镜头动效风格",
      videoKenBurnsStyleAuto: "自动交替",
      videoKenBurnsStyleZoom: "轻柔推近",
      videoKenBurnsStylePan: "横移浏览",
      videoIncludeNoImage: "包含未配图页面（生成占位帧）",
      videoMissingImagesWarning: "本次导出范围还有 {{count}} 页未生成图片。勾选“包含未配图页面”才会用占位帧导出，否则请先生成图片。",
      videoStartExport: "开始导出",
      videoCancel: "取消",
      editablePptxDialogTitle: "导出可编辑 PPTX",
      editablePptxDialogSubtitle: "选择本次导出的处理选项。",
      editablePptxRangeLabel: "导出范围",
      editablePptxRangeAll: "全部 {{count}} 页",
      editablePptxRangePages: "第 {{pages}} 页（共 {{count}} 页）",
      editablePptxRangeTip: "如果只想导出特定页面，请在左侧侧栏上方点「多选」勾选要导出的页面后再点击「导出」。",
      editablePptxStartExport: "开始导出",
      editablePptxCancel: "取消",
      exportSelectedPages: "将导出选中的 {{count}} 页",
      regenerate: "重新生成", regenerating: "生成中...",
      editMode: "编辑模式", viewMode: "查看模式", page: "第 {{num}} 页",
      projectSettings: "项目设置", changeTemplate: "更换模板", refresh: "刷新",
      batchGenerate: "开始生成 ({{count}})", generateSelected: "生成选中页面 ({{count}})",
      pauseGeneration: "暂停生成", resumeGeneration: "继续生成",
      batchGenerateTitle: "批量生成图片",
      generationProgress: "{{status}} {{completed}} / {{total}}",
      generationRunning: "正在生成", generationPaused: "已暂停",
      multiSelect: "多选", cancelMultiSelect: "取消多选", pagesUnit: "页",
      noPages: "还没有页面", noPageSelected: "未选择页面", noPagesHint: "请先返回编辑页面添加内容", backToEdit: "返回编辑",
      generating: "正在生成中...", queued: "排队等待生成...", notGenerated: "尚未生成图片", generateThisPage: "开始生成此页", retryThisPage: "重试此页",
      prevPage: "上一页", nextPage: "下一页", historyVersions: "历史版本",
      versions: "版本", version: "版本", current: "当前", editPage: "编辑页面",
      sceneReady: "元素动画已就绪", sceneBuilding: "正在准备元素动画", sceneDegraded: "元素动画已降级",
      sceneFailed: "元素动画失败", sceneMissing: "仅整页动效", sceneQuality: "质量",
      recoverScene: "恢复动画图层", recoveringScene: "正在恢复动画图层", sceneRecoveryQueued: "动画图层恢复任务已启动",
      regionSelect: "区域选图", endRegionSelect: "结束区域选图",
      pageOutline: "页面大纲（可编辑）", pageDescription: "页面描述（可编辑）",
      enterTitle: "输入页面标题", pointsPerLine: "要点（每行一个）",
      enterPointsPerLine: "每行输入一个要点", enterDescription: "输入页面的详细描述内容",
      selectContextImages: "选择上下文图片（可选）", useTemplateImage: "使用模板图片",
      imagesInDescription: "描述中的图片", uploadImages: "上传图片",
      selectFromMaterials: "从素材库选择", upload: "上传",
      editPromptLabel: "输入修改指令(将自动添加页面描述)",
      editPromptPlaceholder: "例如：将框选区域内的素材移除、把背景改成蓝色、增大标题字号、更改文本框样式为虚线...",
      saveOutlineOnly: "仅保存大纲/描述", generateImage: "开始生成",
      templateModalDesc: "选择一个新的模板将应用到后续PPT页面生成（不影响已经生成的页面）。你可以选择预设模板、已有模板或上传新模板。",
      useTextStyle: "使用文字描述风格",
      applyStyle: "应用风格",
      styleSaved: "风格描述已保存",
      uploadingTemplate: "正在上传模板...",
      resolution1KWarning: "1K分辨率警告",
      resolution1KWarningText: "当前使用 1K 分辨率 生成图片，可能导致渲染的文字乱码或模糊。",
      resolution1KWarningHint: "建议在「项目设置 → 全局设置」中切换到 2K 或 4K 分辨率以获得更清晰的效果。",
      dontShowAgain: "不再提示", generateAnyway: "仍然生成",
      confirmRegenerateSelected: "将重新生成选中的 {{count}} 页（历史记录将会保存），确定继续吗？",
      confirmRegenerateAll: "将重新生成所有页面（历史记录将会保存），确定继续吗？",
      confirmRegenerateTitle: "确认重新生成",
      generationFailed: "生成失败",
      disabledExportTip: "本次导出范围还有 {{count}} 页未生成图片，请先生成图片或调整选择范围",
      messages: {
        exportSuccess: "导出成功", exportFailed: "导出失败",
        regenerateSuccess: "重新生成完成", regenerateFailed: "重新生成失败",
        loadingProject: "加载项目中...", processing: "处理中...",
        generatingBackgrounds: "正在生成干净背景...", creatingPdf: "正在创建PDF...",
        parsingContent: "正在解析内容...", creatingPptx: "正在创建可编辑PPTX...", complete: "完成！"
      }
    },
    outline: {
      titleLabel: "标题",
      keyPoints: "要点"
    }
  },
  en: {
    home: { title: 'EasySlide' },
    nav: { home: 'Home', materialGenerate: 'Material Generation' },
    slidePreview: {
      pageGenerating: "This page is generating, please wait...", generationStarted: "Image generation started, please wait...",
      versionSwitched: "Switched to this version", outlineSaved: "Outline and description saved",
      materialsAdded: "Added {{count}} material(s)", exportStarted: "Export task started, check progress in export tasks panel",
      cannotRefresh: "Cannot refresh: Missing project ID", refreshSuccess: "Refresh successful",
      extraRequirementsSaved: "Extra requirements saved", styleDescSaved: "Style description saved",
      exportSettingsSaved: "Export settings saved", aspectRatioSaved: "Aspect ratio saved", loadTemplateFailed: "Failed to load template", templateChanged: "Template changed successfully",
      saveFailed: "Save failed: {{error}}", refreshFailed: "Refresh failed, please try again later",
      loadMaterialFailed: "Failed to load material: {{error}}", templateChangeFailed: "Failed to change template: {{error}}",
      versionSwitchFailed: "Switch failed: {{error}}", unknownError: "Unknown error",
      regionCropSuccess: "Selected region added as reference image. You can view and delete it in \"Upload Images\" below.",
      regionCropFailed: "Cannot crop from current image (browser security restriction). Try uploading a reference image manually."
    },
    preview: {
      title: "Preview", workflowStage: "Step 3 · Visual Delivery", workflowHint: "Generate images, preview, and export for handoff", pageCount: "{{count}} pages", export: "Export", exportTasks: "Export Tasks",
      exportPptx: "Export as PPTX", exportPdf: "Export as PDF",
      exportEditablePptx: "Export Editable PPTX (Beta)", exportImages: "Export as Images",
      exportVideo: "Export as Narration Video",
      pptxExportTitle: "PPTX Export Settings",
      pptxExportSubtitle: "Confirm playback settings before exporting this PPTX.",
      pptxTransitionToggle: "Enable slide transitions",
      pptxTransitionDesc: "The exported PPTX will add a transition to each slide. If multiple effects are selected, each slide uses one at random.",
      pptxTransitionFade: "Fade",
      pptxTransitionPageTurn: "Page turn",
      pptxTransitionPush: "Push",
      pptxTransitionWipe: "Wipe",
      pptxTransitionSplit: "Split",
      pptxTransitionBlinds: "Blinds",
      pptxTransitionChecker: "Checkerboard",
      pptxTransitionWheel: "Clock",
      pptxTransitionRequired: "Select at least one transition effect",
      pptxStartExport: "Start Export",
      pptxCancel: "Cancel",
      videoExportTitle: "Narration Video Export Settings",
      videoExportSubtitle: "Tune the narration strategy in the final export step for demos, annual recaps, launches, or academic talks.",
      videoVoiceLabel: "Voice",
      videoSpeedLabel: "Speech speed",
      videoSpeedHint: "0.7 slower — 1.0 default — 1.2 faster",
      videoNarrationPresetTitle: "Narration Strategy",
      videoNarrationPersona: "Speaker persona",
      videoNarrationAudience: "Target audience",
      videoNarrationTone: "Speech tone",
      videoNarrationTopic: "Core topic",
      videoNarrationTopicPlaceholder: "For example: the history and technological evolution of Nvidia",
      videoNarrationLength: "Words per slide",
      videoNarrationAdvanced: "Advanced settings",
      videoNarrationCollapse: "Hide advanced settings",
      videoNarrationAdvancedHint: "These options only affect narration generation during export.",
      videoAdvancedOpen: "Advanced settings",
      videoAdvancedCollapse: "Hide advanced settings",
      videoNarrationMinWords: "Min words",
      videoNarrationMaxWords: "Max words",
      videoNarrationSummaryLabel: "Current strategy",
      videoDirectorPreset: "Video style",
      videoDirectorBusiness: "Business",
      videoDirectorTraining: "Training",
      videoDirectorLaunch: "Product launch",
      videoDirectorBrief: "Brief update",
      videoNarrationGenerateMissing: "Auto-generate narration for slides that are missing it",
      videoEnableKenBurns: "Enable camera motion",
      videoKenBurnsTip: "Adds slow zoom or pan animation to each slide for a more dynamic video",
      videoKenBurnsStyle: "Camera motion style",
      videoKenBurnsStyleAuto: "Alternate automatically",
      videoKenBurnsStyleZoom: "Gentle zoom",
      videoKenBurnsStylePan: "Pan across",
      videoIncludeNoImage: "Include pages without images (placeholder frames)",
      videoMissingImagesWarning: "{{count}} page(s) in this export range still have no images. Enable \"Include pages without images\" to export placeholder frames, or generate images first.",
      videoStartExport: "Start Export",
      videoCancel: "Cancel",
      editablePptxDialogTitle: "Export Editable PPTX",
      editablePptxDialogSubtitle: "Choose processing options for this export.",
      editablePptxRangeLabel: "Export range",
      editablePptxRangeAll: "All {{count}} pages",
      editablePptxRangePages: "Pages {{pages}} ({{count}} total)",
      editablePptxRangeTip: "To export specific pages only, click \"Multi-select\" at the top of the left sidebar and check the pages first.",
      editablePptxStartExport: "Start Export",
      editablePptxCancel: "Cancel",
      exportSelectedPages: "Will export {{count}} selected page(s)",
      regenerate: "Regenerate", regenerating: "Generating...",
      editMode: "Edit Mode", viewMode: "View Mode", page: "Page {{num}}",
      projectSettings: "Project Settings", changeTemplate: "Change Template", refresh: "Refresh",
      batchGenerate: "Start Generation ({{count}})", generateSelected: "Generate Selected ({{count}})",
      pauseGeneration: "Pause Generation", resumeGeneration: "Resume Generation",
      batchGenerateTitle: "Batch generate images",
      generationProgress: "{{status}} {{completed}} / {{total}}",
      generationRunning: "Generating", generationPaused: "Paused",
      multiSelect: "Multi-select", cancelMultiSelect: "Cancel Multi-select", pagesUnit: " pages",
      noPages: "No pages yet", noPageSelected: "No page selected", noPagesHint: "Please go back to editor to add content first", backToEdit: "Back to Editor",
      generating: "Generating...", queued: "Queued for generation...", notGenerated: "Image not generated yet", generateThisPage: "Start This Page", retryThisPage: "Retry This Page",
      prevPage: "Previous", nextPage: "Next", historyVersions: "History Versions",
      versions: "Versions", version: "Version", current: "Current", editPage: "Edit Page",
      sceneReady: "Element animation ready", sceneBuilding: "Preparing element animation", sceneDegraded: "Element animation degraded",
      sceneFailed: "Element animation failed", sceneMissing: "Whole-slide motion only", sceneQuality: "Quality",
      recoverScene: "Recover animation layers", recoveringScene: "Recovering animation layers", sceneRecoveryQueued: "Animation-layer recovery started",
      regionSelect: "Region Select", endRegionSelect: "End Region Select",
      pageOutline: "Page Outline (Editable)", pageDescription: "Page Description (Editable)",
      enterTitle: "Enter page title", pointsPerLine: "Key Points (one per line)",
      enterPointsPerLine: "Enter one key point per line", enterDescription: "Enter detailed page description",
      selectContextImages: "Select Context Images (Optional)", useTemplateImage: "Use Template Image",
      imagesInDescription: "Images in Description", uploadImages: "Upload Images",
      selectFromMaterials: "Select from Materials", upload: "Upload",
      editPromptLabel: "Enter edit instructions (page description will be auto-added)",
      editPromptPlaceholder: "e.g., Remove elements in selected area, change background to blue, increase title font size, change text box style to dashed...",
      saveOutlineOnly: "Save Outline/Description Only", generateImage: "Start Generation",
      templateModalDesc: "Selecting a new template will apply to future PPT page generation (won't affect already generated pages). You can choose preset templates, existing templates, or upload a new one.",
      useTextStyle: "Use text description for style",
      applyStyle: "Apply Style",
      styleSaved: "Style description saved",
      uploadingTemplate: "Uploading template...",
      resolution1KWarning: "1K Resolution Warning",
      resolution1KWarningText: "Currently using 1K resolution for image generation, which may cause garbled or blurry text.",
      resolution1KWarningHint: "It's recommended to switch to 2K or 4K resolution in \"Project Settings → Global Settings\" for clearer results.",
      dontShowAgain: "Don't show again", generateAnyway: "Generate Anyway",
      confirmRegenerateSelected: "Will regenerate {{count}} selected page(s) (history will be saved). Continue?",
      confirmRegenerateAll: "Will regenerate all pages (history will be saved). Continue?",
      confirmRegenerateTitle: "Confirm Regenerate",
      generationFailed: "Generation failed",
      disabledExportTip: "{{count}} page(s) in this export range have no images yet. Generate images first or adjust the selection",
      messages: {
        exportSuccess: "Export successful", exportFailed: "Export failed",
        regenerateSuccess: "Regeneration complete", regenerateFailed: "Failed to regenerate",
        loadingProject: "Loading project...", processing: "Processing...",
        generatingBackgrounds: "Generating clean backgrounds...", creatingPdf: "Creating PDF...",
        parsingContent: "Parsing content...", creatingPptx: "Creating editable PPTX...", complete: "Complete!"
      }
    },
    outline: {
      titleLabel: "Title",
      keyPoints: "Key Points"
    }
  }
};
import {
  ArrowLeft,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ChevronUp,
  X,
  Upload,
  Image as ImageIcon,
  ImagePlus,
  Settings,
  CheckSquare,
  Square,
  Check,
  FileText,
  Film,
  Loader2, ChevronDown, PauseCircle,
  Info,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button, Loading, Modal, Textarea, useToast, useConfirm, MaterialSelector, ProjectSettingsModal, ExportTasksPanel, TextStyleSelector } from '@/components/shared';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { PptToVideoWizard } from '@/components/content-project/PptToVideoWizard';
import { useContentProjectStore } from '@/store/useContentProjectStore';
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar';
import { WorkspaceToolbar } from '@/components/workspace/WorkspaceToolbar';
import { MaterialGeneratorModal } from '@/components/shared/MaterialGeneratorModal';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import type { Material } from '@/api/endpoints';
import { SlideCard } from '@/components/preview/SlideCard';
import { useProjectStore } from '@/store/useProjectStore';
import { useExportTasksStore, type ExportTask, type ExportTaskType } from '@/store/useExportTasksStore';
import { getImageUrl } from '@/api/client';
import { getPageImageVersions, setCurrentImageVersion, recoverPageImageScene, getTaskStatus, updateProject, uploadTemplate, uploadPageTemplate, updatePageTemplate, clearPageTemplate, autoMatchPageTemplates, exportPPTX as apiExportPPTX, exportPDF as apiExportPDF, exportImages as apiExportImages, exportEditablePPTX as apiExportEditablePPTX, exportVideo as apiExportVideo, preflightExportVideo as apiPreflightExportVideo, getSettings, getFishAudioVoices, getProjectNarrations } from '@/api/endpoints';
import type { ImageGenerationOptions, ImageVersion, DescriptionContent, ExportExtractorMethod, ExportInpaintMethod, Page, NarrationConfig, NarrationSpeaker, FishAudioVoice, NarrationPreferences, PronunciationEntry, ProjectNarrationSummary } from '@/types';
import { FishNarrationAdvancedPanel, DEFAULT_NARRATION_PREFERENCES } from '@/components/shared/FishNarrationAdvancedPanel';
import { NarrationWorkbench } from '@/components/narration/NarrationWorkbench';
import { normalizeErrorMessage } from '@/utils';
import { NativeDeckWorkspaceLoader } from '@/components/native-deck/NativeDeckWorkspaceLoader';
import { buildNativeProjectSlides } from '@/native-deck/nativeProjectSlides';
import { getNativeDeckTaskStorageKey } from '@/utils/projectUtils';
import { findGordenTemplatePack } from '@/config/gordenTemplatePacks';
import layoutManifest from '../../../shared/native-deck/layout-manifest.json';
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel';

const VIDEO_VOICE_OPTIONS = [
  { group: '中文', voices: [
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（中文 · 女声）', lang: 'zh' },
    { id: 'zh-CN-YunxiNeural', label: '云希（中文 · 男声）', lang: 'zh' },
    { id: 'zh-CN-YunjianNeural', label: '云健（中文 · 男声）', lang: 'zh' },
    { id: 'zh-CN-XiaoyiNeural', label: '晓伊（中文 · 女声）', lang: 'zh' },
  ]},
  { group: 'English', voices: [
    { id: 'en-US-JennyNeural', label: 'Jenny（英文 · 女声）', lang: 'en' },
    { id: 'en-US-GuyNeural', label: 'Guy（英文 · 男声）', lang: 'en' },
    { id: 'en-US-AriaNeural', label: 'Aria（英文 · 女声）', lang: 'en' },
    { id: 'en-US-DavisNeural', label: 'Davis（英文 · 男声）', lang: 'en' },
  ]},
  { group: '日本語', voices: [
    { id: 'ja-JP-NanamiNeural', label: 'Nanami（日文 · 女声）', lang: 'ja' },
    { id: 'ja-JP-KeitaNeural', label: 'Keita（日文 · 男声）', lang: 'ja' },
  ]},
];

const NARRATION_PERSONA_OPTIONS = [
  { value: 'charismatic keynote speaker', zh: '演讲家', en: 'Keynote speaker' },
  { value: 'knowledgeable and patient university professor', zh: '大学教授', en: 'University professor' },
  { value: 'confident corporate executive', zh: '企业高管', en: 'Corporate executive' },
  { value: 'engaging online content creator', zh: '自媒体讲述者', en: 'Content creator' },
];

const NARRATION_AUDIENCE_OPTIONS = [
  { value: 'the general public with no technical background', zh: '普通大众', en: 'General public' },
  { value: 'industry experts and seasoned professionals', zh: '行业专家', en: 'Industry experts' },
  { value: 'potential investors and venture capitalists', zh: '投资人和 VC', en: 'Investors and VCs' },
  { value: 'internal team members and employees', zh: '内部团队成员', en: 'Internal team' },
];

const NARRATION_TONE_OPTIONS = [
  { value: 'inspiring, passionate, and persuasive', zh: '激情说服型', en: 'Inspiring and persuasive' },
  { value: 'analytical, data-driven, and highly professional', zh: '理性数据流', en: 'Analytical and professional' },
  { value: 'storytelling-focused, emotional, and captivating', zh: '故事沉浸型', en: 'Storytelling and emotional' },
  { value: 'conversational, witty, and approachable', zh: '轻松聊天型', en: 'Conversational and witty' },
];

type VideoDirectorPreset = 'business' | 'training' | 'launch' | 'brief';

const VIDEO_DIRECTOR_PRESETS: Array<{ value: VideoDirectorPreset; labelKey: string }> = [
  { value: 'business', labelKey: 'videoDirectorBusiness' },
  { value: 'training', labelKey: 'videoDirectorTraining' },
  { value: 'launch', labelKey: 'videoDirectorLaunch' },
  { value: 'brief', labelKey: 'videoDirectorBrief' },
];

const IMAGE_GENERATION_SETTINGS_KEY = 'slidePreviewImageGenerationSettings';
type SlideImageGenerationSettings = Required<Pick<ImageGenerationOptions, 'maxWorkers' | 'useTemplate' | 'density' | 'style' | 'composition' | 'restraint'>> & {
  customPrompt: string;
};

const DEFAULT_IMAGE_GENERATION_SETTINGS: SlideImageGenerationSettings = {
  maxWorkers: 4,
  useTemplate: true,
  density: 'standard',
  style: 'theme',
  composition: 'auto',
  restraint: 'strong',
  customPrompt: '',
};

const IMAGE_QUALITY_ISSUE_LABELS: Record<string, string> = {
  aspect_ratio_mismatch: '画面比例与项目设置不一致',
  transparent_or_empty: '图片透明或没有可见内容',
  near_blank: '图片接近空白或全黑',
  near_solid_color: '图片内容变化过少，接近纯色',
  resolution_mismatch: '图片分辨率与生成设置不一致',
};

const IMAGE_RESTRAINT_OPTIONS = [
  { value: 'standard', label: '标准' },
  { value: 'strong', label: '强力' },
  { value: 'documentary', label: '纪实' },
] as const;

const IMAGE_DENSITY_HELP = {
  sparse: '一个视觉焦点，最大化留白，不增加次要装饰。',
  standard: '一个视觉焦点，辅助元素不超过两个，适合多数汇报。',
  rich: '允许多层信息，但仍保持明确层级，避免堆满画面。',
} as const;

const IMAGE_RESTRAINT_HELP = {
  standard: '控制饱和度、随机光点和无意义装饰。',
  strong: '再抑制霓虹、体积光、电影调色、塑料材质和广告式完美。',
  documentary: '加入自然间距、轻微不对称、真实使用痕迹和非摆拍人物。',
} as const;

const IMAGE_RENDERING_TERMS = [
  { label: '电影感', pattern: /cinematic|电影感/i },
  { label: '霓虹/发光', pattern: /neon|glowing|霓虹|发光/i },
  { label: '体积光', pattern: /volumetric(?:\s+lighting)?|体积光/i },
  { label: '超细节', pattern: /ultra[-\s]?detailed|超细节/i },
  { label: '超写实', pattern: /hyper[-\s]?realistic|photorealistic|超写实/i },
  { label: '未来/全息', pattern: /futuristic|holographic|未来感|全息/i },
  { label: '奢华/广告感', pattern: /luxury|award[-\s]?winning|奢华|获奖/i },
] as const;

type ImageGenerationWarningSettings = Pick<SlideImageGenerationSettings, 'style' | 'composition' | 'restraint' | 'customPrompt'>;

const getImageGenerationWarnings = (settings: ImageGenerationWarningSettings): string[] => {
  const prompt = settings.customPrompt.trim();
  if (!prompt) return [];

  const warnings: string[] = [];
  const renderingTermCount = IMAGE_RENDERING_TERMS.filter(({ pattern }) => pattern.test(prompt)).length;
  if (renderingTermCount >= 2) {
    warnings.push(`检测到 ${renderingTermCount} 个高渲染词（如电影感、霓虹、超细节），可能让画面变满并增加 AI 味；建议保留一个主风格词。`);
  }

  if (settings.style === 'photo' && /flat|illustration|vector|扁平|插画|矢量/i.test(prompt)) {
    warnings.push('当前选择“真实商业摄影”，但特殊要求包含扁平或插画倾向；结构化风格设置会优先生效。');
  }
  if (settings.style === 'flat' && /photo(?:graphy|graphic)?|photorealistic|realistic|摄影|写实/i.test(prompt)) {
    warnings.push('当前选择“扁平商务插画”，但特殊要求包含摄影或写实倾向；结构化风格设置会优先生效。');
  }
  if (settings.restraint === 'documentary' && /cinematic|dramatic|neon|volumetric|luxury|电影感|戏剧性|霓虹|体积光|奢华/i.test(prompt)) {
    warnings.push('“纪实”模式会压低电影化和广告化效果；当前特殊要求里有相反倾向，建议删掉冲突词。');
  }

  const subjectOnLeft = /(?:主体|人物|产品|焦点|视觉中心|subject|person|product|focal\s+point)[^。！？.!?\n]{0,16}(?:左侧|左边|左方|left)/i.test(prompt);
  const subjectOnRight = /(?:主体|人物|产品|焦点|视觉中心|subject|person|product|focal\s+point)[^。！？.!?\n]{0,16}(?:右侧|右边|右方|right)/i.test(prompt);
  if (settings.composition === 'text-left' && subjectOnLeft) {
    warnings.push('构图安全区设为“左文右图”，但特殊要求把主体放在左侧，可能挤占文字区域。');
  }
  if (settings.composition === 'text-right' && subjectOnRight) {
    warnings.push('构图安全区设为“右文左图”，但特殊要求把主体放在右侧，可能挤占文字区域。');
  }

  return warnings;
};

const getImageGenerationSettingsKey = (projectId?: string | null) =>
  projectId ? `${IMAGE_GENERATION_SETTINGS_KEY}:${projectId}` : IMAGE_GENERATION_SETTINGS_KEY;

const clampImageWorkers = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_GENERATION_SETTINGS.maxWorkers;
  return Math.min(4, Math.max(1, Math.round(numeric)));
};

const normalizeImageGenerationSettings = (settings: Partial<ImageGenerationOptions>): SlideImageGenerationSettings => ({
  maxWorkers: clampImageWorkers(settings.maxWorkers),
  useTemplate: settings.useTemplate !== false,
  density: ['sparse', 'standard', 'rich'].includes(String(settings.density)) ? settings.density as SlideImageGenerationSettings['density'] : 'standard',
  style: ['theme', 'business', 'tech', 'photo', 'flat'].includes(String(settings.style)) ? settings.style as SlideImageGenerationSettings['style'] : 'theme',
  composition: ['auto', 'text-left', 'text-right', 'center', 'full-bleed'].includes(String(settings.composition)) ? settings.composition as SlideImageGenerationSettings['composition'] : 'auto',
  restraint: ['standard', 'strong', 'documentary'].includes(String(settings.restraint)) ? settings.restraint as SlideImageGenerationSettings['restraint'] : 'strong',
  customPrompt: typeof settings.customPrompt === 'string' ? settings.customPrompt : '',
});

const loadImageGenerationSettings = (projectId?: string | null): SlideImageGenerationSettings => {
  try {
    const storageKey = getImageGenerationSettingsKey(projectId);
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ImageGenerationOptions>;
      return normalizeImageGenerationSettings(parsed);
    }

    if (projectId) {
      const legacyRaw = localStorage.getItem(IMAGE_GENERATION_SETTINGS_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as Partial<ImageGenerationOptions>;
        const migrated = normalizeImageGenerationSettings(parsed);
        localStorage.setItem(storageKey, JSON.stringify(migrated));
        localStorage.removeItem(IMAGE_GENERATION_SETTINGS_KEY);
        return migrated;
      }
    }

    return DEFAULT_IMAGE_GENERATION_SETTINGS;
  } catch {
    return DEFAULT_IMAGE_GENERATION_SETTINGS;
  }
};

const DEFAULT_VIDEO_NARRATION_CONFIG: NarrationConfig = {
  speaker_persona: 'knowledgeable and patient university professor',
  target_audience: 'the general public with no technical background',
  speech_tone: 'analytical, data-driven, and highly professional',
  presentation_topic: '',
  min_words: 100,
  max_words: 200,
};

const DEFAULT_VIDEO_SPEAKERS: NarrationSpeaker[] = [
  { id: 'host', name: '主持人', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' },
  { id: 'expert', name: '专家', voice: 'zh-CN-YunxiNeural', rate: '+0%' },
];

const DEFAULT_FISH_AUDIO_SPEAKERS: NarrationSpeaker[] = [
  { id: 'speaker-1', name: '主持人', voice: '' },
  { id: 'speaker-2', name: '嘉宾', voice: '' },
];

type VideoDirectorConfig = {
  preset: VideoDirectorPreset;
  motion_intensity: 'minimal' | 'subtle' | 'standard';
  subtitle_mode: 'standard' | 'highlight';
  transition: 'cut' | 'fade' | 'push';
  page_pause_ms: number;
};

const VIDEO_DIRECTOR_CONFIGS: Record<VideoDirectorPreset, VideoDirectorConfig> = {
  business: { preset: 'business', motion_intensity: 'subtle', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 260 },
  training: { preset: 'training', motion_intensity: 'standard', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 340 },
  launch: { preset: 'launch', motion_intensity: 'standard', subtitle_mode: 'highlight', transition: 'push', page_pause_ms: 220 },
  brief: { preset: 'brief', motion_intensity: 'minimal', subtitle_mode: 'standard', transition: 'cut', page_pause_ms: 160 },
};

type PptxTransitionEffect =
  | 'fade'
  | 'page_turn'
  | 'push'
  | 'wipe'
  | 'split'
  | 'blinds'
  | 'checker'
  | 'wheel';

const PPTX_TRANSITION_OPTIONS: { value: PptxTransitionEffect; labelKey: string }[] = [
  { value: 'fade', labelKey: 'pptxTransitionFade' },
  { value: 'page_turn', labelKey: 'pptxTransitionPageTurn' },
  { value: 'push', labelKey: 'pptxTransitionPush' },
  { value: 'wipe', labelKey: 'pptxTransitionWipe' },
  { value: 'split', labelKey: 'pptxTransitionSplit' },
  { value: 'blinds', labelKey: 'pptxTransitionBlinds' },
  { value: 'checker', labelKey: 'pptxTransitionChecker' },
  { value: 'wheel', labelKey: 'pptxTransitionWheel' },
];

export const SlidePreview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const t = useT(previewI18n);
  const { projectId } = useParams<{ projectId: string }>();
  const {
    currentProject,
    syncProject,
    generatePageImage,
    generateImages,
    editPageImage,
    deletePageById,
    updatePageLocal,
    isGlobalLoading,
    taskProgress,
    pageGeneratingTasks,
    activeImageTask,
    imageQualityReport,
    restoreImageGeneration,
    pauseImageGeneration,
    resumeImageGeneration,
    warningMessage,
  } = useProjectStore();

  const { addTask, pollTask: pollExportTask, tasks: exportTasks, restoreActiveTasks } = useExportTasksStore();

  // 页面挂载时恢复正在进行的导出任务（页面刷新后）
  useEffect(() => {
    restoreActiveTasks();
  }, [restoreActiveTasks]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [useTextStyleMode, setUseTextStyleMode] = useState(false);
  const [draftTemplateStyle, setDraftTemplateStyle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  // 大纲和描述编辑状态
  const [editOutlineTitle, setEditOutlineTitle] = useState('');
  const [editOutlinePoints, setEditOutlinePoints] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isInspectorOutlineEditing, setIsInspectorOutlineEditing] = useState(false);
  const [isInspectorDescriptionEditing, setIsInspectorDescriptionEditing] = useState(false);
  const [inspectorOutlineTitle, setInspectorOutlineTitle] = useState('');
  const [inspectorOutlinePoints, setInspectorOutlinePoints] = useState('');
  const [inspectorDescription, setInspectorDescription] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportTasksPanel, setShowExportTasksPanel] = useState(false);
  const [showPptxExportDialog, setShowPptxExportDialog] = useState(false);
  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [showVideoAdvancedSettings, setShowVideoAdvancedSettings] = useState(false);
  const [showNarrationWorkbench, setShowNarrationWorkbench] = useState(false);
  const [showPptToVideoWizard, setShowPptToVideoWizard] = useState(false);
  const [videoNarrationSummary, setVideoNarrationSummary] = useState<ProjectNarrationSummary | null>(null);
  const [showEditablePptxDialog, setShowEditablePptxDialog] = useState(false);
  const [showImageQualityReport, setShowImageQualityReport] = useState(false);
  const [pptxTransitionsEnabled, setPptxTransitionsEnabled] = useState(false);
  const [pptxTransitionEffects, setPptxTransitionEffects] = useState<PptxTransitionEffect[]>(['fade']);
  const [videoEnableKenBurns, setVideoEnableKenBurns] = useState(true);
  const [videoKenBurnsStyle, setVideoKenBurnsStyle] = useState<'auto' | 'zoom' | 'pan'>('auto');
  const [videoIncludeNoImage, setVideoIncludeNoImage] = useState(false);
  const [videoDirectorConfig, setVideoDirectorConfig] = useState<VideoDirectorConfig>(VIDEO_DIRECTOR_CONFIGS.business);
  const [videoVoice, setVideoVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [videoSpeed, setVideoSpeed] = useState<number>(() => {
    const stored = parseFloat(localStorage.getItem('videoSpeed') || '');
    return Number.isFinite(stored) && stored >= 0.7 && stored <= 1.2 ? stored : 1.0;
  });
  useEffect(() => { localStorage.setItem('videoSpeed', String(videoSpeed)); }, [videoSpeed]);
  const [videoNarrationConfig, setVideoNarrationConfig] = useState<NarrationConfig>(DEFAULT_VIDEO_NARRATION_CONFIG);
  const [videoNarrationMode, setVideoNarrationMode] = useState<'single' | 'dialogue'>('single');
  const [videoNarrationSpeakers, setVideoNarrationSpeakers] = useState<NarrationSpeaker[]>(DEFAULT_VIDEO_SPEAKERS);
  const [videoTtsProvider, setVideoTtsProvider] = useState<'edge' | 'fish_audio'>('edge');
  const [videoFishVoices, setVideoFishVoices] = useState<FishAudioVoice[]>([]);
  const [videoFishVoice, setVideoFishVoice] = useState('');
  const [videoFishSpeakers, setVideoFishSpeakers] = useState<NarrationSpeaker[]>(DEFAULT_FISH_AUDIO_SPEAKERS);
  const [videoFishVoicesLoading, setVideoFishVoicesLoading] = useState(false);
  const [videoFishVoicesError, setVideoFishVoicesError] = useState('');
  const [videoAutoEmotion, setVideoAutoEmotion] = useState(true);
  const [videoPronunciationLexicon, setVideoPronunciationLexicon] = useState<PronunciationEntry[]>([]);
  const [videoNarrationPreferences, setVideoNarrationPreferences] = useState<NarrationPreferences>(DEFAULT_NARRATION_PREFERENCES);
  const [videoShowAdvancedNarration, setVideoShowAdvancedNarration] = useState(false);
  const loadVideoFishVoices = useCallback(async () => {
    setVideoFishVoicesLoading(true);
    setVideoFishVoicesError('');
    try {
      const response = await getFishAudioVoices({ scope: 'all' });
      const voices = response.data?.voices || [];
      setVideoFishVoices(voices);
      setVideoFishVoice(previous => voices.some(voice => voice.id === previous) ? previous : (voices[0]?.id || ''));
      setVideoFishSpeakers(previous => previous.map((speaker, index) => ({
        ...speaker,
        voice: voices.some(voice => voice.id === speaker.voice)
          ? speaker.voice
          : (voices.length ? voices[index % voices.length].id : ''),
      })));
      if (voices.length === 0) {
        setVideoFishVoicesError('暂无可用的 Fish 声音，请先在设置中刷新官方社区或克隆声音。');
      }
    } catch (error: any) {
      setVideoFishVoices([]);
      setVideoFishVoice('');
      setVideoFishSpeakers(previous => previous.map(speaker => ({ ...speaker, voice: '' })));
      setVideoFishVoicesError(normalizeErrorMessage(
        error?.response?.data?.error?.message || error?.message || 'Fish Audio 声线加载失败，请先检查设置中的 API Key。',
      ));
    } finally {
      setVideoFishVoicesLoading(false);
    }
  }, []);
  useEffect(() => {
    if (showVideoExportDialog && videoTtsProvider === 'fish_audio') {
      void loadVideoFishVoices();
    }
  }, [loadVideoFishVoices, showVideoExportDialog, videoTtsProvider]);
  useEffect(() => {
    if (!currentProject) return;
    setVideoPronunciationLexicon(currentProject.pronunciation_lexicon || []);
    setVideoNarrationPreferences(currentProject.narration_preferences || DEFAULT_NARRATION_PREFERENCES);
  }, [currentProject?.project_id]);
  useEffect(() => {
    if (!showVideoExportDialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowVideoExportDialog(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showVideoExportDialog]);
  const applyVideoDirectorPreset = useCallback((preset: VideoDirectorPreset) => {
    const presetValues = {
      business: {
        speed: 1.0,
        speaker_persona: 'confident corporate executive',
        speech_tone: 'analytical, data-driven, and highly professional',
      },
      training: {
        speed: 0.95,
        speaker_persona: 'knowledgeable and patient university professor',
        speech_tone: 'conversational, witty, and approachable',
      },
      launch: {
        speed: 1.05,
        speaker_persona: 'charismatic keynote speaker',
        speech_tone: 'inspiring, passionate, and persuasive',
      },
      brief: {
        speed: 1.1,
        speaker_persona: 'confident corporate executive',
        speech_tone: 'analytical, data-driven, and highly professional',
      },
    }[preset];
    setVideoDirectorConfig(VIDEO_DIRECTOR_CONFIGS[preset]);
    setVideoSpeed(presetValues.speed);
    setVideoNarrationConfig(previous => ({
      ...previous,
      speaker_persona: presetValues.speaker_persona,
      speech_tone: presetValues.speech_tone,
    }));
  }, []);
  // 多选导出相关状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isOutlineExpanded, setIsOutlineExpanded] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imageVersions, setImageVersions] = useState<ImageVersion[]>([]);
  const currentImageVersion = imageVersions.find(version => version.is_current);
  const [isRecoveringScene, setIsRecoveringScene] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [selectedContextImages, setSelectedContextImages] = useState<{
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedFiles: File[];
  }>({
    useTemplate: false,
    descImageUrls: [],
    uploadedFiles: [],
  });
  const [extraRequirements, setExtraRequirements] = useState<string>('');
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const isEditingRequirements = useRef(false); // 跟踪用户是否正在编辑额外要求
  const [templateStyle, setTemplateStyle] = useState<string>('');
  const [isSavingTemplateStyle, setIsSavingTemplateStyle] = useState(false);
  const [pageTemplateStyle, setPageTemplateStyle] = useState('');
  const [isSavingPageTemplate, setIsSavingPageTemplate] = useState(false);
  const pageTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const isEditingTemplateStyle = useRef(false); // 跟踪用户是否正在编辑风格描述
  const lastProjectId = useRef<string | null>(null); // 跟踪上一次的项目ID
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  // 素材生成模态开关（模块本身可复用，这里只是示例入口）
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  // 素材选择器模态开关
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  // 导出设置
  const [exportExtractorMethod, setExportExtractorMethod] = useState<ExportExtractorMethod>(
    (currentProject?.export_extractor_method as ExportExtractorMethod) || 'hybrid'
  );
  const [exportInpaintMethod, setExportInpaintMethod] = useState<ExportInpaintMethod>(
    (currentProject?.export_inpaint_method as ExportInpaintMethod) || 'hybrid'
  );
  const [exportAllowPartial, setExportAllowPartial] = useState<boolean>(
    currentProject?.export_allow_partial || false
  );
  const [exportHighFidelityEditable, setExportHighFidelityEditable] = useState<boolean>(
    currentProject?.export_high_fidelity_editable || false
  );
  const [isSavingExportSettings, setIsSavingExportSettings] = useState(false);
  const [showImageGenerationSettings, setShowImageGenerationSettings] = useState(false);
  const [imageGenerationSettings, setImageGenerationSettings] = useState(DEFAULT_IMAGE_GENERATION_SETTINGS);
  const [draftImageGenerationSettings, setDraftImageGenerationSettings] = useState(DEFAULT_IMAGE_GENERATION_SETTINGS);
  const imageGenerationWarnings = useMemo(
    () => getImageGenerationWarnings(draftImageGenerationSettings),
    [draftImageGenerationSettings],
  );
  // 画面比例
  const [aspectRatio, setAspectRatio] = useState<string>(
    currentProject?.image_aspect_ratio || '16:9'
  );
  const [isSavingAspectRatio, setIsSavingAspectRatio] = useState(false);
  // 根据画面比例计算 CSS aspect-ratio
  const aspectRatioStyle = useMemo(() => {
    const parts = aspectRatio.split(':');
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w > 0 && h > 0) return `${w}/${h}`;
    }
    return '16/9';
  }, [aspectRatio]);

  useEffect(() => {
    setPageTemplateStyle(currentProject?.pages?.[selectedIndex]?.template_style_text || '');
  }, [currentProject?.pages, selectedIndex]);
  const previewCanvasWidth = useMemo(() => {
    const [width, height] = aspectRatioStyle.split('/').map(Number);
    return `min(100%, 64rem, ${(width / height) * 100}cqh)`;
  }, [aspectRatioStyle]);
  // 1K分辨率警告对话框状态
  const [show1KWarningDialog, setShow1KWarningDialog] = useState(false);
  const [skip1KWarningChecked, setSkip1KWarningChecked] = useState(false);
  const [pending1KAction, setPending1KAction] = useState<(() => Promise<void>) | null>(null);
  // 每页编辑参数缓存（前端会话内缓存，便于重复执行）
  const [editContextByPage, setEditContextByPage] = useState<Record<string, {
    prompt: string;
    contextImages: {
      useTemplate: boolean;
      descImageUrls: string[];
      uploadedFiles: File[];
    };
  }>>({});

  // 预览图矩形选择状态（编辑弹窗内）
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const { show, ToastContainer } = useToast();
  const { ConfirmDialog } = useConfirm();

  const selectablePages = useMemo(() => {
    return currentProject?.pages.filter(p => p.id) || [];
  }, [currentProject?.pages]);
  const narrationPageIds = useMemo(
    () => currentProject?.pages?.map((page) => page.page_id) || [],
    [currentProject?.pages],
  );

  const hasImages = useMemo(
    () => currentProject?.pages?.some(p => p.generated_image_path) ?? false,
    [currentProject?.pages]
  );
  const isRenovationProject = currentProject?.creation_type === 'ppt_renovation' || currentProject?.creation_type === 'renovation';
  const pendingBatchImageCount = useMemo(() => {
    const pages = isMultiSelectMode && selectedPageIds.size > 0
      ? currentProject?.pages.filter(page => page.id && selectedPageIds.has(page.id))
      : currentProject?.pages;
    return pages?.filter(page =>
      page.id
      && (isRenovationProject ? page.status !== 'COMPLETED' : !page.generated_image_path)
      && !pageGeneratingTasks[page.id]
    ).length || 0;
  }, [currentProject?.pages, isMultiSelectMode, isRenovationProject, pageGeneratingTasks, selectedPageIds]);
  const imageGenerationActive = !!activeImageTask
    && ['PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'].includes(activeImageTask.status);
  const imageGenerationPaused = activeImageTask?.status === 'PAUSED';
  const imageGenerationProgressPercent = activeImageTask?.progress?.total
    ? Math.round(((activeImageTask.progress.completed || 0) / activeImageTask.progress.total) * 100)
    : 0;
  const imageQualityPages = useMemo(
    () => Array.isArray(imageQualityReport?.pages)
      ? imageQualityReport.pages.filter((item: any) => item?.qa?.status === 'warning')
      : [],
    [imageQualityReport],
  );
  const imageQualityWarningCount = Number(imageQualityReport?.quality_summary?.warnings || imageQualityPages.length);
  const activeImageTaskRef = useRef(activeImageTask);
  const pauseImageGenerationRef = useRef(pauseImageGeneration);

  useEffect(() => {
    activeImageTaskRef.current = activeImageTask;
    pauseImageGenerationRef.current = pauseImageGeneration;
  }, [activeImageTask, pauseImageGeneration]);

  useEffect(() => {
    return () => {
      const task = activeImageTaskRef.current;
      if (task && ['PENDING', 'PROCESSING', 'RUNNING'].includes(task.status)) {
        void pauseImageGenerationRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!currentProject) return;
    const fallbackTopic = currentProject.idea_prompt?.trim()
      || currentProject.pages.find(page => page.outline_content?.title)?.outline_content?.title
      || '';
    setVideoNarrationConfig(prev => ({
      ...prev,
      presentation_topic: prev.presentation_topic || fallbackTopic,
    }));
  }, [currentProject]);

  useEffect(() => {
    const nextSettings = loadImageGenerationSettings(currentProject?.id || projectId);
    setImageGenerationSettings(nextSettings);
    setDraftImageGenerationSettings(nextSettings);
  }, [currentProject?.id, projectId]);

  // 加载项目数据 & 用户模板
  useEffect(() => {
    let cancelled = false;
    if (projectId) {
      void syncProject(projectId).then(() => {
        if (!cancelled) restoreImageGeneration();
      });
    }

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('Failed to load user templates:', error);
      }
    };
    void loadTemplates();
    return () => { cancelled = true; };
  }, [projectId, restoreImageGeneration, syncProject]);

  // 监听警告消息
  const lastWarningRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (warningMessage) {
      if (warningMessage !== lastWarningRef.current) {
        lastWarningRef.current = warningMessage;
        show({ message: warningMessage, type: 'warning', duration: 6000 });
      }
    } else {
      // warningMessage 被清空时重置 ref，以便下次能再次显示
      lastWarningRef.current = null;
    }
  }, [warningMessage, show]);

  // 当项目加载后，初始化额外要求和风格描述
  // 只在项目首次加载或项目ID变化时初始化，避免覆盖用户正在输入的内容
  useEffect(() => {
    if (currentProject) {
      // 检查是否是新项目
      const isNewProject = lastProjectId.current !== currentProject.id;

      if (isNewProject) {
        // 新项目，初始化额外要求和风格描述
        setExtraRequirements(currentProject.extra_requirements || '');
        setTemplateStyle(currentProject.template_style || '');
        // 初始化导出设置
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setExportHighFidelityEditable(currentProject.export_high_fidelity_editable || false);
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        lastProjectId.current = currentProject.id || null;
        isEditingRequirements.current = false;
        isEditingTemplateStyle.current = false;
      } else {
        // 同一项目且用户未在编辑，可以更新（比如从服务器保存后同步回来）
        if (!isEditingRequirements.current) {
          setExtraRequirements(currentProject.extra_requirements || '');
        }
        if (!isEditingTemplateStyle.current) {
          setTemplateStyle(currentProject.template_style || '');
        }
        // 非文本输入的设置项，始终从服务器同步
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setExportHighFidelityEditable(currentProject.export_high_fidelity_editable || false);
      }
      // 如果用户正在编辑，则不更新本地状态
    }
  }, [currentProject?.id, currentProject?.extra_requirements, currentProject?.template_style, currentProject?.image_aspect_ratio, currentProject?.export_extractor_method, currentProject?.export_inpaint_method, currentProject?.export_allow_partial, currentProject?.export_high_fidelity_editable]);

  // 加载当前页面的历史版本
  useEffect(() => {
    const loadVersions = async () => {
      if (!currentProject || !projectId || selectedIndex < 0 || selectedIndex >= currentProject.pages.length) {
        setImageVersions([]);
        setShowVersionMenu(false);
        return;
      }

      const page = currentProject.pages[selectedIndex];
      if (!page?.id) {
        setImageVersions([]);
        setShowVersionMenu(false);
        return;
      }

      try {
        const response = await getPageImageVersions(projectId, page.id);
        if (response.data?.versions) {
          setImageVersions(response.data.versions);
        }
      } catch (error) {
        console.error('Failed to load image versions:', error);
        setImageVersions([]);
      }
    };

    loadVersions();
  }, [currentProject, selectedIndex, projectId]);

  // 检查是否需要显示1K分辨率警告
  const checkResolutionAndExecute = useCallback(async (action: () => Promise<void>) => {
    // 检查 localStorage 中是否已跳过警告
    const skipWarning = localStorage.getItem('skip1KResolutionWarning') === 'true';
    if (skipWarning) {
      await action();
      return;
    }

    try {
      const response = await getSettings();
      const resolution = response.data?.image_resolution;

      // 如果是1K分辨率，显示警告对话框
      if (resolution === '1K') {
        setPending1KAction(() => action);
        setSkip1KWarningChecked(false);
        setShow1KWarningDialog(true);
      } else {
        // 不是1K分辨率，直接执行
        await action();
      }
    } catch (error) {
      console.error('获取设置失败:', error);
      // 获取设置失败时，直接执行（不阻塞用户）
      await action();
    }
  }, []);

  // 确认1K分辨率警告后执行
  const handleConfirm1KWarning = useCallback(async () => {
    // 如果勾选了"不再提示"，保存到 localStorage
    if (skip1KWarningChecked) {
      localStorage.setItem('skip1KResolutionWarning', 'true');
    }

    setShow1KWarningDialog(false);

    // 执行待处理的操作
    if (pending1KAction) {
      await pending1KAction();
      setPending1KAction(null);
    }
  }, [skip1KWarningChecked, pending1KAction]);

  // 取消1K分辨率警告
  const handleCancel1KWarning = useCallback(() => {
    setShow1KWarningDialog(false);
    setPending1KAction(null);
  }, []);

  const openImageGenerationSettings = useCallback(() => {
    setDraftImageGenerationSettings(imageGenerationSettings);
    setShowImageGenerationSettings(true);
  }, [imageGenerationSettings]);

  const saveImageGenerationSettings = useCallback(() => {
    const nextSettings = {
      maxWorkers: clampImageWorkers(draftImageGenerationSettings.maxWorkers),
      useTemplate: draftImageGenerationSettings.useTemplate !== false,
      density: draftImageGenerationSettings.density,
      style: draftImageGenerationSettings.style,
      composition: draftImageGenerationSettings.composition,
      restraint: draftImageGenerationSettings.restraint,
      customPrompt: draftImageGenerationSettings.customPrompt.trim(),
    };
    setImageGenerationSettings(nextSettings);
    localStorage.setItem(getImageGenerationSettingsKey(currentProject?.id || projectId), JSON.stringify(nextSettings));
    setShowImageGenerationSettings(false);
  }, [currentProject?.id, draftImageGenerationSettings, projectId]);

  const handleGenerateAll = async () => {
    // 先检查分辨率，如果是1K则显示警告
    await checkResolutionAndExecute(async () => {
      const isPartialGenerate = isMultiSelectMode && selectedPageIds.size > 0;
      const pagesToGenerate = isPartialGenerate
        ? currentProject?.pages.filter(p => p.id && selectedPageIds.has(p.id))
        : currentProject?.pages;
      const pageIds = pagesToGenerate
        ?.filter(page => page.id
          && (isRenovationProject ? page.status !== 'COMPLETED' : !page.generated_image_path)
          && !pageGeneratingTasks[page.id])
        .map(page => page.id!) || [];
      if (pageIds.length === 0) return;

      const executeGenerate = async () => {
        try {
          if (projectId && imageGenerationSettings.useTemplate) {
            const needsTemplateMatch = pagesToGenerate?.some(page => page.id && pageIds.includes(page.id) && !page.template_selection_role);
            if (needsTemplateMatch) {
              await autoMatchPageTemplates(projectId);
              await syncProject(projectId);
            }
          }
          await generateImages(pageIds, imageGenerationSettings);
        } catch (error: any) {
          console.error('批量生成错误:', error);
          console.error('错误响应:', error?.response?.data);

          // 提取后端返回的更具体错误信息
          let errorMessage = t('preview.generationFailed');
          const respData = error?.response?.data;

          if (respData) {
            if (respData.error?.message) {
              errorMessage = respData.error.message;
            } else if (respData.message) {
              errorMessage = respData.message;
            } else if (respData.error) {
              errorMessage =
                typeof respData.error === 'string'
                  ? respData.error
                  : respData.error.message || errorMessage;
            }
          } else if (error.message) {
            errorMessage = error.message;
          }

          devLog('提取的错误消息:', errorMessage);

          // 使用统一的错误消息规范化函数
          errorMessage = normalizeErrorMessage(errorMessage);

          devLog('规范化后的错误消息:', errorMessage);

          show({
            message: errorMessage,
            type: 'error',
          });
        }
      };
      await executeGenerate();
    });
  };

  const regeneratePageAtIndex = useCallback(async (pageIndex: number, qualityIssues: string[] = []) => {
    if (!currentProject) return;
    const page = currentProject.pages[pageIndex];
    if (!page?.id) return;

    // 如果该页面正在生成，不重复提交
    if (pageGeneratingTasks[page.id]) {
      show({ message: t('slidePreview.pageGenerating'), type: 'info' });
      return;
    }

    // 先检查分辨率，如果是1K则显示警告
    await checkResolutionAndExecute(async () => {
      try {
        await generatePageImage(
          page.id!,
          true,
          qualityIssues.length
            ? { ...imageGenerationSettings, qualityIssues }
            : imageGenerationSettings,
        );
        show({ message: t('slidePreview.generationStarted'), type: 'success' });
      } catch (error: any) {
        // 提取后端返回的更具体错误信息
        let errorMessage = '生成失败';
        const respData = error?.response?.data;

        if (respData) {
          if (respData.error?.message) {
            errorMessage = respData.error.message;
          } else if (respData.message) {
            errorMessage = respData.message;
          } else if (respData.error) {
            errorMessage =
              typeof respData.error === 'string'
                ? respData.error
                : respData.error.message || errorMessage;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        // 使用统一的错误消息规范化函数
        errorMessage = normalizeErrorMessage(errorMessage);

        show({
          message: errorMessage,
          type: 'error',
        });
      }
    });
  }, [currentProject, pageGeneratingTasks, generatePageImage, imageGenerationSettings, show, checkResolutionAndExecute]);

  const handleRegeneratePage = useCallback(
    () => regeneratePageAtIndex(selectedIndex),
    [regeneratePageAtIndex, selectedIndex],
  );

  const handleSwitchVersion = async (versionId: string) => {
    if (!currentProject || !selectedPage?.id || !projectId) return;

    try {
      await setCurrentImageVersion(projectId, selectedPage.id, versionId);
      await syncProject(projectId);
      setShowVersionMenu(false);
      show({ message: t('slidePreview.versionSwitched'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.versionSwitchFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    }
  };

  const handleRecoverCurrentScene = async () => {
    if (!projectId || !selectedPage?.id || !currentImageVersion) return;
    setIsRecoveringScene(true);
    try {
      const response = await recoverPageImageScene(
        projectId,
        selectedPage.id,
        currentImageVersion.version_id,
        currentImageVersion.scene_status === 'failed',
      );
      setImageVersions(versions => versions.map(version => (
        version.version_id === currentImageVersion.version_id
          ? { ...version, scene_status: 'building', scene_error: null }
          : version
      )));
      setShowVersionMenu(false);
      show({ message: t('preview.sceneRecoveryQueued'), type: 'success' });
      const taskId = response.data?.task_id;
      if (taskId) {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 2000));
          const task = await getTaskStatus(projectId, taskId);
          if (['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'].includes(task.data?.status || '')) {
            break;
          }
        }
        const versions = await getPageImageVersions(projectId, selectedPage.id);
        if (versions.data?.versions) setImageVersions(versions.data.versions);
      }
    } catch (error: any) {
      show({ message: normalizeErrorMessage(error), type: 'error' });
    } finally {
      setIsRecoveringScene(false);
    }
  };

  // 从描述内容中提取图片URL
  const extractImageUrlsFromDescription = (descriptionContent: DescriptionContent | undefined): string[] => {
    if (!descriptionContent) return [];

    // 处理两种格式
    let text: string = '';
    if ('text' in descriptionContent) {
      text = descriptionContent.text as string;
    } else if ('text_content' in descriptionContent && Array.isArray(descriptionContent.text_content)) {
      text = descriptionContent.text_content.join('\n');
    }

    if (!text) return [];

    const urls = new Set<string>();
    const patterns = [
      /!\[.*?\]\((.*?)\)/g,
      /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    ];
    patterns.forEach((pattern) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const url = match[1]?.trim();
        if (url && (/^https?:\/\//.test(url) || url.startsWith('/files/'))) urls.add(url);
      }
    });
    return [...urls];
  };

  const handleEditPage = (pageIndex = selectedIndex) => {
    if (!currentProject) return;
    const page = currentProject.pages[pageIndex];
    const pageId = page?.id;

    setIsOutlineExpanded(false);
    setIsDescriptionExpanded(false);

    // 初始化大纲和描述编辑状态
    setEditOutlineTitle(page?.outline_content?.title || '');
    setEditOutlinePoints(page?.outline_content?.points?.join('\n') || '');
    // 提取描述文本
    const descContent = page?.description_content;
    let descText = '';
    if (descContent) {
      if ('text' in descContent) {
        descText = descContent.text as string;
      } else if ('text_content' in descContent && Array.isArray(descContent.text_content)) {
        descText = descContent.text_content.join('\n');
      }
    }
    setEditDescription(descText);

    if (pageId && editContextByPage[pageId]) {
      // 恢复该页上次编辑的内容和图片选择
      const cached = editContextByPage[pageId];
      setEditPrompt(cached.prompt);
      setSelectedContextImages({
        useTemplate: cached.contextImages.useTemplate,
        descImageUrls: [...cached.contextImages.descImageUrls],
        uploadedFiles: [...cached.contextImages.uploadedFiles],
      });
    } else {
      // 首次编辑该页，使用默认值
      setEditPrompt('');
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedFiles: [],
      });
    }

    // 打开编辑弹窗时，清空上一次的选区和模式
    setIsRegionSelectionMode(false);
    setSelectionStart(null);
    setSelectionRect(null);
    setIsSelectingRegion(false);

    setIsEditModalOpen(true);
  };

  const getDescriptionText = (page: Page | undefined) => {
    const descriptionContent = page?.description_content;
    if (!descriptionContent) return '';
    if ('text' in descriptionContent) return String(descriptionContent.text || '');
    if ('text_content' in descriptionContent && Array.isArray(descriptionContent.text_content)) {
      return descriptionContent.text_content.join('\n');
    }
    return '';
  };

  const handleStartInspectorOutlineEdit = () => {
    const page = currentProject?.pages[selectedIndex];
    if (!page) return;
    setInspectorOutlineTitle(page.outline_content?.title || '');
    setInspectorOutlinePoints(page.outline_content?.points?.join('\n') || '');
    setIsInspectorOutlineEditing(true);
  };

  const handleSaveInspectorOutline = () => {
    const page = currentProject?.pages[selectedIndex];
    if (!page?.id) return;
    updatePageLocal(page.id, {
      outline_content: {
        title: inspectorOutlineTitle,
        points: inspectorOutlinePoints.split('\n').filter((point) => point.trim()),
      },
    });
    setIsInspectorOutlineEditing(false);
    show({ message: '页面大纲已保存', type: 'success' });
  };

  const handleStartInspectorDescriptionEdit = () => {
    const page = currentProject?.pages[selectedIndex];
    if (!page) return;
    setInspectorDescription(getDescriptionText(page));
    setIsInspectorDescriptionEditing(true);
  };

  const handleSaveInspectorDescription = () => {
    const page = currentProject?.pages[selectedIndex];
    if (!page?.id) return;
    updatePageLocal(page.id, { description_content: { text: inspectorDescription } as DescriptionContent });
    setIsInspectorDescriptionEditing(false);
    show({ message: '页面描述已保存', type: 'success' });
  };

  // 保存大纲和描述修改
  const handleSaveOutlineAndDescription = useCallback(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page?.id) return;

    const updates: Partial<Page> = {};

    // 检查大纲是否有变化
    const originalTitle = page.outline_content?.title || '';
    const originalPoints = page.outline_content?.points?.join('\n') || '';
    if (editOutlineTitle !== originalTitle || editOutlinePoints !== originalPoints) {
      updates.outline_content = {
        title: editOutlineTitle,
        points: editOutlinePoints.split('\n').filter((p) => p.trim()),
      };
    }

    // 检查描述是否有变化
    const descContent = page.description_content;
    let originalDesc = '';
    if (descContent) {
      if ('text' in descContent) {
        originalDesc = descContent.text as string;
      } else if ('text_content' in descContent && Array.isArray(descContent.text_content)) {
        originalDesc = descContent.text_content.join('\n');
      }
    }
    if (editDescription !== originalDesc) {
      updates.description_content = {
        text: editDescription,
      } as DescriptionContent;
    }

    // 如果有修改，保存更新
    if (Object.keys(updates).length > 0) {
      updatePageLocal(page.id, updates);
      show({ message: t('slidePreview.outlineSaved'), type: 'success' });
    }
  }, [currentProject, selectedIndex, editOutlineTitle, editOutlinePoints, editDescription, updatePageLocal, show]);

  const handleSubmitEdit = useCallback(async () => {
    if (!currentProject || !editPrompt.trim()) return;

    const page = currentProject.pages[selectedIndex];
    if (!page.id) return;

    // 先保存大纲和描述的修改
    handleSaveOutlineAndDescription();

    // 调用后端编辑接口
    await editPageImage(
      page.id,
      editPrompt,
      {
        useTemplate: selectedContextImages.useTemplate,
        descImageUrls: selectedContextImages.descImageUrls,
        uploadedFiles: selectedContextImages.uploadedFiles.length > 0
          ? selectedContextImages.uploadedFiles
          : undefined,
      }
    );

    // 缓存当前页的编辑上下文，便于后续快速重复执行
    setEditContextByPage((prev) => ({
      ...prev,
      [page.id!]: {
        prompt: editPrompt,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedFiles: [...selectedContextImages.uploadedFiles],
        },
      },
    }));

    setIsEditModalOpen(false);
  }, [currentProject, selectedIndex, editPrompt, selectedContextImages, editPageImage, handleSaveOutlineAndDescription]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...files],
    }));
  };

  const removeUploadedFile = (index: number) => {
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index),
    }));
  };

  // Manage object URLs for uploaded files to prevent memory leaks
  const uploadedFileUrls = useRef<string[]>([]);
  useEffect(() => {
    uploadedFileUrls.current.forEach(url => URL.revokeObjectURL(url));
    uploadedFileUrls.current = selectedContextImages.uploadedFiles.map(file => URL.createObjectURL(file));
  }, [selectedContextImages.uploadedFiles]);
  useEffect(() => {
    return () => {
      uploadedFileUrls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      // 将选中的素材转换为File对象并添加到上传列表
      const files = await Promise.all(
        materials.map((material) => materialUrlToFile(material))
      );
      setSelectedContextImages((prev) => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, ...files],
      }));
      show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
    } catch (error: any) {
      console.error('加载素材失败:', error);
      show({
        message: t('slidePreview.loadMaterialFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    }
  };

  // 编辑弹窗打开时，实时把输入与图片选择写入缓存（前端会话内）
  useEffect(() => {
    if (!isEditModalOpen || !currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;

    setEditContextByPage((prev) => ({
      ...prev,
      [pageId]: {
        prompt: editPrompt,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedFiles: [...selectedContextImages.uploadedFiles],
        },
      },
    }));
  }, [isEditModalOpen, currentProject, selectedIndex, editPrompt, selectedContextImages]);

  // ========== 预览图矩形选择相关逻辑（编辑弹窗内） ==========
  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setIsSelectingRegion(true);
    setSelectionStart({ x, y });
    setSelectionRect(null);
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, rect.width));
    const clampedY = Math.max(0, Math.min(y, rect.height));

    const left = Math.min(selectionStart.x, clampedX);
    const top = Math.min(selectionStart.y, clampedY);
    const width = Math.abs(clampedX - selectionStart.x);
    const height = Math.abs(clampedY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const handleSelectionMouseUp = async () => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionRect || !imageRef.current) {
      setIsSelectingRegion(false);
      setSelectionStart(null);
      return;
    }

    // 结束拖拽，但保留选中的矩形，直到用户手动退出区域选图模式
    setIsSelectingRegion(false);
    setSelectionStart(null);

    try {
      const img = imageRef.current;
      const { left, top, width, height } = selectionRect;
      if (width < 10 || height < 10) {
        // 选区太小，忽略
        return;
      }

      // 将选区从展示尺寸映射到原始图片尺寸
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayWidth = img.clientWidth;
      const displayHeight = img.clientHeight;

      if (!naturalWidth || !naturalHeight || !displayWidth || !displayHeight) return;

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const sx = left * scaleX;
      const sy = top * scaleY;
      const sWidth = width * scaleX;
      const sHeight = height * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sWidth));
      canvas.height = Math.max(1, Math.round(sHeight));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(
          img,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `crop-${Date.now()}.png`, { type: 'image/png' });
          // 把选中区域作为额外参考图片加入上传列表
          setSelectedContextImages((prev) => ({
            ...prev,
            uploadedFiles: [...prev.uploadedFiles, file],
          }));
          // 给用户一个明显反馈：选区已作为图片加入下方“上传图片”
          show({
            message: t('slidePreview.regionCropSuccess'),
            type: 'success',
          });
        }, 'image/png');
      } catch (e: any) {
        console.error('裁剪选中区域失败（可能是跨域图片导致 canvas 被污染）:', e);
        show({
          message: t('slidePreview.regionCropFailed'),
          type: 'error',
        });
      }
    } finally {
      // 不清理 selectionRect，让选区在界面上持续显示
    }
  };

  // 多选相关函数
  const togglePageSelection = useCallback((pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const handleSlideCardSelect = useCallback((pageIndex: number, pageId?: string) => {
    if (isMultiSelectMode && pageId) {
      togglePageSelection(pageId);
    } else {
      setSelectedIndex(pageIndex);
    }
  }, [isMultiSelectMode, togglePageSelection]);

  const handleSlideCardEdit = useCallback((pageIndex: number) => {
    setSelectedIndex(pageIndex);
    handleEditPage(pageIndex);
  }, [handleEditPage]);

  const handleSlideCardDelete = useCallback((pageId: string) => {
    void deletePageById(pageId);
  }, [deletePageById]);

  const selectAllPages = () => {
    const allPageIds = selectablePages.map(p => p.id!);
    setSelectedPageIds(new Set(allPageIds));
  };

  const deselectAllPages = () => {
    setSelectedPageIds(new Set());
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(prev => {
      if (prev) {
        // 退出多选模式时清空选择
        setSelectedPageIds(new Set());
      }
      return !prev;
    });
  };

  // 获取有图片的选中页面ID列表
  const getSelectedPageIdsForExport = (): string[] | undefined => {
    if (!isMultiSelectMode || selectedPageIds.size === 0) {
      return undefined; // 导出全部
    }
    return Array.from(selectedPageIds);
  };

  const handleExport = async (
    type: 'pptx' | 'pdf' | 'editable-pptx' | 'images' | 'video',
    options?: {
      pptxTransitionEnabled?: boolean;
      pptxTransitionEffects?: PptxTransitionEffect[];
      pageIds?: string[];
    },
  ) => {
    setShowExportMenu(false);
    if (!projectId) return;
    setShowExportTasksPanel(true);

    const pageIds = options?.pageIds ?? getSelectedPageIdsForExport();
    const exportTaskId = `export-${Date.now()}`;

    try {
      if (type === 'pptx' || type === 'pdf' || type === 'images') {
        // Synchronous export - direct download, create completed task directly
        const response = type === 'pptx'
          ? await apiExportPPTX(projectId, pageIds, {
              transitionEnabled: options?.pptxTransitionEnabled,
              transitionEffects: options?.pptxTransitionEffects,
            })
          : type === 'pdf'
            ? await apiExportPDF(projectId, pageIds)
            : await apiExportImages(projectId, pageIds);
        const downloadUrl = response.data?.download_url || response.data?.download_url_absolute;
        if (downloadUrl) {
          const filename = response.data?.filename;
          addTask({
            id: exportTaskId,
            taskId: '',
            projectId,
            type: type as ExportTaskType,
            status: 'COMPLETED',
            downloadUrl,
            filename,
            pageIds: pageIds,
          });
        }
      } else if (type === 'editable-pptx') {
        // Async export - create processing task and start polling
        addTask({
          id: exportTaskId,
          taskId: '', // Will be updated below
          projectId,
          type: 'editable-pptx',
          status: 'PROCESSING',
          pageIds: pageIds,
        });

        show({ message: t('slidePreview.exportStarted'), type: 'success', duration: 2000 });

        const response = await apiExportEditablePPTX(projectId, undefined, pageIds);
        const taskId = response.data?.task_id;

        if (taskId) {
          // Update task with real taskId
          addTask({
            id: exportTaskId,
            taskId,
            projectId,
            type: 'editable-pptx',
            status: 'PROCESSING',
            pageIds: pageIds,
          });

          // Start polling in background (non-blocking)
          pollExportTask(exportTaskId, projectId, taskId);
        }
      } else if (type === 'video') {
        const videoPageIds = pageIds ?? currentProject?.pages?.map(page => page.page_id) ?? [];
        const narrationSummaryResponse = videoNarrationSummary
          ? { data: videoNarrationSummary }
          : await getProjectNarrations(projectId);
        const narrationSummary = narrationSummaryResponse.data;
        const selectedNarrations = narrationSummary?.pages.filter(page => videoPageIds.includes(page.page_id)) || [];
        const missingNarrations = selectedNarrations.filter(page => !page.current_version_id);
        if (selectedNarrations.length !== videoPageIds.length || missingNarrations.length > 0) {
          setShowVideoExportDialog(false);
          setShowExportTasksPanel(false);
          setShowNarrationWorkbench(true);
          show({ message: '请先确认所有导出页面的视频文案', type: 'warning', duration: 5000 });
          return;
        }
        const narrationVersionMap = Object.fromEntries(
          selectedNarrations.map(page => [page.page_id, page.current_version_id!]),
        );
        const activeVoice = videoTtsProvider === 'fish_audio' ? videoFishVoice : videoVoice;
        const activeSpeakers = videoTtsProvider === 'fish_audio' ? videoFishSpeakers : videoNarrationSpeakers;
        const preflight = await apiPreflightExportVideo(projectId, {
          pageIds: videoPageIds,
          generateNarration: false,
          narrationPolicy: 'confirmed_only',
          narrationVersionMap,
          includeNoImagePages: videoIncludeNoImage,
          ttsProvider: videoTtsProvider,
          voice: activeVoice,
          narrationMode: videoNarrationMode,
          speakers: videoNarrationMode === 'dialogue' ? activeSpeakers : undefined,
          speed: videoSpeed,
        });
        if (!preflight.data?.can_export) {
          show({
            message: preflight.data?.errors?.join('；') || '视频导出预检失败',
            type: 'error',
            duration: 5000,
          });
          return;
        }
        // Async export - create processing task and start polling
        addTask({
          id: exportTaskId,
          taskId: '',
          projectId,
          type: 'video',
          status: 'PROCESSING',
          pageIds: videoPageIds,
        });

        const preflightWarnings = preflight.data?.warnings ?? [];
        show({
          message: preflightWarnings.length > 0
            ? `${t('slidePreview.exportStarted')}；${preflightWarnings.join('；')}`
            : t('slidePreview.exportStarted'),
          type: preflightWarnings.length > 0 ? 'warning' : 'success',
          duration: preflightWarnings.length > 0 ? 6000 : 2000,
        });

        const voiceLang = VIDEO_VOICE_OPTIONS.flatMap(g => g.voices).find(v => v.id === activeVoice)?.lang || 'zh';
        if (videoTtsProvider === 'fish_audio') {
          await updateProject(projectId, {
            pronunciation_lexicon: videoPronunciationLexicon,
            narration_preferences: videoNarrationPreferences,
          });
        }
        const response = await apiExportVideo(projectId, {
          pageIds: videoPageIds,
          enableKenBurns: videoEnableKenBurns,
          kenBurnsStyle: videoKenBurnsStyle,
          includeNoImagePages: videoIncludeNoImage,
          voice: activeVoice,
          speed: videoSpeed,
          language: voiceLang,
          generateNarration: false,
          narrationPolicy: 'confirmed_only',
          narrationVersionMap,
          ttsProvider: videoTtsProvider,
          autoEmotion: videoTtsProvider === 'fish_audio' && videoAutoEmotion,
          pronunciationLexicon: videoPronunciationLexicon,
          narrationPreferences: videoNarrationPreferences,
          presentationTopic: videoNarrationConfig.presentation_topic,
          narrationConfig: {
            ...videoNarrationConfig,
            presentation_topic: videoNarrationConfig.presentation_topic,
          },
          narrationMode: videoNarrationMode,
          speakers: videoNarrationMode === 'dialogue' ? activeSpeakers : undefined,
          directorConfig: videoDirectorConfig,
        });
        const taskId = response.data?.task_id;

        if (taskId) {
          addTask({
            id: exportTaskId,
            taskId,
            projectId,
            type: 'video',
            status: 'PROCESSING',
            pageIds: videoPageIds,
          });

          pollExportTask(exportTaskId, projectId, taskId);
        }
      }
    } catch (error: any) {
      let errorMessage = t('preview.messages.exportFailed');
      const respData = error?.response?.data;

      if (respData) {
        if (respData.error?.message) {
          errorMessage = respData.error.message;
        } else if (respData.message) {
          errorMessage = respData.message;
        } else if (respData.error) {
          errorMessage =
            typeof respData.error === 'string'
              ? respData.error
              : respData.error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      const normalizedErrorMessage = normalizeErrorMessage(errorMessage);

      // Update task as failed
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'FAILED',
        errorMessage: normalizedErrorMessage,
        pageIds: pageIds,
      });
      show({ message: normalizedErrorMessage, type: 'error' });
    }
  };

  const handleRetryExport = (task: ExportTask) => {
    if (task.type === 'native-pptx' || task.type === 'native-pdf' || task.type === 'native-html' || task.type === 'podcast' || task.type === 'workspace') return;
    if (task.type === 'generate-video' || task.type === 'generate-podcast' || task.type === 'initialize-workspace') return;
    // 生成类任务走服务端重试（面板重试按钮），不是客户端导出
    if (task.type === 'generate-pages' || task.type === 'generate-images' || task.type === 'generate-descriptions' || task.type === 'narration-batch') return;
    handleExport(task.type, { pageIds: task.pageIds });
  };

  const handleRefresh = useCallback(async () => {
    const targetProjectId = projectId || currentProject?.id;
    if (!targetProjectId) {
      show({ message: t('slidePreview.cannotRefresh'), type: 'error' });
      return;
    }

    setIsRefreshing(true);
    try {
      await syncProject(targetProjectId);
      show({ message: t('slidePreview.refreshSuccess'), type: 'success' });
    } catch (error: any) {
      show({
        message: error.message || t('slidePreview.refreshFailed'),
        type: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, currentProject?.id, syncProject, show]);

  const handleSaveExtraRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingRequirements(true);
    try {
      await updateProject(projectId, { extra_requirements: extraRequirements || '' });
      // 保存成功后，标记为不在编辑状态，允许同步更新
      isEditingRequirements.current = false;
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.extraRequirementsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingRequirements(false);
    }
  }, [currentProject, projectId, extraRequirements, syncProject, show]);

  const handleSaveTemplateStyle = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingTemplateStyle(true);
    try {
      await updateProject(projectId, { template_style: templateStyle || '' });
      // 保存成功后，标记为不在编辑状态，允许同步更新
      isEditingTemplateStyle.current = false;
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingTemplateStyle(false);
    }
  }, [currentProject, projectId, templateStyle, syncProject, show]);

  const handleUploadPageTemplate = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const page = currentProject?.pages?.[selectedIndex];
    if (!projectId || !page?.id || !file) return;
    setIsSavingPageTemplate(true);
    try {
      await uploadPageTemplate(projectId, page.id, file);
      await syncProject(projectId);
      show({ message: '本页模板已上传', type: 'success' });
    } catch (error: any) {
      show({ message: error.message || '本页模板上传失败', type: 'error' });
    } finally {
      setIsSavingPageTemplate(false);
      event.target.value = '';
    }
  }, [currentProject?.pages, selectedIndex, projectId, syncProject, show]);

  const handleSavePageTemplateStyle = useCallback(async () => {
    const page = currentProject?.pages?.[selectedIndex];
    if (!projectId || !page?.id) return;
    setIsSavingPageTemplate(true);
    try {
      await updatePageTemplate(projectId, page.id, pageTemplateStyle);
      await syncProject(projectId);
      show({ message: '本页模板风格已保存', type: 'success' });
    } catch (error: any) {
      show({ message: error.message || '保存本页模板失败', type: 'error' });
    } finally {
      setIsSavingPageTemplate(false);
    }
  }, [currentProject?.pages, selectedIndex, projectId, pageTemplateStyle, syncProject, show]);

  const handleClearPageTemplate = useCallback(async () => {
    const page = currentProject?.pages?.[selectedIndex];
    if (!projectId || !page?.id) return;
    setIsSavingPageTemplate(true);
    try {
      await clearPageTemplate(projectId, page.id);
      await syncProject(projectId);
      show({ message: '本页模板已清除', type: 'success' });
    } catch (error: any) {
      show({ message: error.message || '清除本页模板失败', type: 'error' });
    } finally {
      setIsSavingPageTemplate(false);
    }
  }, [currentProject?.pages, selectedIndex, projectId, syncProject, show]);

  const handleAutoMatchPageTemplates = useCallback(async () => {
    if (!projectId) return;
    setIsSavingPageTemplate(true);
    try {
      const response = await autoMatchPageTemplates(projectId);
      await syncProject(projectId);
      show({ message: `已智能匹配 ${response.data?.matched ?? 0} 页模板`, type: 'success' });
    } catch (error: any) {
      show({ message: error.message || '智能匹配模板失败', type: 'error' });
    } finally {
      setIsSavingPageTemplate(false);
    }
  }, [projectId, syncProject, show]);

  const handleSaveExportSettings = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingExportSettings(true);
    try {
      await updateProject(projectId, {
        export_extractor_method: exportExtractorMethod,
        export_inpaint_method: exportInpaintMethod,
        export_allow_partial: exportAllowPartial,
        export_high_fidelity_editable: exportHighFidelityEditable
      });
      // 更新本地项目状态
      await syncProject(projectId);
      show({ message: t('slidePreview.exportSettingsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingExportSettings(false);
    }
  }, [currentProject, projectId, exportExtractorMethod, exportInpaintMethod, exportAllowPartial, exportHighFidelityEditable, syncProject, show, t]);

  const handleSaveAspectRatio = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingAspectRatio(true);
    try {
      await updateProject(projectId, { image_aspect_ratio: aspectRatio });
      await syncProject(projectId);
      show({ message: t('slidePreview.aspectRatioSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingAspectRatio(false);
    }
  }, [currentProject, projectId, aspectRatio, syncProject, show]);

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    if (!projectId) return;
    const gordenTemplate = findGordenTemplatePack(templateId);

    // 如果有templateId，按需加载File
    let file = templateFile;
    if (templateId && !file) {
      file = await getTemplateFile(templateId, userTemplates);
      if (!file && !gordenTemplate) {
        show({ message: t('slidePreview.loadTemplateFailed'), type: 'error' });
        return;
      }
    }

    if (!file && !gordenTemplate) {
      // 如果没有文件也没有 ID，可能是取消选择
      return;
    }

    setIsUploadingTemplate(true);
    try {
      if (file) {
        await uploadTemplate(projectId, file);
      }
      const gordenStyle = gordenTemplate?.style;
      await updateProject(projectId, { template_pack_id: gordenTemplate?.id || null });
      if (gordenStyle) {
        const mergedStyle = [gordenStyle, templateStyle.trim()].filter(Boolean).join('\n');
        await updateProject(projectId, { template_style: mergedStyle });
        setTemplateStyle(mergedStyle);
      }
      await syncProject(projectId);
      setIsTemplateModalOpen(false);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });

      // 更新选择状态
      if (templateId) {
        // 判断是用户模板还是预设模板（短ID通常是预设模板）
        if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
          setSelectedPresetTemplateId(templateId);
          setSelectedTemplateId(null);
        } else {
          setSelectedTemplateId(templateId);
          setSelectedPresetTemplateId(null);
        }
      }
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  if (!currentProject) {
    return <Loading fullscreen message={t('preview.messages.loadingProject')} />;
  }

  if ((currentProject as typeof currentProject & { render_mode?: string }).render_mode === 'native') {
    const nativeSlides = buildNativeProjectSlides(
      currentProject,
      layoutManifest.layouts as unknown as readonly NativeLayoutContract[],
    );
    const nativeProjectId = projectId || currentProject.id || currentProject.project_id;
    const generationTaskId = (location.state as { taskId?: string } | null)?.taskId
      || localStorage.getItem(getNativeDeckTaskStorageKey(nativeProjectId));

    return (
      <NativeDeckWorkspaceLoader
        projectId={nativeProjectId}
        slides={nativeSlides}
        totalPages={currentProject.pages.length}
        generationTaskId={generationTaskId || undefined}
      />
    );
  }

  if (isGlobalLoading) {
    // 根据任务进度显示不同的消息
    let loadingMessage = t('preview.messages.processing');
    if (taskProgress && typeof taskProgress === 'object') {
      const progressData = taskProgress as any;
      if (progressData.current_step) {
        // 使用后端提供的当前步骤信息
        const stepMap: Record<string, string> = {
          'Generating clean backgrounds': t('preview.messages.generatingBackgrounds'),
          'Creating PDF': t('preview.messages.creatingPdf'),
          'Parsing with MinerU': t('preview.messages.parsingContent'),
          'Creating editable PPTX': t('preview.messages.creatingPptx'),
          'Complete': t('preview.messages.complete')
        };
        loadingMessage = stepMap[progressData.current_step] || progressData.current_step;
      }
      // 不再显示 "处理中 (X/Y)..." 格式，百分比已在进度条显示
    }

    return (
      <Loading
        fullscreen
        message={loadingMessage}
        progress={taskProgress || undefined}
      />
    );
  }

  const selectedPage = currentProject.pages[selectedIndex];
  const selectedTemplateContextImage = selectedPage?.template_image_path || currentProject.template_image_path;
  const selectedTemplateContextUpdatedAt = selectedPage?.template_image_path ? selectedPage.updated_at : currentProject.updated_at;
  const imageUrl = selectedPage?.generated_image_path
    ? getImageUrl(selectedPage.generated_image_path, selectedPage.updated_at)
    : '';

  const exportRangePages = isMultiSelectMode && selectedPageIds.size > 0
    ? currentProject.pages.filter((page) => {
        const pageId = page.id || page.page_id;
        return pageId ? selectedPageIds.has(pageId) : false;
      })
    : currentProject.pages;
  const exportMissingImageCount = exportRangePages.filter(p => !p.generated_image_path).length;
  const exportRangeHasAllImages = exportRangePages.length > 0 && exportMissingImageCount === 0;
  const exportRangeMissingTip = exportMissingImageCount > 0
    ? t('preview.disabledExportTip', { count: exportMissingImageCount })
    : undefined;
  const videoFishConfigReady = videoNarrationMode === 'single'
    ? Boolean(videoFishVoice)
    : videoFishSpeakers.length >= 2
      && videoFishSpeakers.length <= 4
      && videoFishSpeakers.every(speaker => speaker.name.trim() && speaker.voice);
  const videoExportConfigReady = videoTtsProvider === 'edge' || videoFishConfigReady;
  const isEnglishUi = i18n.language?.startsWith('en');
  const getNarrationOptionLabel = (options: Array<{ value: string; zh: string; en: string }>, value: string) => {
    const match = options.find(item => item.value === value);
    return match ? (isEnglishUi ? match.en : match.zh) : value;
  };
  const narrationSummary = [
    videoNarrationConfig.presentation_topic,
    `${t('preview.videoNarrationPersona')} · ${getNarrationOptionLabel(NARRATION_PERSONA_OPTIONS, videoNarrationConfig.speaker_persona)}`,
    `${t('preview.videoNarrationAudience')} · ${getNarrationOptionLabel(NARRATION_AUDIENCE_OPTIONS, videoNarrationConfig.target_audience)}`,
    `${t('preview.videoNarrationTone')} · ${getNarrationOptionLabel(NARRATION_TONE_OPTIONS, videoNarrationConfig.speech_tone)}`,
    videoNarrationMode === 'dialogue'
      ? (videoTtsProvider === 'fish_audio' ? `${videoFishSpeakers.length} 人对话` : '双人对话')
      : '单人讲解',
  ].filter(Boolean).join(' / ');

  const selectedDescriptionText = selectedPage?.description_content
    ? 'text' in selectedPage.description_content
      ? String(selectedPage.description_content.text || '')
      : 'text_content' in selectedPage.description_content && Array.isArray(selectedPage.description_content.text_content)
        ? selectedPage.description_content.text_content.join('\n')
        : ''
    : '';
  const selectedDescriptionImageUrls = extractImageUrlsFromDescription(selectedPage?.description_content);
  const selectedDescriptionPlainText = selectedDescriptionText
    .replace(/<div\b[^>]*>\s*<img\b[^>]*>\s*<\/div>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/!\[.*?\]\((.*?)\)/g, '')
    .trim();

  const imageInspector = (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 flex h-11 items-center border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4">
        <h2 className="text-sm font-semibold">页面属性</h2>
      </div>
      <div className="divide-y divide-[var(--app-border)]">
        <section className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">当前页面</h3>
            <span className="text-xs text-[var(--app-text-tertiary)]">
              {currentProject.pages.length > 0 ? `${selectedIndex + 1} / ${currentProject.pages.length}` : '0 / 0'}
            </span>
          </div>
          <div className="space-y-1">
            <p className="truncate text-sm font-medium" title={selectedPage?.outline_content?.title || ''}>
              {selectedPage?.outline_content?.title || t('preview.noPageSelected')}
            </p>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {isRenovationProject && selectedPage?.status !== 'COMPLETED'
                ? '原页已导入，等待翻新'
                : selectedPage?.generated_image_path
                  ? '图片已生成'
                  : selectedPage?.status === 'FAILED' ? '当前图片生成失败' : '等待生成图片'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" aria-label="页面属性：编辑当前页" onClick={() => handleEditPage()} disabled={!selectedPage}>{t('common.edit')}</Button>
            <Button variant="ghost" size="sm" aria-label="页面属性：重新生成当前页" onClick={handleRegeneratePage} disabled={selectedPage?.id ? Boolean(pageGeneratingTasks[selectedPage.id]) : false}>{t('preview.regenerate')}</Button>
          </div>
        </section>

        <section className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">本页模板</h3>
              <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">优先用于当前页生成</p>
            </div>
            {selectedPage?.template_image_path && (
              <img
                src={getImageUrl(selectedPage.template_image_path, selectedPage.updated_at)}
                alt="本页模板"
                className="h-10 w-16 rounded-[var(--app-radius-control)] border border-[var(--app-border)] object-cover"
              />
            )}
          </div>
          <Textarea
            aria-label="本页模板风格"
            value={pageTemplateStyle}
            onChange={(event) => setPageTemplateStyle(event.target.value)}
            placeholder="例如：延续这页的色彩、版式、组件密度或视觉层级"
            rows={3}
            className="min-h-20 resize-none text-xs leading-5"
          />
          {selectedPage?.template_selection_role && (
            <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">
              智能匹配：{selectedPage.template_selection_role} / {selectedPage.template_selection_layout || 'auto'}
            </p>
          )}
          <input
            ref={pageTemplateInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadPageTemplate}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAutoMatchPageTemplates}
            disabled={!currentProject.pages.length || isSavingPageTemplate}
          >
            智能匹配全部
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload size={14} />}
              onClick={() => pageTemplateInputRef.current?.click()}
              disabled={!selectedPage || isSavingPageTemplate}
            >
              上传
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSavePageTemplateStyle}
              disabled={!selectedPage || isSavingPageTemplate}
            >
              保存
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={handleClearPageTemplate}
              disabled={!selectedPage || isSavingPageTemplate || (!selectedPage.template_image_path && !selectedPage.template_style_text)}
            >
              清除
            </Button>
          </div>
        </section>

        <section className="space-y-3 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">项目硬性要求</h3>
            <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">应用于所有页面的内容、品牌或合规要求</p>
          </div>
          <Textarea
            aria-label="项目硬性要求"
            value={extraRequirements}
            onChange={(event) => {
              isEditingRequirements.current = true;
              setExtraRequirements(event.target.value);
            }}
            placeholder="例如：品牌名必须写作 EasySlide；所有数据必须来自页面描述"
            rows={4}
            className="min-h-24 resize-none text-xs leading-5"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSaveExtraRequirements}
            disabled={isSavingRequirements}
            className="w-full"
          >
            {isSavingRequirements ? '保存中...' : '保存项目要求'}
          </Button>
        </section>

        <section data-testid="preview-page-outline" className="w-full min-w-0 max-w-full space-y-3 overflow-hidden p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">页面大纲</h3>
            {!isInspectorOutlineEditing && (
              <Button variant="ghost" size="sm" onClick={handleStartInspectorOutlineEdit} disabled={!selectedPage}>
                编辑大纲
              </Button>
            )}
          </div>
          {isInspectorOutlineEditing ? (
            <div className="space-y-3">
              <input
                aria-label="页面大纲标题"
                type="text"
                value={inspectorOutlineTitle}
                onChange={(event) => setInspectorOutlineTitle(event.target.value)}
                className="w-full min-w-0 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none focus:border-[var(--app-accent)]"
                placeholder="页面标题"
              />
              <textarea
                aria-label="页面大纲要点"
                value={inspectorOutlinePoints}
                onChange={(event) => setInspectorOutlinePoints(event.target.value)}
                rows={6}
                className="w-full min-w-0 resize-y rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs leading-5 text-[var(--app-text-primary)] outline-none focus:border-[var(--app-accent)]"
                placeholder="每行输入一个要点"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsInspectorOutlineEditing(false)}>取消</Button>
                <Button variant="primary" size="sm" onClick={handleSaveInspectorOutline}>保存</Button>
              </div>
            </div>
          ) : selectedPage?.outline_content?.points?.length ? (
            <ul className="min-w-0 max-w-full space-y-1.5 text-xs leading-5 text-[var(--app-text-secondary)]">
              {selectedPage.outline_content.points.map((point, index) => <li key={`${index}-${point}`} className="flex min-w-0 max-w-full gap-2"><span aria-hidden="true">•</span><span className="min-w-0 break-words">{point}</span></li>)}
            </ul>
          ) : <p className="text-xs text-[var(--app-text-tertiary)]">暂无大纲内容</p>}
        </section>

        <section data-testid="preview-page-description" className="w-full min-w-0 max-w-full space-y-3 overflow-hidden p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">页面描述</h3>
            {!isInspectorDescriptionEditing && (
              <Button variant="ghost" size="sm" onClick={handleStartInspectorDescriptionEdit} disabled={!selectedPage}>
                编辑描述
              </Button>
            )}
          </div>
          {isInspectorDescriptionEditing ? (
            <div className="space-y-3">
              <textarea
                aria-label="页面描述内容"
                value={inspectorDescription}
                onChange={(event) => setInspectorDescription(event.target.value)}
                rows={9}
                className="w-full min-w-0 resize-y rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs leading-5 text-[var(--app-text-primary)] outline-none focus:border-[var(--app-accent)]"
                placeholder="输入页面描述"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsInspectorDescriptionEditing(false)}>取消</Button>
                <Button variant="primary" size="sm" onClick={handleSaveInspectorDescription}>保存</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="min-w-0 max-w-full whitespace-pre-wrap break-words text-xs leading-5 text-[var(--app-text-secondary)]">
                {selectedDescriptionPlainText || '暂无文字描述'}
              </p>
              {selectedDescriptionImageUrls.length > 0 && (
                <div className="grid min-w-0 max-w-full grid-cols-2 gap-2">
                  {selectedDescriptionImageUrls.map((url) => (
                    <img
                      key={url}
                      src={getImageUrl(url)}
                      alt="页面素材"
                      className="aspect-video w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] object-cover"
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<ImagePlus size={15} />}
            onClick={() => setIsMaterialSelectorOpen(true)}
            className="w-full justify-start"
          >
            素材管理{selectedDescriptionImageUrls.length > 0 ? ' (' + selectedDescriptionImageUrls.length + ')' : ''}
          </Button>
        </section>
      </div>
    </div>
  );


  const imageRail = (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--app-surface-muted)]">
          <div className="p-3 md:p-4 border-b border-[var(--app-border)] flex-shrink-0 space-y-2 md:space-y-3 md:sticky md:top-0 md:z-10">
            <Button
              variant="primary"
              icon={imageGenerationActive
                ? imageGenerationPaused
                  ? <Play size={16} className="md:h-[18px] md:w-[18px]" />
                  : <Pause size={16} className="md:h-[18px] md:w-[18px]" />
                : <Sparkles size={16} className="md:h-[18px] md:w-[18px]" />}
              onClick={imageGenerationActive
                ? imageGenerationPaused
                  ? resumeImageGeneration
                  : pauseImageGeneration
                : handleGenerateAll}
              className="w-full text-sm md:text-base"
              disabled={!imageGenerationActive && (pendingBatchImageCount === 0 || (isMultiSelectMode && selectedPageIds.size === 0))}
            >
              {imageGenerationActive
                ? imageGenerationPaused
                  ? t('preview.resumeGeneration')
                  : t('preview.pauseGeneration')
                : isMultiSelectMode && selectedPageIds.size > 0
                  ? t('preview.generateSelected', { count: pendingBatchImageCount })
                  : t('preview.batchGenerate', { count: pendingBatchImageCount })}
            </Button>
            <Button
              variant="secondary"
              icon={<Settings size={15} />}
              onClick={openImageGenerationSettings}
              className="w-full text-xs md:text-sm"
            >
              图片生成设置
            </Button>
          </div>
          {/* 多选模式切换 - 固定在缩略图滚动区外 */}
          <div
            data-testid="slide-multiselect-toolbar"
            className="flex shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-3 text-xs md:px-4"
          >
              <button
                onClick={toggleMultiSelectMode}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  isMultiSelectMode
                    ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]'
                    : 'text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)]'
                }`}
              >
                {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}</span>
              </button>
              {isMultiSelectMode && (
                <>
                  <button
                    onClick={selectedPageIds.size === selectablePages.length ? deselectAllPages : selectAllPages}
                    className="text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-accent)]"
                  >
                    {selectedPageIds.size === selectablePages.length ? t('common.deselectAll') : t('common.selectAll')}
                  </button>
                  {selectedPageIds.size > 0 && (
                    <span className="font-medium text-[var(--app-accent)]">
                      ({selectedPageIds.size}{t('preview.pagesUnit')})
                    </span>
                  )}
                </>
              )}
          </div>

          {/* 缩略图列表：桌面端垂直，移动端横向滚动 */}
          <div
            data-testid="slide-thumbnail-scroll"
            className="flex-1 overflow-y-auto md:overflow-y-auto overflow-x-auto md:overflow-x-visible p-3 md:p-4 min-h-0"
          >
            <div className="flex md:flex-col gap-2 md:gap-4 min-w-max md:min-w-0">
              {currentProject.pages.map((page, index) => (
                <div key={page.id} className="md:w-full flex-shrink-0 relative">
                  {/* 移动端：简化缩略图 */}
                  <div className="md:hidden relative">
                    <button
                      onClick={() => {
                        if (isMultiSelectMode && page.id && page.generated_image_path) {
                          togglePageSelection(page.id);
                        } else {
                          setSelectedIndex(index);
                        }
                      }}
                      className={`w-20 h-14 rounded border-2 transition-all ${
                        selectedIndex === index
                          ? 'border-[var(--app-accent)] shadow-[var(--app-shadow-card)]'
                          : 'border-[var(--app-border)]'
                      } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-[var(--app-accent-soft)]' : ''}`}
                    >
                      {page.generated_image_path ? (
                        <img
                          src={getImageUrl(page.generated_image_path, page.updated_at)}
                          alt={`Slide ${index + 1}`}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--app-surface-muted)] rounded flex items-center justify-center text-xs text-[var(--app-text-muted)]">
                          {index + 1}
                        </div>
                      )}
                    </button>
                    {/* 多选复选框（移动端） */}
                    {isMultiSelectMode && page.id && (
                      <button
                        aria-label={`${selectedPageIds.has(page.id) ? '取消选择' : '选择'}第 ${index + 1} 页`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePageSelection(page.id!);
                        }}
                        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          selectedPageIds.has(page.id)
                            ? 'bg-[var(--app-focus)] text-[var(--app-surface)]'
                            : 'border-2 border-[var(--app-border)] bg-[var(--app-surface)]'
                        }`}
                      >
                        {selectedPageIds.has(page.id) && <Check size={12} />}
                      </button>
                    )}
                  </div>
                  {/* 桌面端：完整卡片 */}
                  <div className="hidden md:block relative">
                    {/* 多选复选框（桌面端） */}
                    {isMultiSelectMode && page.id && (
                      <button
                        aria-label={`${selectedPageIds.has(page.id) ? '取消选择' : '选择'}第 ${index + 1} 页`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePageSelection(page.id!);
                        }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ${
                          selectedPageIds.has(page.id)
                            ? 'bg-[var(--app-focus)] text-[var(--app-surface)] shadow-[var(--app-shadow-card)]'
                            : 'border-2 border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-accent)]'
                        }`}
                      >
                        {selectedPageIds.has(page.id) && <Check size={14} />}
                      </button>
                    )}
                    <SlideCard
                      page={page}
                      index={index}
                      isSelected={selectedIndex === index}
                      isMultiSelectMode={isMultiSelectMode}
                      onSelect={handleSlideCardSelect}
                      onEdit={handleSlideCardEdit}
                      onDelete={handleSlideCardDelete}
                      isGenerating={page.id ? !!pageGeneratingTasks[page.id] : false}
                      aspectRatio={aspectRatio}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text)]">
      {/* 顶栏 */}
      <WorkspaceToolbar className="justify-between px-3 md:px-4">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <div className="hidden md:flex flex-col leading-tight min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm md:text-lg font-semibold truncate">{t('preview.title')}</span>
                <span className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                  {t('preview.workflowStage')}
                </span>
              </div>
              <span className="text-[11px] text-[var(--app-text-tertiary)] truncate">{t('preview.workflowHint')}</span>
            </div>
        </div>
        <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsProjectSettingsOpen(true)}
              className="hidden lg:inline-flex"
            >
              <span className="hidden xl:inline">{t('preview.projectSettings')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Upload size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => { setDraftTemplateStyle(templateStyle); setIsTemplateModalOpen(true); }}
              className="hidden lg:inline-flex"
            >
              <span className="hidden xl:inline">{t('preview.changeTemplate')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsMaterialModalOpen(true)}
              className="hidden lg:inline-flex"
            >
              <span className="hidden xl:inline">{t('nav.materialGenerate')}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate(`/project/${projectId}/ppt/detail`)}
              className="hidden sm:inline-flex"
            >
              <span className="hidden md:inline">{t('common.previous')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="hidden md:inline-flex"
            >
              <span className="hidden lg:inline">{t('preview.refresh')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<FileText size={16} className="md:h-[18px] md:w-[18px]" />}
              onClick={() => setShowNarrationWorkbench(true)}
              className="hidden md:inline-flex"
            >
              <span className="hidden xl:inline">视频文案</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Film size={16} className="md:h-[18px] md:w-[18px]" />}
              onClick={() => setShowPptToVideoWizard(true)}
              className="hidden md:inline-flex"
            >
              <span className="hidden xl:inline">转换视频</span>
            </Button>

          {/* 导出任务按钮 — 始终显示，面板内部决定是否有内容 */}
          <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                title={t('preview.exportTasks')}
                aria-label={t('preview.exportTasks')}
                onClick={() => {
                  setShowExportTasksPanel(!showExportTasksPanel);
                  setShowExportMenu(false);
                }}
                className="relative"
              >
                {exportTasks.filter(t => t.projectId === projectId && (t.status === 'PROCESSING' || t.status === 'RUNNING' || t.status === 'PENDING' || t.status === 'PAUSED')).length > 0 ? (
                  <Loader2 size={16} className="animate-spin text-[var(--app-accent)]" />
                ) : (
                  <FileText size={16} />
                )}
                {exportTasks.filter(t => t.projectId === projectId).length > 0 && (
                  <span className="ml-1 text-xs">
                    {exportTasks.filter(t => t.projectId === projectId).length}
                  </span>
                )}
              </Button>
              {showExportTasksPanel && (
                <div className="absolute right-0 mt-2 z-20">
                  <ExportTasksPanel
                    projectId={projectId}
                    pages={currentProject?.pages || []}
                    onRetry={handleRetryExport}
                    className="w-96 max-h-[28rem] shadow-[var(--app-shadow-floating)]"
                  />
                </div>
              )}
            </div>

          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              icon={<Download size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => {
                setShowExportMenu(!showExportMenu);
                setShowExportTasksPanel(false);
              }}
              disabled={isMultiSelectMode && selectedPageIds.size === 0}
              title={exportRangeMissingTip}
              className="text-xs md:text-sm"
            >
              <span className="hidden sm:inline">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `${t('preview.export')} (${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
              <span className="sm:hidden">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `(${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] py-2 shadow-[var(--app-shadow-soft)]">
                {isMultiSelectMode && selectedPageIds.size > 0 && (
                  <div className="border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--app-text-tertiary)]">
                    {t('preview.exportSelectedPages', { count: selectedPageIds.size })}
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    setShowPptxExportDialog(true);
                  }}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('preview.exportPptx')}
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    setShowEditablePptxDialog(true);
                  }}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('preview.exportEditablePptx')}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('preview.exportPdf')}
                </button>
                <button
                  onClick={() => handleExport('images')}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('preview.exportImages')}
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    setVideoIncludeNoImage(false);
                    if (!projectId) return;
                    void getProjectNarrations(projectId).then(response => {
                      if (response.data) setVideoNarrationSummary(response.data);
                    }).catch(() => undefined);
                    setShowVideoExportDialog(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-hover)]"
                >
                  {t('preview.exportVideo')}
                </button>
              </div>
            )}
          </div>
        </div>
      </WorkspaceToolbar>

      {/* PPTX 导出设置弹窗 */}
      {showPptxExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--app-surface)]/80" onClick={() => setShowPptxExportDialog(false)}>
          <div className="mx-4 w-full max-w-xl rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-[var(--app-shadow-soft)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{t('preview.pptxExportTitle')}</h3>
            <p className="mb-5 mt-1 text-sm text-[var(--app-text-tertiary)]">{t('preview.pptxExportSubtitle')}</p>

            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--app-radius-card)] p-3 hover:bg-[var(--app-surface-hover)]">
                <input
                  type="checkbox"
                  checked={pptxTransitionsEnabled}
                  onChange={e => setPptxTransitionsEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[color:var(--app-accent-soft)]"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('preview.pptxTransitionToggle')}</div>
                  <div className="mt-1 text-xs text-[var(--app-text-tertiary)]">{t('preview.pptxTransitionDesc')}</div>
                </div>
              </label>

              {pptxTransitionsEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PPTX_TRANSITION_OPTIONS.map(option => {
                    const checked = pptxTransitionEffects.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                          checked
                            ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
                            : 'border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setPptxTransitionEffects(prev => {
                              if (e.target.checked) {
                                return prev.includes(option.value) ? prev : [...prev, option.value];
                              }
                              return prev.filter(effect => effect !== option.value);
                            });
                          }}
                          className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[color:var(--app-accent-soft)]"
                        />
                        <span>{t(`preview.${option.labelKey}`)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {pptxTransitionsEnabled && pptxTransitionEffects.length === 0 && (
                <div className="px-1 text-xs text-[var(--app-error)]">
                  {t('preview.pptxTransitionRequired')}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPptxExportDialog(false)}
                className="rounded-[var(--app-radius-control)] px-4 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]"
              >
                {t('preview.pptxCancel')}
              </button>
              <button
                onClick={() => {
                  setShowPptxExportDialog(false);
                  handleExport('pptx', {
                    pptxTransitionEnabled: pptxTransitionsEnabled,
                    pptxTransitionEffects,
                  });
                }}
                disabled={pptxTransitionsEnabled && pptxTransitionEffects.length === 0}
                className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-4 py-2 text-sm text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('preview.pptxStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 视频导出设置弹窗 */}
      {showVideoExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--app-surface)]/80" onClick={() => setShowVideoExportDialog(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="video-export-title" className="max-h-[88vh] w-[560px] max-w-[96vw] overflow-y-auto rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-[var(--app-shadow-soft)]" onClick={e => e.stopPropagation()}>
            <h3 id="video-export-title" className="text-lg font-semibold">{t('preview.videoExportTitle')}</h3>
            <p className="mb-5 mt-1 text-sm text-[var(--app-text-tertiary)]">{t('preview.videoExportSubtitle')}</p>
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-secondary)] px-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-[var(--app-text)]">视频文案</p>
                  <p className="truncate text-xs text-[var(--app-text-tertiary)]">
                    已确认 {videoNarrationSummary?.confirmed_pages ?? '—'} 页 · 缺失 {videoNarrationSummary?.missing_pages ?? '—'} 页 · 候选 {videoNarrationSummary?.candidate_pages ?? '—'} 页
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setShowVideoExportDialog(false); setShowNarrationWorkbench(true); }}>
                  编辑视频文案
                </Button>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('preview.videoDirectorPreset')}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VIDEO_DIRECTOR_PRESETS.map(({ value: preset, labelKey }) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={videoDirectorConfig.preset === preset}
                      onClick={() => applyVideoDirectorPreset(preset)}
                      className={`min-h-10 px-3 py-2 text-sm border rounded-lg transition-colors ${
                        videoDirectorConfig.preset === preset
                          ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
                          : 'border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-accent)]'
                      }`}
                    >
                      {t(`preview.${labelKey}`)}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" aria-expanded={showVideoAdvancedSettings} onClick={() => setShowVideoAdvancedSettings((value) => !value)} className="flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]">
                <ChevronDown size={15} className={`transition-transform ${showVideoAdvancedSettings ? 'rotate-180' : ''}`} aria-hidden="true" />
                {showVideoAdvancedSettings ? t('preview.videoAdvancedCollapse') : t('preview.videoAdvancedOpen')}
              </button>
              {showVideoAdvancedSettings && (
                <>
              <div className="space-y-2">
                <div className="text-sm font-medium">语音引擎</div>
                <SegmentedControl
                  ariaLabel="语音引擎"
                  options={[
                    { value: 'edge', label: 'Edge 免费语音' },
                    { value: 'fish_audio', label: 'Fish Audio s2.1-pro-free' },
                  ]}
                  value={videoTtsProvider}
                  onChange={setVideoTtsProvider}
                  className="grid w-full grid-cols-2"
                />
              </div>
              <div className="space-y-4 rounded-[var(--app-radius-card)] border border-[var(--app-border)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{t('preview.videoNarrationPresetTitle')}</div>
                    <div className="mt-1 text-xs text-[var(--app-text-tertiary)]">{t('preview.videoNarrationAdvancedHint')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVideoShowAdvancedNarration(prev => !prev)}
                    className="text-sm text-[var(--app-accent)] hover:text-[var(--app-accent-strong)]"
                  >
                    {videoShowAdvancedNarration ? t('preview.videoNarrationCollapse') : t('preview.videoNarrationAdvanced')}
                  </button>
                </div>
                <div className="h-24 overflow-y-auto break-words rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-2 pr-2 text-sm leading-6 text-[var(--app-text-secondary)]">
                  <span className="font-medium mr-2">{t('preview.videoNarrationSummaryLabel')}</span>
                  <span>{narrationSummary}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block text-sm font-medium">
                    <span className="block mb-1.5">旁白模式</span>
                    <select
                      aria-label="旁白模式"
                      value={videoNarrationMode}
                      onChange={e => setVideoNarrationMode(e.target.value as 'single' | 'dialogue')}
                      className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                    >
                      <option value="single">单人讲解</option>
                      <option value="dialogue">{videoTtsProvider === 'fish_audio' ? '多人对话（2-4 人）' : '双人对话（主持人 + 专家）'}</option>
                    </select>
                  </label>
                  {videoNarrationMode === 'dialogue' && (
                    videoTtsProvider === 'fish_audio' ? (
                      <div className="space-y-3 md:col-span-2">
                        {videoFishSpeakers.map((speaker, index) => (
                          <div key={speaker.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px]">
                            <label className="block text-sm font-medium">
                              <span className="block mb-1.5">角色 {index + 1}</span>
                              <input
                                aria-label={`角色 ${index + 1} 名称`}
                                value={speaker.name}
                                onChange={event => setVideoFishSpeakers(previous => previous.map(item => item.id === speaker.id ? { ...item, name: event.target.value } : item))}
                                className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                              />
                            </label>
                            <label className="block text-sm font-medium">
                              <span className="block mb-1.5">私有声线</span>
                              <select
                                aria-label={`角色 ${index + 1} 私有声线`}
                                value={speaker.voice}
                                onChange={event => setVideoFishSpeakers(previous => previous.map(item => item.id === speaker.id ? { ...item, voice: event.target.value } : item))}
                                disabled={videoFishVoicesLoading || videoFishVoices.length === 0}
                                className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)] disabled:opacity-50"
                              >
                                {videoFishVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.title}</option>)}
                              </select>
                            </label>
                            <button
                              type="button"
                              aria-label={`删除角色 ${index + 1}`}
                              title="删除角色"
                              disabled={videoFishSpeakers.length <= 2}
                              onClick={() => setVideoFishSpeakers(previous => previous.filter(item => item.id !== speaker.id))}
                              className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Plus size={15} aria-hidden="true" />}
                          disabled={videoFishSpeakers.length >= 4 || videoFishVoices.length === 0}
                          onClick={() => setVideoFishSpeakers(previous => [
                            ...previous,
                            {
                              id: `speaker-${Date.now()}`,
                              name: `角色 ${previous.length + 1}`,
                              voice: videoFishVoices[previous.length % videoFishVoices.length]?.id || '',
                            },
                          ])}
                        >
                          添加角色
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {videoNarrationSpeakers.map(speaker => (
                          <label key={speaker.id} className="block text-sm font-medium">
                            <span className="block mb-1.5">{speaker.name}音色</span>
                            <select
                              aria-label={`${speaker.name}音色`}
                              value={speaker.voice}
                              onChange={e => setVideoNarrationSpeakers(previous => previous.map(item => item.id === speaker.id ? { ...item, voice: e.target.value } : item))}
                              className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                            >
                              {VIDEO_VOICE_OPTIONS.flatMap(group => group.voices).map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationPersona')}</label>
                    <select
                      value={videoNarrationConfig.speaker_persona}
                      onChange={e => setVideoNarrationConfig(prev => ({ ...prev, speaker_persona: e.target.value }))}
                      className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                    >
                      {NARRATION_PERSONA_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {isEnglishUi ? option.en : option.zh}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationAudience')}</label>
                    <select
                      value={videoNarrationConfig.target_audience}
                      onChange={e => setVideoNarrationConfig(prev => ({ ...prev, target_audience: e.target.value }))}
                      className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                    >
                      {NARRATION_AUDIENCE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {isEnglishUi ? option.en : option.zh}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationTone')}</label>
                    <select
                      value={videoNarrationConfig.speech_tone}
                      onChange={e => setVideoNarrationConfig(prev => ({ ...prev, speech_tone: e.target.value }))}
                      className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                    >
                      {NARRATION_TONE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {isEnglishUi ? option.en : option.zh}
                        </option>
                      ))}
                    </select>
                  </div>
                  {videoNarrationMode === 'single' && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{t('preview.videoVoiceLabel')}</label>
                      <select
                        aria-label={videoTtsProvider === 'fish_audio' ? 'Fish Audio 私有声线' : t('preview.videoVoiceLabel')}
                        value={videoTtsProvider === 'fish_audio' ? videoFishVoice : videoVoice}
                        onChange={e => videoTtsProvider === 'fish_audio' ? setVideoFishVoice(e.target.value) : setVideoVoice(e.target.value)}
                        disabled={videoTtsProvider === 'fish_audio' && (videoFishVoicesLoading || videoFishVoices.length === 0)}
                        className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)] disabled:opacity-50"
                      >
                        {videoTtsProvider === 'fish_audio' ? videoFishVoices.map(voice => (
                          <option key={voice.id} value={voice.id}>{voice.title}</option>
                        )) : VIDEO_VOICE_OPTIONS.map(group => (
                          <optgroup key={group.group} label={group.group}>
                            {group.voices.map(v => (
                              <option key={v.id} value={v.id}>{v.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {videoTtsProvider === 'fish_audio' && videoFishVoicesLoading && (
                        <p className="mt-1 text-xs text-[var(--app-text-tertiary)]" aria-live="polite">正在加载私有声线...</p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1.5 flex items-center justify-between">
                      <span>{t('preview.videoSpeedLabel')}</span>
                      <span className="font-mono text-xs text-[var(--app-text-tertiary)]">{videoSpeed.toFixed(2)}×</span>
                    </label>
                    <input
                      type="range"
                      min={0.7}
                      max={1.2}
                      step={0.05}
                      value={videoSpeed}
                      onChange={e => setVideoSpeed(parseFloat(e.target.value))}
                      className="w-full accent-[var(--app-accent)]"
                    />
                    <p className="mt-1 text-xs text-[var(--app-text-tertiary)]">{t('preview.videoSpeedHint')}</p>
                  </div>
                </div>
                {videoTtsProvider === 'fish_audio' && (
                  <div className="space-y-3">
                    {videoFishVoicesError && (
                      <div className="rounded-[var(--app-radius-control)] border border-[var(--app-danger)]/30 bg-[var(--app-danger)]/5 px-3 py-2 text-sm text-[var(--app-danger)]" role="alert">
                        {videoFishVoicesError}
                      </div>
                    )}
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={videoAutoEmotion}
                        onChange={event => setVideoAutoEmotion(event.target.checked)}
                        className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[color:var(--app-accent-soft)]"
                      />
                      <span className="text-sm">自动匹配场景语气</span>
                    </label>
                    <FishNarrationAdvancedPanel
                      autoEmotion={videoAutoEmotion}
                      pronunciationLexicon={videoPronunciationLexicon}
                      narrationPreferences={videoNarrationPreferences}
                      onVoiceChange={(voice) => videoNarrationMode === 'single'
                        ? setVideoFishVoice(voice)
                        : setVideoFishSpeakers((current) => current.map((speaker, index) => index === 0 ? { ...speaker, voice } : speaker))}
                      onSpeedChange={setVideoSpeed}
                      onPronunciationLexiconChange={setVideoPronunciationLexicon}
                      onNarrationPreferencesChange={setVideoNarrationPreferences}
                    />
                  </div>
                )}
                {videoShowAdvancedNarration && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationTopic')}</label>
                      <input
                        type="text"
                        value={videoNarrationConfig.presentation_topic}
                        onChange={e => setVideoNarrationConfig(prev => ({ ...prev, presentation_topic: e.target.value }))}
                        placeholder={t('preview.videoNarrationTopicPlaceholder')}
                        className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationMinWords')}</label>
                        <input
                          type="number"
                          min={30}
                          max={300}
                          value={videoNarrationConfig.min_words}
                          onChange={e => setVideoNarrationConfig(prev => ({ ...prev, min_words: Number(e.target.value) || 30 }))}
                          className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{t('preview.videoNarrationMaxWords')}</label>
                        <input
                          type="number"
                          min={30}
                          max={300}
                          value={videoNarrationConfig.max_words}
                          onChange={e => setVideoNarrationConfig(prev => ({ ...prev, max_words: Number(e.target.value) || 30 }))}
                          className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoEnableKenBurns}
                    onChange={e => setVideoEnableKenBurns(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[color:var(--app-accent-soft)]"
                  />
                  <span className="text-sm">{t('preview.videoEnableKenBurns')}</span>
                  <span className="relative group">
                    <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-[var(--app-surface-hover)] text-[10px] text-[var(--app-text-tertiary)]">?</span>
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 text-xs text-[var(--app-surface)] bg-[var(--app-text)] rounded-[var(--app-radius-control)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                      {t('preview.videoKenBurnsTip')}
                    </span>
                  </span>
                </label>
                {videoEnableKenBurns && (
                  <div className="pl-7">
                    <label className="mb-1.5 block text-xs font-medium text-[var(--app-text-tertiary)]">
                      {t('preview.videoKenBurnsStyle')}
                    </label>
                    <select
                      aria-label={t('preview.videoKenBurnsStyle')}
                      value={videoKenBurnsStyle}
                      onChange={e => setVideoKenBurnsStyle(e.target.value as 'auto' | 'zoom' | 'pan')}
                      className="w-full max-w-xs rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                    >
                      <option value="auto">{t('preview.videoKenBurnsStyleAuto')}</option>
                      <option value="zoom">{t('preview.videoKenBurnsStyleZoom')}</option>
                      <option value="pan">{t('preview.videoKenBurnsStylePan')}</option>
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoIncludeNoImage}
                    onChange={e => setVideoIncludeNoImage(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[color:var(--app-accent-soft)]"
                  />
                  <span className="text-sm">{t('preview.videoIncludeNoImage')}</span>
                </label>
                {!exportRangeHasAllImages && (
                  <div className="rounded-[8px] border border-[var(--app-error)]/25 bg-[var(--app-error)]/10 px-3 py-2 text-sm text-[var(--app-error)]">
                    {t('preview.videoMissingImagesWarning', { count: exportMissingImageCount })}
                  </div>
                )}
              </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowVideoExportDialog(false)}
                className="rounded-[var(--app-radius-control)] px-4 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]"
              >
                {t('preview.videoCancel')}
              </button>
              <button
                onClick={() => { setShowVideoExportDialog(false); handleExport('video'); }}
                disabled={(!exportRangeHasAllImages && !videoIncludeNoImage) || !videoExportConfigReady}
                title={!exportRangeHasAllImages && !videoIncludeNoImage
                  ? exportRangeMissingTip
                  : !videoExportConfigReady
                    ? '请完成 Fish Audio 声线配置'
                    : undefined}
                className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-4 py-2 text-sm text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('preview.videoStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditablePptxDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-backdrop)] p-4" onClick={() => setShowEditablePptxDialog(false)}>
          <div className="w-full max-w-md rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-[var(--app-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{t('preview.editablePptxDialogTitle')}</h3>
            <p className="mb-5 mt-1 text-sm text-[var(--app-text-secondary)]">{t('preview.editablePptxDialogSubtitle')}</p>
            {(() => {
              const totalPages = currentProject?.pages?.length ?? 0;
              const isPartial = isMultiSelectMode && selectedPageIds.size > 0;
              const selectedNumbers = isPartial && currentProject
                ? currentProject.pages
                    .map((p, i) => ({ id: p.id, num: i + 1 }))
                    .filter(({ id }) => id && selectedPageIds.has(id))
                    .map(({ num }) => num)
                : [];
              const rangeText = isPartial
                ? t('preview.editablePptxRangePages', { pages: selectedNumbers.join(', '), count: selectedNumbers.length })
                : t('preview.editablePptxRangeAll', { count: totalPages });
              return (
                <div className="mt-3 flex items-start gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--app-text-secondary)]">{t('preview.editablePptxRangeLabel')}</div>
                    <div className="text-sm mt-0.5 break-words">{rangeText}</div>
                  </div>
                  <span className="flex-shrink-0 cursor-help text-[var(--app-text-tertiary)]" title={t('preview.editablePptxRangeTip')}>
                    <Info size={16} />
                  </span>
                </div>
              );
            })()}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditablePptxDialog(false)}
                className="rounded-[var(--app-radius-control)] px-4 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]"
              >
                {t('preview.editablePptxCancel')}
              </button>
              <button
                onClick={async () => {
                  setShowEditablePptxDialog(false);
                  handleExport('editable-pptx');
                }}
                className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-4 py-2 text-sm text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)]"
              >
                {t('preview.editablePptxStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={showImageGenerationSettings}
        onClose={() => setShowImageGenerationSettings(false)}
        title="图片生成设置"
        size="md"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[var(--app-text-secondary)]">
            选择想要的画面结果即可，系统会自动补全构图、元素数量、光影和现实感约束。
          </p>

          <label className="block space-y-2 text-sm font-medium text-[var(--app-text)]">
            <span>视觉密度</span>
            <select
              aria-label="视觉密度"
              value={draftImageGenerationSettings.density}
              onChange={(event) => setDraftImageGenerationSettings(prev => ({
                ...prev,
                density: event.target.value as SlideImageGenerationSettings['density'],
              }))}
              className="h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm text-[var(--app-text)] outline-none transition-colors focus:border-[var(--app-accent)]"
            >
              <option value="sparse">极简</option>
              <option value="standard">克制（推荐）</option>
              <option value="rich">丰富</option>
            </select>
            <span className="block text-xs font-normal leading-5 text-[var(--app-text-tertiary)]">
              {IMAGE_DENSITY_HELP[draftImageGenerationSettings.density]}
            </span>
          </label>

          <label className="block space-y-2 text-sm font-medium text-[var(--app-text)]">
            <span>视觉风格</span>
            <select
              aria-label="视觉风格"
              value={draftImageGenerationSettings.style}
              onChange={(event) => setDraftImageGenerationSettings(prev => ({
                ...prev,
                style: event.target.value as SlideImageGenerationSettings['style'],
              }))}
              className="h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm text-[var(--app-text)] outline-none transition-colors focus:border-[var(--app-accent)]"
            >
              <option value="theme">跟随模板</option>
              <option value="business">商务简洁</option>
              <option value="tech">科技编辑风</option>
              <option value="photo">真实商业摄影</option>
              <option value="flat">扁平商务插画</option>
            </select>
          </label>

          <label className="block space-y-2 text-sm font-medium text-[var(--app-text)]">
            <span>PPT 构图安全区</span>
            <select
              aria-label="PPT 构图安全区"
              value={draftImageGenerationSettings.composition}
              onChange={(event) => setDraftImageGenerationSettings(prev => ({
                ...prev,
                composition: event.target.value as SlideImageGenerationSettings['composition'],
              }))}
              className="h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm text-[var(--app-text)] outline-none transition-colors focus:border-[var(--app-accent)]"
            >
              <option value="auto">自动适配页面内容（推荐）</option>
              <option value="text-left">左文右图</option>
              <option value="text-right">右文左图</option>
              <option value="center">居中主视觉</option>
              <option value="full-bleed">全画面</option>
            </select>
            <span className="block text-xs font-normal leading-5 text-[var(--app-text-tertiary)]">
              控制文字与核心视觉的空间关系，重要元素不会挤进文字区域。
            </span>
          </label>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-[var(--app-text)]">AI 味抑制</span>
            <SegmentedControl
              ariaLabel="AI 味抑制"
              options={IMAGE_RESTRAINT_OPTIONS}
              value={draftImageGenerationSettings.restraint}
              onChange={(restraint) => setDraftImageGenerationSettings(prev => ({ ...prev, restraint }))}
              className="grid w-full grid-cols-3"
            />
            <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">
              {IMAGE_RESTRAINT_HELP[draftImageGenerationSettings.restraint]}
            </p>
          </div>

          <details className="border-t border-[var(--app-border)] pt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--app-text-secondary)]">高级设置</summary>
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--app-text-secondary)]">
                <span>使用模板约束</span>
                <input
                  aria-label="使用模板约束"
                  type="checkbox"
                  checked={draftImageGenerationSettings.useTemplate}
                  onChange={(event) => setDraftImageGenerationSettings(prev => ({ ...prev, useTemplate: event.target.checked }))}
                  className="h-4 w-4 accent-[var(--app-accent)]"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-[var(--app-text)]">
                <span>生成并发</span>
                <select
                  aria-label="生成并发"
                  value={draftImageGenerationSettings.maxWorkers}
                  onChange={(event) => setDraftImageGenerationSettings(prev => ({ ...prev, maxWorkers: clampImageWorkers(event.target.value) }))}
                  className="h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm text-[var(--app-text)] outline-none transition-colors focus:border-[var(--app-accent)]"
                >
                  {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium text-[var(--app-text)]">
                <span>特殊视觉要求（可选）</span>
                <textarea
                  aria-label="特殊视觉要求"
                  value={draftImageGenerationSettings.customPrompt}
                  onChange={(event) => setDraftImageGenerationSettings(prev => ({ ...prev, customPrompt: event.target.value }))}
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition-colors focus:border-[var(--app-accent)]"
                  placeholder="仅填写必须出现、禁止出现或品牌约束，例如：必须使用品牌蓝，不能出现人物"
                />
                <span className="block text-xs font-normal leading-5 text-[var(--app-text-tertiary)]">
                  仅当上方选项无法表达时填写；冲突时以上方结构化设置为准。
                </span>
              </label>
            </div>
          </details>

          {imageGenerationWarnings.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-[var(--app-radius-control)] border border-[var(--app-warning)] bg-[var(--app-surface-muted)] px-3 py-2.5 text-sm text-[var(--app-warning)]"
            >
              <div className="font-medium">生成质量提醒</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
                {imageGenerationWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">
            批量生成只补未生成页面，不覆盖已上传或已生成的图片。
          </p>
          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-[var(--app-surface)] px-1 pt-3">
            <Button variant="ghost" onClick={() => setShowImageGenerationSettings(false)}>取消</Button>
            <Button variant="primary" onClick={saveImageGenerationSettings}>保存图片生成设置</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showImageQualityReport}
        onClose={() => setShowImageQualityReport(false)}
        title="图片质量提醒"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] px-4 py-3 text-sm text-[var(--app-text-secondary)]">
            <Info size={18} className="mt-0.5 shrink-0 text-[var(--app-accent)]" />
            <div>
              <p className="font-medium text-[var(--app-text)]">发现 {imageQualityWarningCount} 页需要检查</p>
              <p className="mt-1 text-xs leading-5">质量检测只标记可能影响展示的图片，不会删除或覆盖已生成内容。你可以定位页面核对，也可以直接重新生成。</p>
            </div>
          </div>

          {imageQualityPages.length > 0 ? (
            <div className="divide-y divide-[var(--app-border)] rounded-[var(--app-radius-card)] border border-[var(--app-border)]">
              {imageQualityPages.map((item: any) => {
                const pageIndex = currentProject.pages.findIndex(page => (page.id || page.page_id) === item.page_id);
                const page = pageIndex >= 0 ? currentProject.pages[pageIndex] : null;
                const issues = Array.isArray(item.qa?.issues) ? item.qa.issues : [];
                return (
                  <div key={item.page_id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--app-text)]">
                          {pageIndex >= 0 ? `第 ${pageIndex + 1} 页` : '未知页面'}
                          {page?.outline_content?.title ? ` · ${page.outline_content.title}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-text-tertiary)]">
                          实际尺寸：{item.qa?.width || '-'} × {item.qa?.height || '-'} px
                        </p>
                      </div>
                      {pageIndex >= 0 && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedIndex(pageIndex);
                              setShowImageQualityReport(false);
                            }}
                          >
                            定位此页
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={Boolean(item.page_id && pageGeneratingTasks[item.page_id])}
                            onClick={() => {
                              setSelectedIndex(pageIndex);
                              setShowImageQualityReport(false);
                              void regeneratePageAtIndex(pageIndex, issues);
                            }}
                          >
                            重新生成
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="space-y-1 text-xs leading-5 text-[var(--app-text-secondary)]">
                      {issues.map((issue: string) => (
                        <li key={issue} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-accent)]" aria-hidden="true" />
                          <span>{IMAGE_QUALITY_ISSUE_LABELS[issue] || issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--app-text-secondary)]">质量结果缺少逐页明细，请重新生成图片后再查看。</p>
          )}
        </div>
      </Modal>

      {/* 主内容区 */}
      <WorkspaceShell
        className="flex-1"
        sidebarWidth="240px"
        inspectorWidth="344px"
        hideToolbar
        toolbar={null}
        inspector={imageInspector}
        statusBar={(
          <WorkspaceStatusBar className="gap-3">
            {imageGenerationActive && activeImageTask?.progress ? (
              <span data-testid="image-generation-progress" className="inline-flex min-w-0 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1">
                {imageGenerationPaused ? (
                  <PauseCircle size={13} className="shrink-0 text-[var(--app-warning)]" aria-hidden="true" />
                ) : (
                  <Loader2 size={13} className="shrink-0 animate-spin text-[var(--app-accent)]" aria-hidden="true" />
                )}
                <span className="hidden whitespace-nowrap font-medium text-[var(--app-text)] sm:inline">{t('preview.batchGenerateTitle')}</span>
                <span className="whitespace-nowrap" role="status" aria-live="polite">
                  {activeImageTask.progress.completed || 0}/{activeImageTask.progress.total || 0}
                </span>
                {(activeImageTask.progress.failed || 0) > 0 && (
                  <span className="whitespace-nowrap text-[var(--app-error)]">失败 {activeImageTask.progress.failed}</span>
                )}
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--app-border)]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-300" style={{ width: `${imageGenerationProgressPercent}%` }} />
                </span>
                {imageGenerationPaused ? (
                  <button type="button" onClick={resumeImageGeneration} className="whitespace-nowrap font-medium text-[var(--app-accent)] hover:underline">{t('preview.resumeGeneration')}</button>
                ) : (
                  <button type="button" onClick={pauseImageGeneration} className="whitespace-nowrap font-medium text-[var(--app-text-secondary)] hover:underline">{t('preview.pauseGeneration')}</button>
                )}
              </span>
            ) : (
              <span>{currentProject.pages.length > 0 ? `第 ${selectedIndex + 1} 页` : '0 页'}</span>
            )}
            <div className="ml-auto flex items-center gap-3">
              {imageQualityWarningCount > 0 && (
                <button
                  type="button"
                  aria-label={`查看图片质量提醒，共 ${imageQualityWarningCount} 页`}
                  onClick={() => setShowImageQualityReport(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] px-2.5 text-xs font-medium text-[var(--app-accent)] transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
                >
                  <Info size={14} />
                  质量提醒 {imageQualityWarningCount}
                </button>
              )}
              <span className="whitespace-nowrap">图片模式</span>
            </div>
          </WorkspaceStatusBar>
        )}
      sidebar={imageRail}
      >

        {/* 右侧：大图预览 */}
        <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[var(--app-canvas)]">
          {currentProject.pages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto">
              <div className="text-center">
                <div className="text-4xl md:text-6xl mb-4">📊</div>
                <h3 className="text-lg md:text-xl font-semibold text-[var(--app-text-secondary)] mb-2">
                  {t('preview.noPages')}
                </h3>
                <p className="text-sm md:text-base text-[var(--app-text-tertiary)] mb-6">
                  {t('preview.noPagesHint')}
                </p>
                <Button
                  variant="primary"
                  onClick={() => navigate(`/project/${projectId}/ppt/outline`)}
                  className="text-sm md:text-base"
                >
                  {t('preview.backToEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 预览区 */}
              <div
                data-testid="slide-preview-viewport"
                className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-2 md:p-3 [container-type:size]"
              >
                <div
                  data-testid="slide-preview-canvas"
                  className="relative bg-[var(--app-surface)] rounded-[var(--app-radius-card)] shadow-[var(--app-shadow-elevated)] overflow-hidden touch-manipulation"
                  style={{ aspectRatio: aspectRatioStyle, width: previewCanvasWidth }}
                >
                    {selectedPage?.generated_image_path ? (
                      <img
                        src={imageUrl}
                        alt={`Slide ${selectedIndex + 1}`}
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[var(--app-surface-muted)]">
                        <div className="text-center">
                          <img src={getStaticAssetUrl('/logo-nav-transparent.png')} alt="EasySlide Logo" className="h-16 w-auto mx-auto mb-4 opacity-70" />
                          <p className="text-[var(--app-text-tertiary)] mb-4">
                            {selectedPage?.status === 'QUEUED'
                              ? t('preview.queued')
                              : (selectedPage?.id && pageGeneratingTasks[selectedPage.id]) ||
                                selectedPage?.status === 'GENERATING'
                              ? t('preview.generating')
                              : selectedPage?.status === 'FAILED'
                              ? t('preview.generationFailed')
                              : t('preview.notGenerated')}
                          </p>
                          {(!selectedPage?.id || !pageGeneratingTasks[selectedPage.id]) &&
                           selectedPage?.status !== 'QUEUED' &&
                           selectedPage?.status !== 'GENERATING' && (
                            <Button
                              variant="primary"
                              onClick={handleRegeneratePage}
                            >
                              {selectedPage?.status === 'FAILED'
                                ? t('preview.retryThisPage')
                                : t('preview.generateThisPage')}
                            </Button>
                          )}
                        </div>
                      </div>
                  )}
                </div>
              </div>

              {/* 控制栏 */}
              <div
                data-testid="slide-preview-controls"
                className="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 md:px-4"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-5xl mx-auto">
                  {/* 导航 */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />}
                      onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                      disabled={selectedIndex === 0}
                      className="whitespace-nowrap text-xs md:text-sm"
                    >
                      <span>{t('preview.prevPage')}</span>
                    </Button>
                    <span className="px-2 md:px-4 text-xs md:text-sm text-[var(--app-text-tertiary)] whitespace-nowrap">
                      {selectedIndex + 1} / {currentProject.pages.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />}
                      onClick={() =>
                        setSelectedIndex(
                          Math.min(currentProject.pages.length - 1, selectedIndex + 1)
                        )
                      }
                      disabled={selectedIndex === currentProject.pages.length - 1}
                      className="whitespace-nowrap text-xs md:text-sm"
                    >
                      <span>{t('preview.nextPage')}</span>
                    </Button>
                  </div>

                  {/* 操作 */}
                  <div className="flex items-center gap-1.5 md:gap-2 w-full sm:w-auto justify-center">
                    {/* 手机端：模板更换按钮 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Upload size={16} />}
                      onClick={() => { setDraftTemplateStyle(templateStyle); setIsTemplateModalOpen(true); }}
                      className="lg:hidden text-xs"
                      title={t('preview.changeTemplate')}
                    />
                    {/* 手机端：素材生成按钮 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ImagePlus size={16} />}
                      onClick={() => setIsMaterialModalOpen(true)}
                      className="lg:hidden text-xs"
                      title={t('nav.materialGenerate')}
                    />
                    {/* 手机端：刷新按钮 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="md:hidden text-xs"
                      title={t('preview.refresh')}
                    />
                    {imageVersions.length > 0 && (
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowVersionMenu(!showVersionMenu)}
                          className="text-xs md:text-sm"
                        >
                          <span className="whitespace-nowrap">
                            {currentImageVersion?.scene_status === 'ready'
                              ? t('preview.sceneReady')
                              : currentImageVersion?.scene_status === 'building'
                                ? t('preview.sceneBuilding')
                                : currentImageVersion?.scene_status === 'degraded'
                                  ? t('preview.sceneDegraded')
                                  : currentImageVersion?.scene_status === 'failed'
                                    ? t('preview.sceneFailed')
                                    : `${t('preview.historyVersions')} (${imageVersions.length})`}
                          </span>
                        </Button>
                        {showVersionMenu && (
                          <div className="absolute right-0 bottom-full mb-2 w-56 md:w-64 bg-[var(--app-surface)] rounded-[var(--app-radius-card)] shadow-[var(--app-shadow-floating)] border border-[var(--app-border)] py-2 z-20 max-h-96 overflow-y-auto">
                            {imageVersions.map((version) => (
                              <button
                                key={version.version_id}
                                onClick={() => handleSwitchVersion(version.version_id)}
                                className={`w-full px-3 md:px-4 py-2 text-left hover:bg-[var(--app-surface-hover)] transition-colors flex items-center justify-between text-xs md:text-sm ${
                                  version.is_current ? 'bg-[var(--app-accent-soft)]' : ''
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span>{t('preview.version')} {version.version_number}</span>
                                    {version.is_current && (
                                      <span className="text-xs font-medium text-[var(--app-accent)]">
                                        ({t('preview.current')})
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 text-[11px] text-[var(--app-text-muted)]">
                                    {version.scene_status === 'ready'
                                      ? t('preview.sceneReady')
                                      : version.scene_status === 'building'
                                        ? t('preview.sceneBuilding')
                                        : version.scene_status === 'degraded'
                                          ? t('preview.sceneDegraded')
                                          : version.scene_status === 'failed'
                                            ? t('preview.sceneFailed')
                                            : t('preview.sceneMissing')}
                                    {typeof version.scene_quality_score === 'number'
                                      ? ` · ${t('preview.sceneQuality')} ${Math.round(version.scene_quality_score * 100)}%`
                                      : ''}
                                  </div>
                                  {version.scene_error && (
                                    <div className="mt-1 max-w-40 truncate text-[11px] text-[var(--app-error)]" title={version.scene_error}>
                                      {version.scene_error}
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs text-[var(--app-text-muted)] hidden md:inline">
                                  {version.created_at
                                    ? new Date(version.created_at).toLocaleString('zh-CN', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : ''}
                                </span>
                              </button>
                            ))}
                            {currentImageVersion?.scene_status !== 'ready' && (
                              <div className="border-t border-[var(--app-border)] px-3 pt-2 md:px-4">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="w-full"
                                  onClick={handleRecoverCurrentScene}
                                  disabled={isRecoveringScene}
                                >
                                  {isRecoveringScene
                                    ? t('preview.recoveringScene')
                                    : t('preview.recoverScene')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditPage()}
                      disabled={!selectedPage}
                      className="text-xs md:text-sm flex-1 sm:flex-initial"
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRegeneratePage}
                      disabled={selectedPage?.id && pageGeneratingTasks[selectedPage.id] ? true : false}
                      className="text-xs md:text-sm flex-1 sm:flex-initial"
                    >
                      {selectedPage?.id && pageGeneratingTasks[selectedPage.id]
                        ? t('preview.regenerating')
                        : t('preview.regenerate')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

      </WorkspaceShell>

      {/* 编辑对话框 */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('preview.editPage')}
        size="wide"
      >
        <div className="space-y-4">
          {/* 图片（支持矩形区域选择） */}
          <div
            className="relative mx-auto max-h-[46vh] w-full overflow-hidden rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)]"
            style={{ aspectRatio: aspectRatioStyle }}
            onMouseDown={handleSelectionMouseDown}
            onMouseMove={handleSelectionMouseMove}
            onMouseUp={handleSelectionMouseUp}
            onMouseLeave={handleSelectionMouseUp}
          >
            {imageUrl && (
              <>
                {/* 左上角：区域选图模式开关 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 切换矩形选择模式
                    setIsRegionSelectionMode((prev) => !prev);
                    // 切模式时清空当前选区
                    setSelectionStart(null);
                    setSelectionRect(null);
                    setIsSelectingRegion(false);
                  }}
                  className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)]/90 px-2 py-1 text-[10px] text-[var(--app-text-secondary)] shadow-[var(--app-shadow-card)] transition-colors hover:bg-[var(--app-surface-hover)]"
                >
                  <Sparkles size={12} />
                  <span>{isRegionSelectionMode ? t('preview.endRegionSelect') : t('preview.regionSelect')}</span>
                </button>

                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Current slide"
                  className="h-full w-full select-none object-contain"
                  draggable={false}
                  crossOrigin="anonymous"
                />
                {selectionRect && (
                  <div
                    className="pointer-events-none absolute border-2 border-[var(--app-accent)] bg-[var(--app-accent-soft)]/60"
                    style={{
                      left: selectionRect.left,
                      top: selectionRect.top,
                      width: selectionRect.width,
                      height: selectionRect.height,
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* 大纲内容 - 可编辑 */}
          <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)]">
            <button
              onClick={() => setIsOutlineExpanded(!isOutlineExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              <h4 className="text-sm font-semibold text-[var(--app-text-secondary)]">{t('preview.pageOutline')}</h4>
              {isOutlineExpanded ? (
                <ChevronUp size={18} className="text-[var(--app-text-tertiary)]" />
              ) : (
                <ChevronDown size={18} className="text-[var(--app-text-tertiary)]" />
              )}
            </button>
            {isOutlineExpanded && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--app-text-tertiary)] mb-1">{t('outline.titleLabel')}</label>
                  <input
                    type="text"
                    value={editOutlineTitle}
                    onChange={(e) => setEditOutlineTitle(e.target.value)}
                    className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-[var(--app-accent)]"
                    placeholder={t('preview.enterTitle')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--app-text-tertiary)] mb-1">{t('preview.pointsPerLine')}</label>
                  <textarea
                    value={editOutlinePoints}
                    onChange={(e) => setEditOutlinePoints(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-[var(--app-accent)]"
                    placeholder={t('preview.enterPointsPerLine')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 描述内容 - 可编辑 */}
          <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)]">
            <button
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              <h4 className="text-sm font-semibold text-[var(--app-text-secondary)]">{t('preview.pageDescription')}</h4>
              {isDescriptionExpanded ? (
                <ChevronUp size={18} className="text-[var(--app-text-tertiary)]" />
              ) : (
                <ChevronDown size={18} className="text-[var(--app-text-tertiary)]" />
              )}
            </button>
            {isDescriptionExpanded && (
              <div className="px-4 pb-4">
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition-colors focus:border-[var(--app-accent)]"
                  placeholder={t('preview.enterDescription')}
                />
              </div>
            )}
          </div>

          {/* 上下文图片选择 */}
          <div className="space-y-4 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
            <h4 className="mb-3 text-sm font-semibold text-[var(--app-text-secondary)]">{t('preview.selectContextImages')}</h4>

            {/* Template图片选择 */}
            {selectedTemplateContextImage && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="use-template"
                  checked={selectedContextImages.useTemplate}
                  onChange={(e) =>
                    setSelectedContextImages((prev) => ({
                      ...prev,
                      useTemplate: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded accent-[var(--app-accent)]"
                />
                <label htmlFor="use-template" className="flex items-center gap-2 cursor-pointer">
                  <ImageIcon size={16} className="text-[var(--app-text-tertiary)]" />
                  <span className="text-sm text-[var(--app-text-secondary)]">{t('preview.useTemplateImage')}</span>
                  {selectedTemplateContextImage && (
                    <img
                      src={getImageUrl(selectedTemplateContextImage, selectedTemplateContextUpdatedAt)}
                      alt="Template"
                      className="w-16 h-10 object-cover rounded border border-[var(--app-border)]"
                    />
                  )}
                </label>
              </div>
            )}

            {/* Desc中的图片 */}
            {selectedPage?.description_content && (() => {
              const descImageUrls = extractImageUrlsFromDescription(selectedPage.description_content);
              return descImageUrls.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--app-text-secondary)]">{t('preview.imagesInDescription')}:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {descImageUrls.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={getImageUrl(url)}
                          alt={`Desc image ${idx + 1}`}
                          className="h-20 w-full cursor-pointer rounded-[var(--app-radius-control)] border-2 border-[var(--app-border)] object-cover transition-all"
                          style={{
                            borderColor: selectedContextImages.descImageUrls.includes(url)
                              ? 'var(--app-accent)'
                              : 'var(--app-border)',
                          }}
                          onClick={() => {
                            setSelectedContextImages((prev) => {
                              const isSelected = prev.descImageUrls.includes(url);
                              return {
                                ...prev,
                                descImageUrls: isSelected
                                  ? prev.descImageUrls.filter((u) => u !== url)
                                  : [...prev.descImageUrls, url],
                              };
                            });
                          }}
                        />
                        {selectedContextImages.descImageUrls.includes(url) && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-[var(--app-radius-control)] border-2 border-[var(--app-accent)] bg-[var(--app-accent-soft)]/70">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-accent)]">
                              <span className="text-[var(--app-on-color)] text-xs font-bold">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* 上传图片 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--app-text-secondary)]">{t('preview.uploadImages')}:</label>
                {projectId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ImagePlus size={16} />}
                    onClick={() => setIsMaterialSelectorOpen(true)}
                  >
                    {t('preview.selectFromMaterials')}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedContextImages.uploadedFiles.map((_, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={uploadedFileUrls.current[idx] || ''}
                      alt={`Uploaded ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded border border-[var(--app-border)]"
                    />
                    <button
                      onClick={() => removeUploadedFile(idx)}
                    className="no-min-touch-target absolute -top-2 -right-2 w-5 h-5 bg-[var(--app-error)] text-[var(--app-on-color)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-[var(--app-radius-control)] border-2 border-dashed border-[var(--app-border)] transition-colors hover:border-[var(--app-accent)]">
                  <Upload size={20} className="text-[var(--app-text-muted)] mb-1" />
                  <span className="text-xs text-[var(--app-text-tertiary)]">{t('preview.upload')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 编辑框 */}
          <Textarea
            label={t('preview.editPromptLabel')}
            placeholder={t('preview.editPromptPlaceholder')}
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={4}
          />
          <div data-testid="edit-page-footer" className="sticky bottom-0 z-10 -mx-1 flex justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-1 pb-1 pt-3">
            <Button
              variant="secondary"
              onClick={() => {
                handleSaveOutlineAndDescription();
                setIsEditModalOpen(false);
              }}
            >
              {t('preview.saveOutlineOnly')}
            </Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim() || !selectedPage?.generated_image_path}
              >
                {t('preview.generateImage')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <ToastContainer />
      {ConfirmDialog}

      {/* 模板选择 Modal */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={t('preview.changeTemplate')}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--app-text-tertiary)] mb-4">
            {t('preview.templateModalDesc')}
          </p>
          {/* 图片模板 / 文字风格 切换 */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <span className="text-sm text-[var(--app-text-tertiary)] group-hover:text-[var(--app-text-primary)] transition-colors">
              {t('preview.useTextStyle')}
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={useTextStyleMode}
                onChange={(e) => setUseTextStyleMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="peer h-6 w-11 rounded-full bg-[var(--app-surface-hover)] after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-[var(--app-border)] after:bg-[var(--app-surface)] after:transition-all after:content-[''] peer-checked:bg-[var(--app-accent)] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none rtl:peer-checked:after:-translate-x-full"></div>
            </div>
          </label>
          {useTextStyleMode ? (
            <TextStyleSelector
              value={draftTemplateStyle}
              onChange={setDraftTemplateStyle}
              onToast={show}
            />
          ) : (
            <>
              <TemplateSelector
                onSelect={handleTemplateSelect}
                selectedTemplateId={selectedTemplateId}
                selectedPresetTemplateId={selectedPresetTemplateId}
                showUpload={false}
                projectId={projectId || null}
              />
              {isUploadingTemplate && (
                <div className="text-center py-2 text-sm text-[var(--app-text-tertiary)]">
                  {t('preview.uploadingTemplate')}
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            {useTextStyleMode && (
              <Button
                variant="primary"
                loading={isSavingTemplateStyle}
                onClick={async () => {
                  isEditingTemplateStyle.current = true;
                  setTemplateStyle(draftTemplateStyle);
                  setIsSavingTemplateStyle(true);
                  try {
                    await updateProject(projectId!, { template_style: draftTemplateStyle || '' });
                    isEditingTemplateStyle.current = false;
                    await syncProject(projectId!);
                    show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
                    setIsTemplateModalOpen(false);
                  } catch (error: any) {
                    show({ message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }), type: 'error' });
                  } finally {
                    setIsSavingTemplateStyle(false);
                  }
                }}
              >
                {t('preview.applyStyle')}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setIsTemplateModalOpen(false)}
              disabled={isUploadingTemplate || isSavingTemplateStyle}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
      {/* 素材生成模态组件（可复用模块，这里只是示例挂载） */}
      {projectId && (
        <>
          <MaterialGeneratorModal
            projectId={projectId}
            isOpen={isMaterialModalOpen}
            onClose={() => setIsMaterialModalOpen(false)}
          />
          {/* 素材选择器 */}
          <MaterialSelector
            projectId={projectId}
            isOpen={isMaterialSelectorOpen}
            onClose={() => setIsMaterialSelectorOpen(false)}
            onSelect={handleSelectMaterials}
            multiple={true}
            initialSelectedUrls={selectedDescriptionImageUrls}
            mediaKindFilter={['image']}
          />
          {/* 项目设置模态框 */}
          <ProjectSettingsModal
            isOpen={isProjectSettingsOpen}
            onClose={() => setIsProjectSettingsOpen(false)}
            extraRequirements={extraRequirements}
            templateStyle={templateStyle}
            onExtraRequirementsChange={(value) => {
              isEditingRequirements.current = true;
              setExtraRequirements(value);
            }}
            onTemplateStyleChange={(value) => {
              isEditingTemplateStyle.current = true;
              setTemplateStyle(value);
            }}
            onSaveExtraRequirements={handleSaveExtraRequirements}
            onSaveTemplateStyle={handleSaveTemplateStyle}
            isSavingRequirements={isSavingRequirements}
            isSavingTemplateStyle={isSavingTemplateStyle}
            // 导出设置
            exportExtractorMethod={exportExtractorMethod}
            exportInpaintMethod={exportInpaintMethod}
            exportAllowPartial={exportAllowPartial}
            exportHighFidelityEditable={exportHighFidelityEditable}
            onExportExtractorMethodChange={setExportExtractorMethod}
            onExportInpaintMethodChange={setExportInpaintMethod}
            onExportAllowPartialChange={setExportAllowPartial}
            onExportHighFidelityEditableChange={setExportHighFidelityEditable}
            onSaveExportSettings={handleSaveExportSettings}
            isSavingExportSettings={isSavingExportSettings}
            // 画面比例
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            onSaveAspectRatio={handleSaveAspectRatio}
            isSavingAspectRatio={isSavingAspectRatio}
            hasImages={hasImages}
          />
        </>
      )}

      {/* 1K分辨率警告对话框 */}
      <Modal
        isOpen={show1KWarningDialog}
        onClose={handleCancel1KWarning}
        title={t('preview.resolution1KWarning')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-[var(--app-error)]/10 border border-[var(--app-error)]/25 rounded-[var(--app-radius-card)]">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="text-sm text-[var(--app-error)]">
                {t('preview.resolution1KWarningText')}
              </p>
              <p className="text-sm text-[var(--app-error)] mt-2">
                {t('preview.resolution1KWarningHint')}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skip1KWarningChecked}
              onChange={(e) => setSkip1KWarningChecked(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--app-accent)]"
            />
            <span className="text-sm text-[var(--app-text-tertiary)]">{t('preview.dontShowAgain')}</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleCancel1KWarning}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirm1KWarning}>
              {t('preview.generateAnyway')}
            </Button>
          </div>
        </div>
      </Modal>

      {projectId && <NarrationWorkbench
        open={showNarrationWorkbench}
        projectId={projectId}
        initialPageId={currentProject?.pages?.[selectedIndex]?.page_id}
        pageIds={narrationPageIds}
        onClose={() => setShowNarrationWorkbench(false)}
        onSummaryChange={setVideoNarrationSummary}
      />}

      {projectId && <PptToVideoWizard
        projectId={projectId}
        isOpen={showPptToVideoWizard}
        onClose={() => setShowPptToVideoWizard(false)}
        onCreated={() => void useContentProjectStore.getState().load(projectId)}
      />}

    </div>
  );
};
