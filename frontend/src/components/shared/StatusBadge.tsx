import React from 'react';
import { cn } from '@/utils';
import { useT } from '@/hooks/useT';
import type { PageStatus } from '@/types';

// Status 组件自包含翻译
const statusI18n = {
  zh: {
    status: {
      draft: "草稿", generatingDescription: "描述生成中", descriptionGenerated: "已生成描述", queued: "排队中", generating: "生成中",
      completed: "已完成", failed: "失败", unknown: "未知",
      notGeneratedDesc: "未生成描述", noDescription: "还没有生成描述",
      descGenerated: "描述已生成", notGeneratedImage: "未生成图片",
      waitingForImage: "描述已生成，等待生成图片", generatingImage: "正在生成图片",
      imageFailed: "图片生成失败", imageCompleted: "图片已生成",
      draftStage: "草稿阶段", allCompleted: "全部完成", statusUnknown: "状态未知"
    }
  },
  en: {
    status: {
      draft: "Draft", generatingDescription: "Generating Description", descriptionGenerated: "Description Generated", queued: "Queued", generating: "Generating",
      completed: "Completed", failed: "Failed", unknown: "Unknown",
      notGeneratedDesc: "Description Not Generated", noDescription: "No description generated yet",
      descGenerated: "Description Generated", notGeneratedImage: "Image Not Generated",
      waitingForImage: "Description generated, waiting for image", generatingImage: "Generating image",
      imageFailed: "Image generation failed", imageCompleted: "Image generated",
      draftStage: "Draft Stage", allCompleted: "All Completed", statusUnknown: "Status Unknown"
    }
  }
};

interface StatusBadgeProps {
  status: PageStatus;
}

const statusClassNames: Record<PageStatus, string> = {
  DRAFT: 'border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)]',
  GENERATING_DESCRIPTION: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
  DESCRIPTION_GENERATED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
  NATIVE_GENERATED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
  QUEUED: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
  GENERATING: 'border-[color:var(--app-index-yellow)] bg-[var(--app-surface)] text-[var(--app-index-yellow)] animate-pulse',
  COMPLETED: 'border-[color:var(--app-index-green)] bg-[var(--app-surface)] text-[var(--app-index-green)]',
  FAILED: 'border-[color:var(--app-error)] bg-[var(--app-surface)] text-[var(--app-error)]',
};

const statusLabelKeys: Record<PageStatus, string> = {
  DRAFT: 'status.draft',
  GENERATING_DESCRIPTION: 'status.generatingDescription',
  DESCRIPTION_GENERATED: 'status.descriptionGenerated',
  NATIVE_GENERATED: 'status.completed',
  QUEUED: 'status.queued',
  GENERATING: 'status.generating',
  COMPLETED: 'status.completed',
  FAILED: 'status.failed',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const t = useT(statusI18n);
  const className = statusClassNames[status];
  const labelKey = statusLabelKeys[status];
  
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn(
        'inline-flex items-center rounded-[var(--app-radius-control)] border px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      {t(labelKey)}
    </span>
  );
};
