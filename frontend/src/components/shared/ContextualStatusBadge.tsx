import React from 'react';
import { cn } from '@/utils';
import type { Page } from '@/types';
import { usePageStatus, type PageStatusContext } from '@/hooks/usePageStatus';

interface ContextualStatusBadgeProps {
  page: Page;
  /** 上下文：description（描述页）、image（图片页）、full（完整状态） */
  context?: PageStatusContext;
  /** 是否显示详细描述（悬停提示） */
  showDescription?: boolean;
}

/**
 * 根据上下文智能显示状态的徽章
 * 
 * - 在描述编辑页面：只显示描述相关状态
 * - 在图片预览页面：显示图片生成状态
 * - 其他场景：显示完整页面状态
 */
export const ContextualStatusBadge: React.FC<ContextualStatusBadgeProps> = ({
  page,
  context = 'full',
  showDescription = true,
}) => {
  const { status, label, description } = usePageStatus(page, context);

  const statusConfig: Record<string, string> = {
    DRAFT: 'border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)]',
    GENERATING_DESCRIPTION: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
    DESCRIPTION_GENERATED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
    NATIVE_GENERATED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
    QUEUED: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
    GENERATING: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
    COMPLETED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
    FAILED: 'border-[color:var(--app-error)] bg-[var(--app-surface)] text-[var(--app-error)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--app-radius-control)] border px-2.5 py-0.5 text-xs font-medium',
        statusConfig[status]
      )}
      title={showDescription ? description : undefined}
    >
      {label}
    </span>
  );
};

