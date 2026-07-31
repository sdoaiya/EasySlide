import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, RefreshCw, X, FileText } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { listMaterials, deleteMaterial, listProjectReferenceFiles, type Material, type ReferenceFile } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import { ReferenceFileCard } from './ReferenceFileCard';

// ProjectResourcesList 组件自包含翻译
const projectResourcesI18n = {
  zh: {
    projectResources: {
      uploadedFiles: "已上传的文件", uploadedImages: "已上传图片",
      refreshList: "刷新列表", imageLoadFailed: "图片加载失败", deleteThisMaterial: "删除此素材"
    },
    material: { messages: { loadMaterialFailed: "加载素材失败", deleteSuccess: "素材已删除", deleteFailed: "删除素材失败" } }
  },
  en: {
    projectResources: {
      uploadedFiles: "Uploaded Files", uploadedImages: "Uploaded Images",
      refreshList: "Refresh List", imageLoadFailed: "Image load failed", deleteThisMaterial: "Delete this material"
    },
    material: { messages: { loadMaterialFailed: "Failed to load materials", deleteSuccess: "Material deleted", deleteFailed: "Failed to delete material" } }
  }
};

interface ProjectResourcesListProps {
  projectId: string | null;
  className?: string;
  showFiles?: boolean; // 是否显示参考文件
  showImages?: boolean; // 是否显示图片素材
  onFileClick?: (fileId: string) => void;
  onImageClick?: (material: Material) => void;
  showToast?: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
}

/**
 * 项目资源列表组件
 * 统一展示项目的参考文件和图片素材
 */
export const ProjectResourcesList: React.FC<ProjectResourcesListProps> = ({
  projectId,
  className = 'mb-4',
  showFiles = true,
  showImages = true,
  onFileClick,
  onImageClick,
  showToast,
}) => {
  const t = useT(projectResourcesI18n);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<Set<string>>(new Set());
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());

  // 加载素材列表
  const loadMaterials = useCallback(async () => {
    if (!projectId || !showImages) return;
    
    setIsLoadingMaterials(true);
    try {
      const response = await listMaterials(projectId);
      if (response.data?.materials) {
        setMaterials(response.data.materials);
      }
    } catch (error: any) {
      console.error('Load materials failed:', error);
      showToast?.({ message: `${t('material.messages.loadMaterialFailed')}: ${error.message || t('common.unknownError')}`, type: 'error' });
    } finally {
      setIsLoadingMaterials(false);
    }
  }, [projectId, showImages]);

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    if (!projectId || !showFiles) return;
    
    setIsLoadingFiles(true);
    try {
      const response = await listProjectReferenceFiles(projectId);
      if (response.data?.files) {
        setFiles(response.data.files);
      }
    } catch (error: any) {
      console.error('Load files failed:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [projectId, showFiles]);

  useEffect(() => {
    loadMaterials();
    loadFiles();
  }, [loadMaterials, loadFiles]);

  // 删除素材
  const handleDeleteMaterial = async (
    e: React.MouseEvent<HTMLButtonElement>,
    materialId: string
  ) => {
    e.stopPropagation();
    
    setDeletingMaterialIds(prev => new Set(prev).add(materialId));
    
    try {
      await deleteMaterial(materialId);
      setMaterials(prev => prev.filter(m => m.id !== materialId));
      showToast?.({ message: t('material.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Delete material failed:', error);
      showToast?.({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.deleteFailed'),
        type: 'error',
      });
    } finally {
      setDeletingMaterialIds(prev => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  };

  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
  };

  const handleFileDelete = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const getMaterialDisplayName = (m: Material) =>
    (m.prompt && m.prompt.trim()) ||
    (m.name && m.name.trim()) ||
    (m.original_filename && m.original_filename.trim()) ||
    (m.source_filename && m.source_filename.trim()) ||
    m.filename ||
    m.url;

  // 如果没有项目ID，不显示
  if (!projectId) {
    return null;
  }

  // 如果两个都不显示任何内容，则不渲染
  if ((!showFiles || files.length === 0) && (!showImages || materials.length === 0)) {
    return null;
  }

  return (
    <div className={className}>
      {/* 参考文件列表 */}
      {showFiles && files.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--app-text-tertiary)]" />
              <span className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('projectResources.uploadedFiles')} ({files.length})
              </span>
            </div>
            <button
              onClick={loadFiles}
              disabled={isLoadingFiles}
              className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
              aria-label={t('projectResources.refreshList')}
              title={t('projectResources.refreshList')}
            >
              <RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="space-y-2">
            {files.map(file => (
              <ReferenceFileCard
                key={file.id}
                file={file}
                onDelete={handleFileDelete}
                onStatusChange={handleFileStatusChange}
                deleteMode="remove"
                onClick={() => onFileClick?.(file.id)}
                showToast={showToast}
              />
            ))}
          </div>
        </div>
      )}

      {/* 图片素材列表 */}
      {showImages && materials.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-[var(--app-text-tertiary)]" />
              <span className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('projectResources.uploadedImages')} ({materials.length})
              </span>
            </div>
            <button
              onClick={loadMaterials}
              disabled={isLoadingMaterials}
              className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
              aria-label={t('projectResources.refreshList')}
              title={t('projectResources.refreshList')}
            >
              <RefreshCw size={14} className={isLoadingMaterials ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* 横向滚动的图片列表 */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {materials.map((material) => {
              const isDeleting = deletingMaterialIds.has(material.id);
              return (
                <div
                  key={material.id}
                  className="group relative flex-shrink-0 cursor-pointer rounded-[var(--app-radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                  role={onImageClick ? 'button' : undefined}
                  tabIndex={onImageClick ? 0 : undefined}
                  onClick={() => onImageClick?.(material)}
                  onKeyDown={(event) => {
                    if (onImageClick && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onImageClick(material);
                    }
                  }}
                >
                  {/* 图片容器 */}
                  <div className="relative h-32 w-32 overflow-hidden rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] transition-colors hover:border-[var(--app-accent)]">
                    {failedImageUrls.has(material.url) ? (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-[var(--app-text-tertiary)]">
                        {t('projectResources.imageLoadFailed')}
                      </div>
                    ) : (
                      <img
                        src={getImageUrl(material.url)}
                        alt={getMaterialDisplayName(material)}
                        className="w-full h-full object-cover"
                        onError={() => setFailedImageUrls(prev => new Set(prev).add(material.url))}
                      />
                    )}

                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => handleDeleteMaterial(e, material.id)}
                      disabled={isDeleting}
                      className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-error)] text-[var(--app-on-color)] opacity-100 transition-opacity hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      title={t('projectResources.deleteThisMaterial')}
                      aria-label={t('projectResources.deleteThisMaterial')}
                    >
                      {isDeleting ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>

                    {/* 悬浮时显示文件名 */}
                    <div className="absolute inset-x-0 bottom-0 bg-[color:var(--app-surface)]/85 text-[var(--app-text)] text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                      {getMaterialDisplayName(material)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectResourcesList;

