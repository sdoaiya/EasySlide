import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils';

interface ProgressData {
  total: number;
  completed: number;
  percent?: number;
  current_step?: string;
  messages?: string[];
}

interface LoadingProps {
  fullscreen?: boolean;
  message?: string;
  progress?: ProgressData;
  /** Callback when user clicks "Run in Background" button */
  onBackgroundClick?: () => void;
  /** Label for the background button */
  backgroundButtonLabel?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  fullscreen = false,
  message,
  progress,
  onBackgroundClick,
  backgroundButtonLabel,
}) => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const defaultMessage = message || t('common.loading');
  const defaultBackgroundLabel = backgroundButtonLabel || t('common.runInBackground');

  // 自动滚动到最新消息
  useEffect(() => {
    if (messagesEndRef.current) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      messagesEndRef.current.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [progress?.messages]);

  // 计算进度百分比
  const getPercent = () => {
    if (!progress) return 0;
    if (progress.percent !== undefined) return progress.percent;
    if (progress.total > 0) return Math.round((progress.completed / progress.total) * 100);
    return 0;
  };

  const percent = getPercent();
  const hasMessages = progress?.messages && progress.messages.length > 0;

  const content = (
    <div className="flex w-full max-w-md flex-col items-center justify-center px-4" role="status" aria-live="polite">
      {/* 加载图标 */}
      <div className="relative w-12 h-12 mb-4">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--app-surface-hover)]" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--app-accent)] border-t-transparent" />
      </div>

      {/* 消息 */}
      <p className="text-lg text-[var(--app-text-secondary)] mb-4 text-center">{defaultMessage}</p>

      {/* 进度条 */}
      {progress && (
        <div className="w-full">
          <div className="flex justify-end text-sm text-[var(--app-text-tertiary)] mb-2">
            <span className="font-medium">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-hover)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div
              className="h-full bg-[var(--app-accent)] transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* 滚动消息日志 */}
      {hasMessages && (
        <div className="w-full mt-4">
          <div className="h-32 overflow-y-auto rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-xs">
            {progress.messages!.map((msg, index) => (
              <div
                key={index}
                className={cn(
                  "py-0.5",
                  index === progress.messages!.length - 1
                    ? "font-medium text-[var(--app-accent)]"
                    : "text-[var(--app-text-tertiary)]"
                )}
              >
                <span className="mr-2 text-[var(--app-text-tertiary)]">›</span>
                {msg}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-surface)]">
        {/* Background button - top left corner */}
        {onBackgroundClick && (
          <button
            onClick={onBackgroundClick}
            className="absolute left-4 top-4 flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)]/90 px-4 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
          >
            <ArrowLeft size={16} />
            {defaultBackgroundLabel}
          </button>
        )}
        {content}
      </div>
    );
  }

  return content;
};

// 骨架屏组件
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={cn(
        'animate-pulse bg-[var(--app-surface-hover)]',
        className
      )}
    />
  );
};
