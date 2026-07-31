import React, { useState, useEffect } from 'react';
import { Clock, Download, FileText, ChevronRight, Trash2, Pencil, Film, Mic2, MoreHorizontal, Presentation } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Card } from '@/components/shared';
import { getProjectTitle, getFirstPageImage, formatDate, getStatusText, getStatusColor } from '@/utils/projectUtils';
import type { Project } from '@/types';

// ProjectCard 组件自包含翻译
const projectCardI18n = {
  zh: {
    projectCard: {
      pages: "{{count}} 页",
      page: "第 {{num}} 页",
      typeIdea: "一句话生成",
      typeOutline: "大纲生成",
      typeDescription: "描述生成",
      typeRenovation: "翻新",
      typeProject: "项目",
    }
  },
  en: {
    projectCard: {
      pages: "{{count}} pages",
      page: "Page {{num}}",
      typeIdea: "Idea",
      typeOutline: "Outline",
      typeDescription: "Description",
      typeRenovation: "Renovation",
      typeProject: "Project",
    }
  }
};

export interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  isEditing: boolean;
  editingTitle: string;
  onSelect: (project: Project) => void;
  onToggleSelect: (projectId: string) => void;
  onDelete: (e: React.MouseEvent, project: Project) => void;
  onExport: (e: React.MouseEvent, project: Project) => void;
  onStartEdit: (e: React.MouseEvent, project: Project) => void;
  onTitleChange: (title: string) => void;
  onTitleKeyDown: (e: React.KeyboardEvent, projectId: string) => void;
  onSaveEdit: (projectId: string) => void;
  isBatchMode: boolean;
  layout?: 'list' | 'grid';
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected,
  isEditing,
  editingTitle,
  onSelect,
  onToggleSelect,
  onDelete,
  onExport,
  onStartEdit,
  onTitleChange,
  onTitleKeyDown,
  onSaveEdit,
  isBatchMode,
  layout = 'list',
}) => {
  const t = useT(projectCardI18n);
  // 检测屏幕尺寸，只在非手机端加载图片（必须在早期返回之前声明hooks）
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      // sm breakpoint is 640px
      setShouldLoadImage(window.innerWidth >= 640);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const projectId = project.id || project.project_id;
  if (!projectId) return null;

  const title = getProjectTitle(project);
  const pageCount = project.pages?.length || 0;
  const statusText = getStatusText(project);
  const statusColor = getStatusColor(project);
  const typeKey = project.creation_type === 'outline'
    ? 'typeOutline'
    : project.creation_type === 'description' || project.creation_type === 'descriptions'
      ? 'typeDescription'
      : project.creation_type === 'renovation' || project.creation_type === 'ppt_renovation'
        ? 'typeRenovation'
        : project.creation_type === 'idea'
          ? 'typeIdea'
          : 'typeProject';
  
  const firstPageImage = shouldLoadImage ? getFirstPageImage(project) : null;
  const initializedKinds = project.workspaces?.filter((workspace) => workspace.state !== 'uninitialized').map((workspace) => workspace.kind) || ['ppt'];
  const workspaceBadges = [
    { kind: 'ppt', label: 'PPT', icon: Presentation },
    { kind: 'video', label: '视频', icon: Film },
    { kind: 'podcast', label: '播客', icon: Mic2 },
  ].filter((item) => initializedKinds.includes(item.kind as 'ppt' | 'video' | 'podcast'));
  const handleOpenKeyDown = (event: React.KeyboardEvent) => {
    if (isBatchMode || isEditing) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement).closest('button,input')) return;
    event.preventDefault();
    onSelect(project);
  };

  if (layout === 'grid') {
    return (
      <Card
        className={`group relative overflow-hidden p-0 transition-[background-color,border-color,box-shadow,transform] motion-safe:hover:-translate-y-[3px] motion-safe:focus-visible:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${
          isSelected
            ? 'border-[var(--app-accent)] bg-[var(--app-accent-blue-soft)] shadow-[var(--app-shadow-soft)]'
            : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)] hover:shadow-[var(--app-shadow-medium)]'
        } ${isBatchMode ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={() => onSelect(project)}
      >
        <div className={`absolute left-3 top-3 z-10 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${isSelected || isBatchMode ? 'opacity-100' : 'opacity-0'}`} onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(projectId)} aria-label={title} className="h-4 w-4 cursor-pointer rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[var(--app-accent-soft)]" />
        </div>
        <div className="absolute right-3 top-3 z-10 rounded-[var(--app-radius-control)] bg-[var(--app-surface)] px-2 py-1 text-xs font-medium shadow-[var(--app-shadow-card)]">
          <span className={statusColor}>{statusText}</span>
        </div>
        <div className="aspect-video overflow-hidden border-b border-[var(--app-border)] bg-[var(--app-surface-muted)]">
          {firstPageImage ? (
            <img src={firstPageImage} alt={t('projectCard.page', { num: 1 })} className="h-full w-full object-cover" />
          ) : (
            <div className="relative flex h-full items-center justify-center bg-[var(--app-surface-muted)] text-[var(--app-text-tertiary)]">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1"><i className="flex-1 bg-[var(--app-error)]" /><i className="flex-1 bg-[var(--app-accent-amber)]" /><i className="flex-1 bg-[var(--app-success)]" /></span>
              <span className="flex h-14 w-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[4px_4px_0_var(--app-border)]"><FileText size={22} aria-hidden="true" /></span>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex min-h-7 items-start gap-2">
            {isEditing ? (
              <input type="text" value={editingTitle} onChange={(event) => onTitleChange(event.target.value)} onKeyDown={(event) => onTitleKeyDown(event, projectId)} onBlur={() => onSaveEdit(projectId)} autoFocus className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[15px] font-semibold text-[var(--app-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]" onClick={(event) => event.stopPropagation()} />
            ) : (
              <h3
                role={isBatchMode ? undefined : 'button'}
                tabIndex={isBatchMode ? undefined : 0}
                aria-label={isBatchMode ? undefined : title}
                onKeyDown={handleOpenKeyDown}
                className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                title={title}
              >
                {title}
              </h3>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--app-text-secondary)]">
            {workspaceBadges.map(({ kind, label, icon: Icon }) => <span key={kind} className="flex items-center gap-1 rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-2 py-1 font-medium"><Icon size={12} />{label}</span>)}
            {pageCount > 0 && <span className="flex items-center gap-1"><FileText size={14} />{t('projectCard.pages', { count: pageCount })}</span>}
            <span className="flex items-center gap-1"><Clock size={14} className="text-[var(--app-accent-amber)]" />{formatDate(project.updated_at || project.created_at)}</span>
          </div>
          <div className={`relative mt-3 flex items-center justify-end gap-1 border-t border-[var(--app-border)] pt-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
            <button type="button" onClick={(event) => onStartEdit(event, project)} className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] [@media(hover:none)]:hidden" aria-label={t('common.edit')} title={t('common.edit')}><Pencil size={16} /></button>
            <button type="button" onClick={(event) => onExport(event, project)} className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] [@media(hover:none)]:hidden" aria-label="导出" title="导出"><Download size={16} /></button>
            <button type="button" onClick={(event) => onDelete(event, project)} className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] [@media(hover:none)]:hidden" aria-label={t('common.delete')} title={t('common.delete')}><Trash2 size={16} /></button>
            <details className="group/more hidden [@media(hover:none)]:block" onClick={(event) => event.stopPropagation()}>
              <summary role="button" className="flex h-10 w-10 list-none items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]" aria-label="更多操作"><MoreHorizontal size={17} /></summary>
              <div role="menu" className="absolute bottom-11 right-0 z-20 min-w-28 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-[var(--app-shadow-medium)]">
                <button type="button" role="menuitem" onClick={(event) => onStartEdit(event, project)} className="flex h-10 w-full items-center gap-2 rounded-[var(--app-radius-control)] px-3 text-sm hover:bg-[var(--app-surface-hover)]"><Pencil size={15} />{t('common.edit')}</button>
                <button type="button" role="menuitem" onClick={(event) => onExport(event, project)} className="flex h-10 w-full items-center gap-2 rounded-[var(--app-radius-control)] px-3 text-sm hover:bg-[var(--app-surface-hover)]"><Download size={15} />导出</button>
                <button type="button" role="menuitem" onClick={(event) => onDelete(event, project)} className="flex h-10 w-full items-center gap-2 rounded-[var(--app-radius-control)] px-3 text-sm text-[var(--app-error)] hover:bg-[var(--app-surface-hover)]"><Trash2 size={15} />{t('common.delete')}</button>
              </div>
            </details>
            <ChevronRight size={18} className="ml-1 text-[var(--app-text-tertiary)]" />
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card
      className={`group p-3 transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${
        isSelected 
          ? 'border-[var(--app-accent)] bg-[var(--app-accent-blue-soft)] shadow-[var(--app-shadow-soft)]'
          : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)]'
      } ${isBatchMode ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={() => onSelect(project)}
    >
      <div className="flex items-start gap-3">
        {/* 复选框 */}
        <div className="pt-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(projectId)}
            aria-label={title}
            className="h-4 w-4 cursor-pointer rounded border-[var(--app-border)] text-[var(--app-accent)] focus-visible:ring-[var(--app-accent-soft)]"
          />
        </div>
        
        {/* 中间：项目信息 */}
        <div className="flex-1 min-w-0 py-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => onTitleKeyDown(e, projectId)}
                onBlur={() => onSaveEdit(projectId)}
                autoFocus
                className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[15px] font-semibold text-[var(--app-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3
                role={isBatchMode ? undefined : 'button'}
                tabIndex={isBatchMode ? undefined : 0}
                aria-label={isBatchMode ? undefined : title}
                onKeyDown={handleOpenKeyDown}
                className="min-w-0 flex-1 truncate rounded-[var(--app-radius-control)] text-left text-[15px] font-semibold text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                title={title}
              >
                {title}
              </h3>
            )}
            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 ${statusColor}`}>
              {statusText}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--app-text-secondary)] md:gap-4">
            <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-2 py-1 font-medium text-[var(--app-text-secondary)]">
              {t(`projectCard.${typeKey}`)}
            </span>
            <span className="flex items-center gap-1.5">
              <FileText size={16} className="text-[var(--app-accent)]" />
              {t('projectCard.pages', { count: pageCount })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={16} className="text-[var(--app-accent-amber)]" />
              {formatDate(project.updated_at || project.created_at)}
            </span>
          </div>
        </div>
        
        {/* 右侧：图片预览 */}
        <div className="hidden aspect-video w-40 flex-shrink-0 overflow-hidden rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] sm:block md:w-48">
          {firstPageImage ? (
            <img
              src={firstPageImage}
              alt={t('projectCard.page', { num: 1 })}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--app-text-tertiary)]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--app-radius-card)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] shadow-[var(--app-shadow-card)] ring-1 ring-[var(--app-border)]">
                <FileText size={22} />
              </span>
            </div>
          )}
        </div>
        
        {/* 右侧：操作按钮 */}
        <div className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 flex-shrink-0 pt-1 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
          <button
            type="button"
            onClick={(e) => onStartEdit(e, project)}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
            aria-label={t('common.edit')}
            title={t('common.edit')}
          >
            <Pencil size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button
            type="button"
            onClick={(e) => onExport(e, project)}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
            aria-label="导出"
            title="导出"
          >
            <Download size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(e, project)}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
            aria-label={t('common.delete')}
            title={t('common.delete')}
          >
            <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <ChevronRight size={18} className="text-[var(--app-text-tertiary)] md:h-5 md:w-5" />
        </div>
      </div>
    </Card>
  );
};
