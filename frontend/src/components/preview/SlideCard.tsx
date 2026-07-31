import React, { memo, useRef } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { StatusBadge, Skeleton, useConfirm } from '@/components/shared';
import { getImageUrl, getStaticAssetUrl } from '@/api/client';
import type { Page } from '@/types';

// SlideCard 组件自包含翻译
const slideCardI18n = {
  zh: {
    slideCard: {
      notGenerated: "未生成",
      confirmDeletePage: "确定要删除这一页吗？",
      confirmDeleteTitle: "确认删除",
      coverPage: "封面",
      coverPageTooltip: "第一页为封面页，通常包含标题和副标题"
    }
  },
  en: {
    slideCard: {
      notGenerated: "Not Generated",
      confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete",
      coverPage: "Cover",
      coverPageTooltip: "This is the cover page, usually containing the title and subtitle"
    }
  }
};

interface SlideCardProps {
  page: Page;
  index: number;
  isSelected: boolean;
  isMultiSelectMode?: boolean;
  onSelect: (index: number, pageId?: string) => void;
  onEdit: (index: number) => void;
  onDelete: (pageId: string) => void;
  isGenerating?: boolean;
  aspectRatio?: string;
}

export const SlideCard: React.FC<SlideCardProps> = memo(function SlideCard({
  page,
  index,
  isSelected,
  isMultiSelectMode = false,
  onSelect,
  onEdit,
  onDelete,
  isGenerating = false,
  aspectRatio = '16:9',
}) {
  const renderCount = useRef(0);
  renderCount.current += 1;
  const t = useT(slideCardI18n);
  const { confirm, ConfirmDialog } = useConfirm();
  const imageUrl = page.generated_image_path
    ? getImageUrl(page.generated_image_path, page.updated_at)
    : '';
  
  const generating = isGenerating || page.status === 'QUEUED' || page.status === 'GENERATING';

  return (
    <div
      className={`group cursor-pointer rounded-[var(--app-radius-card)] border transition-colors ${
        isSelected ? 'border-[var(--app-accent)]' : 'border-transparent'
      }`}
      data-testid={`ppt-slide-card-${page.id || index}`}
      data-render-count={import.meta.env.MODE === 'test' ? renderCount.current : undefined}
      data-multiselect={import.meta.env.MODE === 'test' ? isMultiSelectMode : undefined}
      onClick={() => onSelect(index, page.id)}
    >
      {/* 缩略图 */}
      <div className="relative mb-2 overflow-hidden rounded-[var(--app-radius-card)] bg-[var(--app-surface-muted)]" style={{ aspectRatio: aspectRatio.replace(':', '/') }}>
        {generating ? (
          <Skeleton className="w-full h-full" />
        ) : page.generated_image_path ? (
          <>
            <img
              src={imageUrl}
              alt={`Slide ${index + 1}`}
              className="w-full h-full object-cover"
            />
            {/* 悬停操作 */}
            <div className="absolute inset-0 bg-[color:var(--app-surface)]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(index);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface)] transition-colors hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                aria-label="编辑页面"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  confirm(
                    t('slideCard.confirmDeletePage'),
                    () => page.id && onDelete(page.id),
                    { title: t('slideCard.confirmDeleteTitle'), variant: 'danger' }
                  );
                }}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface)] transition-colors hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-error-soft)]"
                aria-label="删除页面"
              >
                <Trash2 size={18} className="text-[var(--app-error)]" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--app-text-tertiary)]">
            <div className="text-center">
              <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="h-8 w-auto mx-auto mb-1 opacity-70" />
              <div className="text-xs">{t('slideCard.notGenerated')}</div>
            </div>
          </div>
        )}
        
        {/* 状态标签 */}
        <div className="absolute bottom-2 right-2">
          <StatusBadge status={page.status} />
        </div>
      </div>

      {/* 标题 */}
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium ${
            isSelected ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'
          }`}
        >
          {index + 1}. {page.outline_content?.title}
        </span>
        {index === 0 && (
          <span
            className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--app-text-secondary)] bg-[var(--app-surface-muted)]"
            title={t('slideCard.coverPageTooltip')}
          >
            {t('slideCard.coverPage')}
          </span>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}, (previous, next) => (
  previous.page === next.page
  && previous.index === next.index
  && previous.isSelected === next.isSelected
  && previous.isMultiSelectMode === next.isMultiSelectMode
  && previous.isGenerating === next.isGenerating
  && previous.aspectRatio === next.aspectRatio
));
