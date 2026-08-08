import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileText, Film, ImageIcon, Mic2, RefreshCw, Upload, Sparkles, X } from 'lucide-react';
import { Button, useToast, Modal } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { listMaterials, uploadMaterial, listProjects, deleteMaterial, type Material } from '@/api/endpoints';

// MaterialSelector 组件自包含翻译
const materialSelectorI18n = {
  zh: {
    material: {
      selectTitle: "选择素材", totalMaterials: "共 {{count}} 个素材", noMaterials: "暂无素材",
      selectedCount: "已选择 {{count}} 个", allMaterials: "所有素材", unassociated: "未关联项目",
      currentProject: "当前项目", viewMoreProjects: "+ 查看更多项目...", uploadFile: "上传文件",
      previewMaterial: "预览素材", deleteMaterial: "删除素材", closePreview: "关闭预览",
       canUploadOrGenerate: "可以上传图片、音频、视频或文本素材，也可通过素材生成功能创建图片素材",
       canUploadImages: "可以上传图片、音频、视频或文本素材",
       currentPageMaterials: "当前页面素材",
       otherPageMaterials: "其他页面素材",
      generateMaterial: "生成素材",
      messages: {
        loadMaterialFailed: "加载素材失败", unsupportedFormat: "不支持的素材格式",
        uploadSuccess: "素材上传成功", uploadFailed: "上传素材失败",
        cannotDelete: "无法删除：缺少素材ID", deleteSuccess: "素材已删除", deleteFailed: "删除素材失败",
        selectAtLeastOne: "请至少选择一个素材", maxSelection: "最多只能选择 {{count}} 个素材"
      }
    }
  },
  en: {
    material: {
      selectTitle: "Select Material", totalMaterials: "{{count}} materials", noMaterials: "No materials",
      selectedCount: "{{count}} selected", allMaterials: "All Materials", unassociated: "Unassociated",
      currentProject: "Current Project", viewMoreProjects: "+ View more projects...", uploadFile: "Upload File",
      previewMaterial: "Preview Material", deleteMaterial: "Delete Material", closePreview: "Close Preview",
       canUploadOrGenerate: "You can upload image, audio, video, or text materials, or create image materials through the generator",
       canUploadImages: "You can upload image, audio, video, or text materials",
       currentPageMaterials: "Current page materials",
       otherPageMaterials: "Other page materials",
      generateMaterial: "Material Generation",
      messages: {
        loadMaterialFailed: "Failed to load materials", unsupportedFormat: "Unsupported material format",
        uploadSuccess: "Material uploaded successfully", uploadFailed: "Failed to upload material",
        cannotDelete: "Cannot delete: Missing material ID", deleteSuccess: "Material deleted", deleteFailed: "Failed to delete material",
        selectAtLeastOne: "Please select at least one material", maxSelection: "Maximum {{count}} materials can be selected"
      }
    }
  }
};
import type { Project } from '@/types';
import { getImageUrl } from '@/api/client';
import { MaterialGeneratorModal } from './MaterialGeneratorModal';

interface MaterialSelectorProps {
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (materials: Material[], saveAsTemplate?: boolean) => void;
  multiple?: boolean;
  maxSelection?: number;
  showSaveAsTemplateOption?: boolean;
  initialSelectedUrls?: string[];
  mediaKindFilter?: Material['media_kind'][];
}

export const MaterialSelector: React.FC<MaterialSelectorProps> = ({
  projectId,
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  maxSelection,
  showSaveAsTemplateOption = false,
  initialSelectedUrls,
  mediaKindFilter,
}) => {
  const t = useT(materialSelectorI18n);
  const { show } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const initialSelectionApplied = useRef(false);
  const hasCurrentPageContext = initialSelectedUrls !== undefined;
  const currentPageUrlSet = useMemo(
    () => new Set((initialSelectedUrls || []).map((url) => url.replace(/^https?:\/\/[^/]+/, '').split('?')[0])),
    [initialSelectedUrls],
  );
  const mediaKindFilterKey = mediaKindFilter?.join(',') || '';

  useEffect(() => {
    if (isOpen) {
      if (!projectsLoaded) {
        loadProjects();
      }
      loadMaterials();
      setShowAllProjects(false);
    }
  }, [isOpen, filterProjectId, projectsLoaded, mediaKindFilterKey]);

  useEffect(() => {
    if (isOpen) setSelectedMaterials(new Set());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) initialSelectionApplied.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || initialSelectionApplied.current || !initialSelectedUrls || materials.length === 0) return;
    const selectedKeys = materials
      .filter((material) => currentPageUrlSet.has(material.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]))
      .map((material) => material.id);
    setSelectedMaterials((previous) => {
      const next = new Set(selectedKeys);
      if (previous.size === next.size && [...previous].every((key) => next.has(key))) return previous;
      return next;
    });
    initialSelectionApplied.current = true;
  }, [currentPageUrlSet, initialSelectedUrls, isOpen, materials]);

  const loadProjects = async () => {
    try {
      const response = await listProjects(100, 0);
      if (response.data?.projects) {
        setProjects(response.data.projects);
        setProjectsLoaded(true);
      }
    } catch (error: any) {
      console.error('Failed to load projects:', error);
    }
  };

  const getMaterialKey = (m: Material): string => m.id;
  const getMaterialDisplayName = (m: Material) =>
    (m.prompt && m.prompt.trim()) ||
    (m.name && m.name.trim()) ||
    (m.original_filename && m.original_filename.trim()) ||
    (m.source_filename && m.source_filename.trim()) ||
    m.filename ||
    m.url;

  const loadMaterials = async () => {
    setIsLoading(true);
    try {
      const targetProjectId = filterProjectId === 'all' ? 'all' : filterProjectId === 'none' ? 'none' : filterProjectId;
      const response = await listMaterials(
        targetProjectId,
        mediaKindFilter?.length ? { mediaKind: mediaKindFilter } : undefined,
      );
      if (response.data?.materials) {
        setMaterials(response.data.materials);
      }
    } catch (error: any) {
      console.error('Failed to load materials:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.loadMaterialFailed'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMaterial = (material: Material) => {
    const key = getMaterialKey(material);
    if (multiple) {
      const newSelected = new Set(selectedMaterials);
      if (newSelected.has(key)) {
        newSelected.delete(key);
      } else {
        if (maxSelection && newSelected.size >= maxSelection) {
          show({
            message: t('material.messages.maxSelection', { count: maxSelection }),
            type: 'info',
          });
          return;
        }
        newSelected.add(key);
      }
      setSelectedMaterials(newSelected);
    } else {
      setSelectedMaterials(new Set([key]));
    }
  };

  const handleConfirm = () => {
    const selected = materials.filter((m) => selectedMaterials.has(getMaterialKey(m)));
    if (selected.length === 0) {
      show({ message: t('material.messages.selectAtLeastOne'), type: 'info' });
      return;
    }
    onSelect(selected, showSaveAsTemplateOption ? saveAsTemplate : undefined);
    onClose();
  };

  const handleClear = () => {
    setSelectedMaterials(new Set());
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a',
      'video/mp4', 'video/webm', 'video/quicktime',
      'text/plain', 'text/markdown', 'text/vtt', 'application/json', 'application/x-subrip',
    ];
    const allowedExtensions = ['.srt', '.md', '.txt', '.vtt', '.json', '.mp3', '.wav', '.m4a', '.mp4', '.webm', '.mov'];
    const lowerName = file.name.toLowerCase();
    if (!allowedTypes.includes(file.type) && !allowedExtensions.some((ext) => lowerName.endsWith(ext))) {
      show({ message: t('material.messages.unsupportedFormat'), type: 'error' });
      return;
    }

    setIsUploading(true);
    try {
      const targetProjectId = (filterProjectId === 'all' || filterProjectId === 'none')
        ? null
        : filterProjectId;

      const response = await uploadMaterial(
        file,
        targetProjectId,
        true
      );
      
      if (response.data) {
        show({ message: t('material.messages.uploadSuccess'), type: 'success' });
        loadMaterials();
      }
    } catch (error: any) {
      console.error('Failed to upload material:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.uploadFailed'),
        type: 'error',
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleGeneratorClose = () => {
    setIsGeneratorOpen(false);
    loadMaterials();
  };

  const handleDeleteMaterial = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    material: Material
  ) => {
    e.stopPropagation();
    const materialId = material.id;
    const key = getMaterialKey(material);

    if (!materialId) {
      show({ message: t('material.messages.cannotDelete'), type: 'error' });
      return;
    }

    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(materialId);
      return next;
    });

    try {
      await deleteMaterial(materialId);
      setMaterials((prev) => prev.filter((m) => getMaterialKey(m) !== key));
      setSelectedMaterials((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      show({ message: t('material.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to delete material:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.deleteFailed'),
        type: 'error',
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  };

  const renderProjectLabel = (p: Project) => {
    const text = p.idea_prompt || p.outline_text || `Project ${p.project_id.slice(0, 8)}`;
    return text.length > 20 ? `${text.slice(0, 20)}…` : text;
  };


  const renderMaterialPreview = (material: Material) => {
    const mediaKind = material.media_kind || 'image';
    const name = getMaterialDisplayName(material);
    if (mediaKind === 'image') {
      return <img src={getImageUrl(material.url)} alt={name} className="absolute inset-0 h-full w-full object-cover" />;
    }
    const iconClass = "mb-2 text-[var(--app-accent)]";
    const label = mediaKind === 'audio' ? '音频素材' : mediaKind === 'video' ? '视频素材' : '文本素材';
    const Icon = mediaKind === 'audio' ? Mic2 : mediaKind === 'video' ? Film : FileText;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--app-surface-muted)] p-3 text-center text-[var(--app-text-secondary)]">
        <Icon size={28} className={iconClass} />
        <span className="text-xs font-semibold">{label}</span>
        {material.mime_type && <span className="mt-1 max-w-full truncate text-[10px] text-[var(--app-text-tertiary)]">{material.mime_type}</span>}
      </div>
    );
  };

  const currentPageMaterials = materials.filter((material) => currentPageUrlSet.has(material.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]));
  const otherPageMaterials = materials.filter((material) => !currentPageUrlSet.has(material.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]));
  const renderMaterialGrid = (items: Material[]) => (
    <div className="grid max-h-[min(56vh,36rem)] grid-cols-2 gap-x-5 gap-y-6 overflow-y-auto p-5 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((material) => {
        const key = getMaterialKey(material);
        const isSelected = selectedMaterials.has(key);
        const isDeleting = deletingIds.has(material.id);
        return (
          <div
            key={key}
            role="checkbox"
            tabIndex={0}
            aria-checked={isSelected}
            onClick={() => handleSelectMaterial(material)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSelectMaterial(material);
              }
            }}
            className={`group relative aspect-video min-h-24 cursor-pointer overflow-hidden rounded-[var(--app-radius-control)] border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${
              isSelected
                ? 'border-[var(--app-accent)]'
                : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            {renderMaterialPreview(material)}
            <button
              type="button"
              onClick={(event) => handleDeleteMaterial(event, material)}
              disabled={isDeleting}
              className="absolute right-1 top-1 z-30 flex h-10 w-10 items-center justify-center rounded-full text-[var(--app-on-color)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={t('material.deleteMaterial')}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--app-error)] shadow-[var(--app-shadow-control)]">
                {isDeleting ? <RefreshCw size={12} className="animate-spin" /> : <X size={12} />}
              </span>
            </button>
            {isSelected && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color:var(--app-accent-soft)]">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-focus)] text-xs font-bold text-[var(--app-surface)]">✓</div>
              </div>
            )}
            <div
              className="absolute bottom-2 left-2 right-2 z-20 truncate rounded-[var(--app-radius-control)] bg-[color:var(--app-text)]/85 px-2 py-1 text-xs font-medium text-[var(--app-surface)] shadow-[var(--app-shadow-control)]"
              title={getMaterialDisplayName(material)}
            >
              {getMaterialDisplayName(material)}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('material.selectTitle')} size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-[var(--app-text-secondary)]">
              <span>{materials.length > 0 ? t('material.totalMaterials', { count: materials.length }) : t('material.noMaterials')}</span>
              {selectedMaterials.size > 0 && (
                <span className="ml-2 text-[var(--app-accent)]">
                  {t('material.selectedCount', { count: selectedMaterials.size })}
                </span>
              )}
              {isLoading && materials.length > 0 && (
                <RefreshCw size={14} className="animate-spin text-[var(--app-text-tertiary)]" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterProjectId}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'show_more') {
                    setShowAllProjects(true);
                    return;
                  }
                  setFilterProjectId(value);
                }}
                className="w-40 max-w-[200px] truncate rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent-soft)] sm:w-48"
              >
                <option value="all">{t('material.allMaterials')}</option>
                <option value="none">{t('material.unassociated')}</option>
                {projectId && (
                  <option value={projectId}>
                    {t('material.currentProject')}{projects.find(p => p.project_id === projectId) ? `: ${renderProjectLabel(projects.find(p => p.project_id === projectId)!)}` : ''}
                  </option>
                )}
                
                {showAllProjects ? (
                  <>
                    <option disabled>───────────</option>
                    {projects.filter(p => p.project_id !== projectId).map((p) => (
                      <option key={p.project_id} value={p.project_id} title={p.idea_prompt || p.outline_text}>
                        {renderProjectLabel(p)}
                      </option>
                    ))}
                  </>
                ) : (
                  projects.length > (projectId ? 1 : 0) && (
                    <option value="show_more">{t('material.viewMoreProjects')}</option>
                  )
                )}
              </select>
              
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={16} />}
                onClick={loadMaterials}
                disabled={isLoading}
              >
                {t('common.refresh')}
              </Button>
              
              <label className="inline-block cursor-pointer">
                <div className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-sm font-medium text-[var(--app-text)] transition hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                  <Upload size={16} />
                  <span>{isUploading ? t('common.uploading') : t('common.upload')}</span>
                </div>
                <input
                  type="file"
                  accept="image/*,audio/*,video/*,.txt,.md,.srt,.vtt,.json"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
              
              {projectId && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Sparkles size={16} />}
                  onClick={() => setIsGeneratorOpen(true)}
                >
                  {t('material.generateMaterial')}
                </Button>
              )}
              
              {selectedMaterials.size > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  {t('common.clearSelection')}
                </Button>
              )}
            </div>
          </div>

          {isLoading && materials.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[var(--app-text-tertiary)]">{t('common.loading')}</div>
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-4 py-12 text-[var(--app-text-tertiary)]">
              <ImageIcon size={48} className="mb-4 opacity-50" />
              <div className="text-sm">{t('material.noMaterials')}</div>
              <div className="text-xs mt-1">
                {projectId ? t('material.canUploadOrGenerate') : t('material.canUploadImages')}
              </div>
            </div>
          ) : hasCurrentPageContext ? (
            <div className="space-y-4">
              <section data-testid="material-current-page-section" className="space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold text-[var(--app-text)]">
                  <h3>{t('material.currentPageMaterials')}</h3>
                  <span className="text-xs font-normal text-[var(--app-text-tertiary)]">{currentPageMaterials.length}</span>
                </div>
                {currentPageMaterials.length > 0 ? renderMaterialGrid(currentPageMaterials) : (
                  <p className="rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border)] p-4 text-xs text-[var(--app-text-tertiary)]">暂无当前页面素材</p>
                )}
              </section>
              <details data-testid="material-other-pages-section" className="group rounded-[var(--app-radius-control)] border border-[var(--app-border)]">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-[var(--app-text)] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between">{t('material.otherPageMaterials')}<span className="text-xs font-normal text-[var(--app-text-tertiary)]">{otherPageMaterials.length}</span></span>
                </summary>
                {otherPageMaterials.length > 0 ? renderMaterialGrid(otherPageMaterials) : <p className="px-3 pb-3 text-xs text-[var(--app-text-tertiary)]">暂无其他页面素材</p>}
              </details>
            </div>
          ) : renderMaterialGrid(materials)}

          <div className="pt-4 border-t">
            {showSaveAsTemplateOption && (
              <div className="mb-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-accent)] focus:ring-[color:var(--app-accent-soft)]"
                  />
                  <span className="text-sm text-[var(--app-text)]">
                    {t('template.saveToLibraryOnUpload')}
                  </span>
                </label>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={selectedMaterials.size === 0}
              >
                {t('common.confirm')} ({selectedMaterials.size})
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      
      {projectId && (
        <MaterialGeneratorModal
          projectId={projectId}
          isOpen={isGeneratorOpen}
          onClose={handleGeneratorClose}
        />
      )}
    </>
  );
};

export const materialUrlToFile = async (
  material: Material,
  filename?: string
): Promise<File> => {
  const imageUrl = getImageUrl(material.url);
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const file = new File(
    [blob],
    filename || material.filename,
    { type: blob.type || 'image/png' }
  );
  return file;
};
