import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Edit2, Trash2, Check, X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import { Card, useConfirm, Markdown, ShimmerOverlay, MaterialSelector } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import type { Page, Material } from '@/types';

// OutlineCard 组件自包含翻译
const outlineCardI18n = {
  zh: {
    outlineCard: {
      page: "第 {{num}} 页", chapter: "章节", titleLabel: "标题",
      keyPointsPlaceholder: "要点（每行一个，支持粘贴图片）", confirmDeletePage: "确定要删除这一页吗？",
      confirmDeleteTitle: "确认删除",
      uploadingImage: "正在上传图片...",
      coverPage: "封面",
      coverPageTooltip: "第一页为封面页，通常包含标题和副标题"
    }
  },
  en: {
    outlineCard: {
      page: "Page {{num}}", chapter: "Chapter", titleLabel: "Title",
      keyPointsPlaceholder: "Key points (one per line, paste images supported)", confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete",
      uploadingImage: "Uploading image...",
      coverPage: "Cover",
      coverPageTooltip: "This is the cover page, usually containing the title and subtitle"
    }
  }
};

interface OutlineCardProps {
  page: Page;
  index: number;
  projectId?: string;
  showToast: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
  onUpdate: (data: Partial<Page>) => void;
  onDelete: () => void;
  onClick: () => void;
  isSelected: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isAiRefining?: boolean;
}

export const OutlineCard: React.FC<OutlineCardProps> = ({
  page,
  index,
  projectId,
  showToast,
  onUpdate,
  onDelete,
  onClick,
  isSelected,
  dragHandleProps,
  isAiRefining = false,
}) => {
  const t = useT(outlineCardI18n);
  const { confirm, ConfirmDialog } = useConfirm();
  const outline = page.outline_content ?? { title: '', points: [] as string[] };
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(outline.title);
  const [editPoints, setEditPoints] = useState(outline.points.join('\n'));
  const [editPart, setEditPart] = useState(page.part || '');
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const textareaRef = useRef<MarkdownTextareaRef>(null);

  // Callback to insert at cursor position in the textarea
  const insertAtCursor = useCallback((markdown: string) => {
    textareaRef.current?.insertAtCursor(markdown);
  }, []);

  const { handlePaste, handleFiles, isUploading } = useImagePaste({
    projectId,
    setContent: setEditPoints,
    showToast: showToast,
    insertAtCursor,
  });

  const handleMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setEditPoints);
    textareaRef.current?.insertAtCursor(markdown + '\n');
  }, []);

  // 当 page prop 变化时，同步更新本地编辑状态（如果不在编辑模式）
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(outline.title);
      setEditPoints(outline.points.join('\n'));
      setEditPart(page.part || '');
    }
  }, [outline.title, outline.points, page.part, isEditing]);

  const handleSave = () => {
    onUpdate({
      outline_content: {
        title: editTitle,
        points: editPoints.split('\n').filter((p) => p.trim()),
      },
      part: editPart.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(outline.title);
    setEditPoints(outline.points.join('\n'));
    setEditPart(page.part || '');
    setIsEditing(false);
  };

  return (
    <Card
      className={`relative rounded-[var(--app-radius-card)] p-5 md:p-6 transition-[background-color,border-color,box-shadow,transform] ${
        isSelected
          ? 'border border-[var(--app-accent)] bg-[var(--app-surface)] shadow-[var(--app-shadow-soft)]'
          : 'border border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)]'
      }`}
      onClick={!isEditing ? onClick : undefined}
    >
      <ShimmerOverlay show={isAiRefining} />

      <div className="flex items-start gap-4 relative z-10">
        {/* 拖拽手柄 */}
        <div
          {...dragHandleProps}
          className="flex-shrink-0 cursor-move pt-1 text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
        >
          <GripVertical size={18} />
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {/* 页码和章节 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-[var(--app-text)]">
              {t('outlineCard.page', { num: index + 1 })}
            </span>
            {index === 0 && !isEditing && (
              <span
                className="rounded-md bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--app-text-secondary)]"
                title={t('outlineCard.coverPageTooltip')}
              >
                {t('outlineCard.coverPage')}
              </span>
            )}
            {isEditing ? (
              <input
                type="text"
                value={editPart}
                onChange={(e) => setEditPart(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-24 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-xs text-[var(--app-text)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none"
                placeholder={t('outlineCard.chapter')}
              />
            ) : (
              page.part && (
                <span className="rounded-md bg-[color:var(--app-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--app-accent)]">
                  {page.part}
                </span>
              )
            )}
          </div>

          {isEditing ? (
            /* 编辑模式 */
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[var(--app-text)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none"
                placeholder={t('outlineCard.titleLabel')}
              />
              <div>
                <MarkdownTextarea
                  ref={textareaRef}
                  value={editPoints}
                  onChange={setEditPoints}
                  onPaste={handlePaste}
                  onFiles={handleFiles}
                  onSelectFromLibrary={() => setIsMaterialSelectorOpen(true)}
                  rows={5}
                  placeholder={t('outlineCard.keyPointsPlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="rounded-[var(--app-radius-control)] px-3 py-1.5 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]"
                >
                  <X size={16} className="inline mr-1" />
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUploading}
              className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-3 py-1.5 text-sm text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={16} className="inline mr-1" />
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            /* 查看模式 */
            <div>
              <h4 className="mb-3 text-lg font-bold text-[var(--app-text)]">
                {outline.title}
              </h4>
              <div className="text-base leading-8 text-[var(--app-text-secondary)]">
                <Markdown>{outline.points.join('\n')}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex-shrink-0 flex gap-2 pr-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="rounded-[var(--app-radius-control)] p-1.5 text-[var(--app-accent)] transition-colors hover:bg-[var(--app-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
              aria-label={t('common.edit')}
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirm(
                  t('outlineCard.confirmDeletePage'),
                  onDelete,
                  { title: t('outlineCard.confirmDeleteTitle'), variant: 'danger' }
                );
              }}
              className="rounded-[var(--app-radius-control)] p-1.5 text-[var(--app-error)] transition-colors hover:bg-[var(--app-error-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-error-soft)]"
              aria-label={t('common.delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      {ConfirmDialog}
      <MaterialSelector
        projectId={projectId}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleMaterialSelect}
        multiple
        mediaKindFilter={['image']}
      />
    </Card>
  );
};
