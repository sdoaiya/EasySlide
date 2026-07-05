import React, { useState, useEffect } from 'react';
import { Clock, FileText, ChevronRight, Trash2, Pencil } from 'lucide-react';
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
  onStartEdit: (e: React.MouseEvent, project: Project) => void;
  onTitleChange: (title: string) => void;
  onTitleKeyDown: (e: React.KeyboardEvent, projectId: string) => void;
  onSaveEdit: (projectId: string) => void;
  isBatchMode: boolean;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected,
  isEditing,
  editingTitle,
  onSelect,
  onToggleSelect,
  onDelete,
  onStartEdit,
  onTitleChange,
  onTitleKeyDown,
  onSaveEdit,
  isBatchMode,
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

  return (
    <Card
      className={`p-4 md:p-5 rounded-[18px] transition-all shadow-sm hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)] ${
        isSelected 
          ? 'border-2 border-blue-400 bg-sky-50 dark:bg-background-secondary' 
          : 'border border-slate-200 bg-white dark:border-border-primary'
      } ${isBatchMode ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={() => onSelect(project)}
    >
      <div className="flex items-start gap-3 md:gap-5">
        {/* 复选框 */}
        <div className="pt-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(projectId)}
            className="w-4 h-4 text-blue-600 border-slate-300 dark:border-border-primary rounded focus:ring-blue-500 cursor-pointer"
          />
        </div>
        
        {/* 中间：项目信息 */}
        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-center gap-2 md:gap-3 mb-4 flex-wrap">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => onTitleKeyDown(e, projectId)}
                onBlur={() => onSaveEdit(projectId)}
                autoFocus
                className="text-lg md:text-xl font-bold text-slate-950 dark:text-foreground-primary px-2 py-1 border border-blue-400 rounded bg-white dark:bg-background-primary focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 
                className={`text-lg md:text-xl font-bold text-slate-950 dark:text-foreground-primary truncate flex-1 min-w-0 ${
                  isBatchMode 
                    ? 'cursor-default' 
                    : 'cursor-pointer hover:text-blue-600 transition-colors'
                }`}
                onClick={(e) => onStartEdit(e, project)}
                title={isBatchMode ? undefined : t('common.edit')}
              >
                {title}
              </h3>
            )}
            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 ${statusColor}`}>
              {statusText}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-5 text-sm md:text-base text-slate-500 dark:text-foreground-tertiary flex-wrap">
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
              {t(`projectCard.${typeKey}`)}
            </span>
            <span className="flex items-center gap-1.5">
              <FileText size={16} className="text-blue-600" />
              {t('projectCard.pages', { count: pageCount })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={16} className="text-orange-500" />
              {formatDate(project.updated_at || project.created_at)}
            </span>
          </div>
        </div>
        
        {/* 右侧：图片预览 */}
        <div className="hidden sm:block w-44 h-24 md:w-72 md:h-36 rounded-xl overflow-hidden bg-slate-100 dark:bg-background-secondary border border-slate-200 dark:border-border-primary flex-shrink-0">
          {firstPageImage ? (
            <img
              src={firstPageImage}
              alt={t('projectCard.page', { num: 1 })}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                <FileText size={22} />
              </span>
            </div>
          )}
        </div>
        
        {/* 右侧：操作按钮 */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 flex-shrink-0 pt-1">
          <button
            onClick={(e) => onStartEdit(e, project)}
            className="p-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
            title={t('common.edit')}
          >
            <Pencil size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button
            onClick={(e) => onDelete(e, project)}
            className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <ChevronRight size={18} className="text-gray-400 md:w-5 md:h-5" />
        </div>
      </div>
    </Card>
  );
};
