import React, { useState } from 'react';
import { X, FileText, Settings as SettingsIcon, Download, Sparkles, HelpCircle } from 'lucide-react';
import { Button, Textarea } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { Settings } from '@/pages/Settings';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExportExtractorMethod, ExportInpaintMethod, RenderMode } from '@/types';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { ExportDirectorySetting } from './ExportDirectorySetting';

// ProjectSettings 组件自包含翻译
const projectSettingsI18n = {
  zh: {
    projectSettings: {
      title: "设置", projectConfig: "项目设置", exportConfig: "导出设置", globalConfig: "全局设置",
      projectConfigTitle: "项目级配置", projectConfigDesc: "这些设置仅应用于当前项目，不影响其他项目",
      globalConfigTitle: "全局设置", globalConfigDesc: "这些设置应用于所有项目",
      aspectRatio: "画面比例", aspectRatioDesc: "设置生成幻灯片图片的画面比例",
      aspectRatioLocked: "已生成图片的项目无法调整画面比例",
      aspectRatioHelp: "部分模型仅支持特定的画面比例（如 16:9、4:3、1:1）。如果图片生成报错，可尝试切换画面比例后重试。",
      extraRequirements: "额外要求", extraRequirementsDesc: "在生成每个页面时，AI 会参考这些额外要求",
      extraRequirementsPlaceholder: "例如：使用紧凑的布局，顶部展示一级大纲标题，加入更丰富的PPT插图...",
      saveExtraRequirements: "保存额外要求",
      styleDescription: "风格描述", styleDescriptionDesc: "描述您期望的 PPT 整体风格，AI 将根据描述生成相应风格的页面",
      styleDescriptionPlaceholder: "例如：简约商务风格，使用深蓝色和白色配色，字体清晰大方，布局整洁...",
      saveStyleDescription: "保存风格描述",
      styleTip: "风格描述会在生成图片时自动添加到提示词中。如果同时上传了模板图片，风格描述会作为补充说明。",
      editablePptxExport: "可编辑 PPTX 导出设置", editablePptxExportDesc: "配置「导出可编辑 PPTX」功能的处理方式。这些设置影响导出质量和API调用成本。",
      extractorMethod: "组件提取方法", extractorMethodDesc: "选择如何从PPT图片中提取文字、表格等可编辑组件",
      extractorHybrid: "内置 Paddle 解析（推荐）", extractorHybridDesc: "PaddleOCR-VL 内置解析，无需额外 OCR Key，适合当前默认导出流程",
      extractorMineru: "MinerU提取", extractorMineruDesc: "仅在需要沿用 MinerU 版面分析时使用",
      backgroundMethod: "背景图获取方法", backgroundMethodDesc: "选择如何生成干净的背景图（移除原图中的文字后用于PPT背景）",
      backgroundHybrid: "混合方式获取（推荐）", backgroundHybridDesc: "百度 Inpaint 精确去除文字 + 生成式模型提升画质",
      backgroundGenerative: "生成式获取", backgroundGenerativeDesc: "使用生成式大模型（如Gemini）直接生成背景，背景质量高但有遗留元素的可能",
      backgroundBaidu: "百度 Inpaint 服务获取", backgroundBaiduDesc: "使用百度图像修复 API，速度快但画质一般，需要在全局设置中配置百度 Inpaint Key",
      usesAiModel: "使用文生图模型",
      costTip: "标有「使用文生图模型」的选项会调用AI图片生成API（如Gemini），每页会产生额外的API调用费用。如果需要控制成本，可选择「百度 Inpaint」方式。",
      errorHandling: "错误处理策略", errorHandlingDesc: "配置导出过程中遇到错误时的处理方式",
      highFidelityEditable: "高保真可编辑导出", highFidelityEditableDesc: "开启后才会对复杂图标、徽章和装饰物尝试逐元素分离。可能调用外部图像编辑模型，耗时和成本更高，默认关闭。",
      allowPartialResult: "允许返回半成品", allowPartialResultDesc: "开启后，导出过程中遇到错误（如样式提取失败、文本渲染失败等）时会跳过错误继续导出，最终可能得到不完整的结果。关闭时，任何错误都会立即停止导出并提示具体原因。",
      allowPartialResultWarning: "开启此选项可能导致导出的 PPTX 文件中部分文字样式丢失、元素位置错误或内容缺失。建议仅在需要快速获取结果且可以接受质量损失时开启。",
      saveExportSettings: "保存导出设置",
      tip: "提示"
    },
    shared: { saving: "保存中..." }
  },
  en: {
    projectSettings: {
      title: "Settings", projectConfig: "Project Settings", exportConfig: "Export Settings", globalConfig: "Global Settings",
      projectConfigTitle: "Project-level Configuration", projectConfigDesc: "These settings only apply to the current project",
      globalConfigTitle: "Global Settings", globalConfigDesc: "These settings apply to all projects",
      aspectRatio: "Aspect Ratio", aspectRatioDesc: "Set the aspect ratio for generated slide images",
      aspectRatioLocked: "Cannot change aspect ratio after images have been generated",
      aspectRatioHelp: "Some models only support specific aspect ratios (e.g. 16:9, 4:3, 1:1). If image generation fails, try switching to a different aspect ratio.",
      extraRequirements: "Extra Requirements", extraRequirementsDesc: "AI will reference these extra requirements when generating each page",
      extraRequirementsPlaceholder: "e.g., Use compact layout, show first-level outline title at top, add richer PPT illustrations...",
      saveExtraRequirements: "Save Extra Requirements",
      styleDescription: "Style Description", styleDescriptionDesc: "Describe your expected PPT overall style, AI will generate pages in that style",
      styleDescriptionPlaceholder: "e.g., Simple business style, use navy blue and white colors, clear fonts, clean layout...",
      saveStyleDescription: "Save Style Description",
      styleTip: "Style description will be automatically added to the prompt when generating images. If a template image is also uploaded, the style description will serve as supplementary notes.",
      editablePptxExport: "Editable PPTX Export Settings", editablePptxExportDesc: "Configure how \"Export Editable PPTX\" works. These settings affect export quality and API call costs.",
      extractorMethod: "Component Extraction Method", extractorMethodDesc: "Choose how to extract editable components like text and tables from PPT images",
      extractorHybrid: "Built-in Paddle Parsing (Recommended)", extractorHybridDesc: "Uses built-in PaddleOCR-VL with no extra OCR key, suitable for the current default export flow",
      extractorMineru: "MinerU Extraction", extractorMineruDesc: "Use only when you need the legacy MinerU layout analysis path",
      backgroundMethod: "Background Image Method", backgroundMethodDesc: "Choose how to generate clean background images (remove text from original for PPT background)",
      backgroundHybrid: "Hybrid Method (Recommended)", backgroundHybridDesc: "Baidu Inpaint text removal + generative model quality enhancement",
      backgroundGenerative: "Generative Method", backgroundGenerativeDesc: "Use generative model (like Gemini) to directly generate background, high quality but may have residual elements",
      backgroundBaidu: "Baidu Inpaint", backgroundBaiduDesc: "Use Baidu image repair API, fast but average quality. Configure the Baidu Inpaint key in global settings.",
      usesAiModel: "Uses AI Image Model",
      costTip: "Options marked \"Uses AI Image Model\" will call AI image generation API (like Gemini), incurring extra API costs per page. To control costs, choose \"Baidu Inpaint\".",
      errorHandling: "Error Handling Strategy", errorHandlingDesc: "Configure how to handle errors during export",
      highFidelityEditable: "High-fidelity Editable Export", highFidelityEditableDesc: "When enabled, complex icons, badges, and decorations may be separated into editable assets. This can call external image editing models and costs more, so it is off by default.",
      allowPartialResult: "Allow Partial Results", allowPartialResultDesc: "When enabled, export will skip errors (like style extraction or text rendering failures) and continue, potentially resulting in incomplete output. When disabled, any error will stop export immediately with a specific reason.",
      allowPartialResultWarning: "Enabling this option may result in PPTX files with missing text styles, mispositioned elements, or missing content. Only enable when you need quick results and can accept quality loss.",
      saveExportSettings: "Save Export Settings",
      tip: "Tip"
    },
    shared: { saving: "Saving..." }
  }
};

interface ProjectSettingsModalProps {
  isOpen: boolean;
  renderMode?: RenderMode;
  onClose: () => void;
  extraRequirements: string;
  templateStyle: string;
  onExtraRequirementsChange: (value: string) => void;
  onTemplateStyleChange: (value: string) => void;
  onSaveExtraRequirements: () => void;
  onSaveTemplateStyle: () => void;
  isSavingRequirements: boolean;
  isSavingTemplateStyle: boolean;
  exportExtractorMethod?: ExportExtractorMethod;
  exportInpaintMethod?: ExportInpaintMethod;
  exportAllowPartial?: boolean;
  exportHighFidelityEditable?: boolean;
  onExportExtractorMethodChange?: (value: ExportExtractorMethod) => void;
  onExportInpaintMethodChange?: (value: ExportInpaintMethod) => void;
  onExportAllowPartialChange?: (value: boolean) => void;
  onExportHighFidelityEditableChange?: (value: boolean) => void;
  onSaveExportSettings?: () => void;
  isSavingExportSettings?: boolean;
  aspectRatio?: string;
  onAspectRatioChange?: (value: string) => void;
  onSaveAspectRatio?: () => void;
  isSavingAspectRatio?: boolean;
  hasImages?: boolean;
}

type SettingsTab = 'project' | 'global' | 'export';

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  renderMode,
  onClose,
  extraRequirements,
  templateStyle,
  onExtraRequirementsChange,
  onTemplateStyleChange,
  onSaveExtraRequirements,
  onSaveTemplateStyle,
  isSavingRequirements,
  isSavingTemplateStyle,
  exportExtractorMethod = 'hybrid',
  exportInpaintMethod = 'hybrid',
  exportAllowPartial = false,
  exportHighFidelityEditable = false,
  onExportExtractorMethodChange,
  onExportInpaintMethodChange,
  onExportAllowPartialChange,
  onExportHighFidelityEditableChange,
  onSaveExportSettings,
  isSavingExportSettings = false,
  aspectRatio = '16:9',
  onAspectRatioChange,
  onSaveAspectRatio,
  isSavingAspectRatio = false,
  hasImages = false,
}) => {
  const t = useT(projectSettingsI18n);
  const projectRenderMode = useProjectStore((state) => state.currentProject?.render_mode ?? 'image');
  const effectiveRenderMode = renderMode ?? projectRenderMode;
  const [activeTab, setActiveTab] = useState<SettingsTab>('project');

  const EXTRACTOR_METHOD_OPTIONS: { value: ExportExtractorMethod; labelKey: string; descKey: string }[] = [
    { value: 'hybrid', labelKey: 'projectSettings.extractorHybrid', descKey: 'projectSettings.extractorHybridDesc' },
    { value: 'mineru', labelKey: 'projectSettings.extractorMineru', descKey: 'projectSettings.extractorMineruDesc' },
  ];

  const INPAINT_METHOD_OPTIONS: { value: ExportInpaintMethod; labelKey: string; descKey: string; usesAI: boolean }[] = [
    { value: 'hybrid', labelKey: 'projectSettings.backgroundHybrid', descKey: 'projectSettings.backgroundHybridDesc', usesAI: true },
    { value: 'generative', labelKey: 'projectSettings.backgroundGenerative', descKey: 'projectSettings.backgroundGenerativeDesc', usesAI: true },
    { value: 'baidu', labelKey: 'projectSettings.backgroundBaidu', descKey: 'projectSettings.backgroundBaiduDesc', usesAI: false },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        className="bg-white dark:bg-background-secondary rounded-xl shadow-2xl w-full max-w-5xl h-[min(760px,calc(100vh-2rem))] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-border-primary flex-shrink-0">
          <h2 id="project-settings-title" className="text-xl font-bold text-gray-900 dark:text-foreground-primary">{t('projectSettings.title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <aside className="w-64 bg-gray-50 dark:bg-background-primary border-r border-gray-200 dark:border-border-primary flex-shrink-0">
            <nav className="p-4 space-y-2">
              <button
                onClick={() => setActiveTab('project')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'project'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <FileText size={20} />
                <span className="font-medium">{t('projectSettings.projectConfig')}</span>
              </button>
              <button
                onClick={() => setActiveTab('export')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'export'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <Download size={20} />
                <span className="font-medium">{t('projectSettings.exportConfig')}</span>
              </button>
              <button
                onClick={() => setActiveTab('global')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'global'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <SettingsIcon size={20} />
                <span className="font-medium">{t('projectSettings.globalConfig')}</span>
              </button>
            </nav>
          </aside>

          <div data-testid="project-settings-scroll" className="flex-1 overflow-y-auto p-6">
            {activeTab === 'project' ? (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-4">{t('projectSettings.projectConfigTitle')}</h3>
                  <p className="text-sm text-gray-600 dark:text-foreground-tertiary mb-6">
                    {t('projectSettings.projectConfigDesc')}
                  </p>
                </div>

                {/* 画面比例 */}
                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary">{t('projectSettings.aspectRatio')}</h4>
                      <div className="relative group">
                        <button type="button" className="p-1 -m-1 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500">
                          <HelpCircle size={16} className="text-gray-400 dark:text-foreground-tertiary cursor-help" />
                        </button>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-10 pointer-events-none">
                          {t('projectSettings.aspectRatioHelp')}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {hasImages ? t('projectSettings.aspectRatioLocked') : t('projectSettings.aspectRatioDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ASPECT_RATIO_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={hasImages}
                        onClick={() => onAspectRatioChange?.(opt.value)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          aspectRatio === opt.value
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-background-secondary text-cyan-700 dark:text-cyan-300'
                            : 'border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {onSaveAspectRatio && !hasImages && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onSaveAspectRatio}
                      disabled={isSavingAspectRatio}
                      className="w-full sm:w-auto"
                    >
                      {isSavingAspectRatio ? t('shared.saving') : t('common.save')}
                    </Button>
                  )}
                </div>

                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.extraRequirements')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.extraRequirementsDesc')}
                    </p>
                  </div>
                  <Textarea
                    value={extraRequirements}
                    onChange={(e) => onExtraRequirementsChange(e.target.value)}
                    placeholder={t('projectSettings.extraRequirementsPlaceholder')}
                    rows={4}
                    className="text-sm"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onSaveExtraRequirements}
                    disabled={isSavingRequirements}
                    className="w-full sm:w-auto"
                  >
                    {isSavingRequirements ? t('shared.saving') : t('projectSettings.saveExtraRequirements')}
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.styleDescription')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.styleDescriptionDesc')}
                    </p>
                  </div>
                  <Textarea
                    value={templateStyle}
                    onChange={(e) => onTemplateStyleChange(e.target.value)}
                    placeholder={t('projectSettings.styleDescriptionPlaceholder')}
                    rows={5}
                    className="text-sm"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onSaveTemplateStyle}
                      disabled={isSavingTemplateStyle}
                      className="w-full sm:w-auto"
                    >
                      {isSavingTemplateStyle ? t('shared.saving') : t('projectSettings.saveStyleDescription')}
                    </Button>
                  </div>
                  <div className="pl-4 border-l-4 border-blue-300 dark:border-blue-600">
                    <p className="text-xs text-gray-700 dark:text-foreground-secondary">
                      💡 <strong>{t('projectSettings.tip')}：</strong>{t('projectSettings.styleTip')}
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === 'export' ? (
              <div className="max-w-3xl space-y-6">
                <h3
                  className="text-lg font-semibold text-gray-900 dark:text-foreground-primary"
                  title={t('projectSettings.editablePptxExportDesc')}
                >
                  {t('projectSettings.editablePptxExport')}
                </h3>

                <ExportDirectorySetting />

                {effectiveRenderMode === 'image' && <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary" title={t('projectSettings.extractorMethodDesc')}>{t('projectSettings.extractorMethod')}</h4>
                  </div>
                  <div className="space-y-3">
                    {EXTRACTOR_METHOD_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          exportExtractorMethod === option.value
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-background-secondary'
                            : 'border-gray-200 dark:border-border-primary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        <input
                          type="radio"
                          name="extractorMethod"
                          value={option.value}
                          checked={exportExtractorMethod === option.value}
                          onChange={(e) => onExportExtractorMethodChange?.(e.target.value as ExportExtractorMethod)}
                          aria-label={t(option.labelKey)}
                          title={t(option.descKey)}
                          className="mt-1 w-4 h-4 text-cyan-600 focus:ring-cyan-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-foreground-primary">{t(option.labelKey)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>}

                {effectiveRenderMode === 'image' && <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary" title={t('projectSettings.backgroundMethodDesc')}>{t('projectSettings.backgroundMethod')}</h4>
                  </div>
                  <div className="space-y-3">
                    {INPAINT_METHOD_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          exportInpaintMethod === option.value
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-background-secondary'
                            : 'border-gray-200 dark:border-border-primary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        <input
                          type="radio"
                          name="inpaintMethod"
                          value={option.value}
                          checked={exportInpaintMethod === option.value}
                          onChange={(e) => onExportInpaintMethodChange?.(e.target.value as ExportInpaintMethod)}
                          aria-label={t(option.labelKey)}
                          title={t(option.descKey)}
                          className="mt-1 w-4 h-4 text-cyan-600 focus:ring-cyan-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-foreground-primary">{t(option.labelKey)}</span>
                            {option.usesAI && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300">
                                <Sparkles size={12} />
                                {t('projectSettings.usesAiModel')}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>}

                <div className="space-y-4">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary" title={t('projectSettings.errorHandlingDesc')}>{t('projectSettings.errorHandling')}</h4>
                  {effectiveRenderMode === 'image' && <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportHighFidelityEditable}
                      onChange={(e) => onExportHighFidelityEditableChange?.(e.target.checked)}
                      aria-label={t('projectSettings.highFidelityEditable')}
                      title={t('projectSettings.highFidelityEditableDesc')}
                      className="mt-1 w-4 h-4 text-cyan-600 focus:ring-cyan-500 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-foreground-primary">{t('projectSettings.highFidelityEditable')}</div>
                    </div>
                  </label>}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportAllowPartial}
                      onChange={(e) => onExportAllowPartialChange?.(e.target.checked)}
                      aria-label={t('projectSettings.allowPartialResult')}
                      title={`${t('projectSettings.allowPartialResultDesc')} ${t('projectSettings.allowPartialResultWarning')}`}
                      className="mt-1 w-4 h-4 text-red-500 focus:ring-red-500 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-foreground-primary">{t('projectSettings.allowPartialResult')}</div>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.globalConfigTitle')}</h3>
                  <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                    {t('projectSettings.globalConfigDesc')}
                  </p>
                </div>
                <Settings />
              </div>
            )}
          </div>
        </div>
        {activeTab === 'export' && onSaveExportSettings && (
          <div className="flex flex-shrink-0 justify-end border-t border-gray-200 px-6 py-3 dark:border-border-primary">
            <Button variant="primary" onClick={onSaveExportSettings} disabled={isSavingExportSettings}>
              {isSavingExportSettings ? t('shared.saving') : t('projectSettings.saveExportSettings')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
