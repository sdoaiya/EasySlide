import React, { useState, memo } from 'react';
import { Sparkles, History, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useT } from '@/hooks/useT';

// AiRefineInput 组件自包含翻译
const aiRefineI18n = {
  zh: {
    aiRefine: {
      ctrlEnterSubmit: "（Ctrl+Enter 提交）", history: "历史",
      viewHistory: "查看 {{count}} 条历史修改", previousRequirements: "之前的修改要求：",
      submitTooltip: "提交 (Ctrl+Enter)"
    }
  },
  en: {
    aiRefine: {
      ctrlEnterSubmit: "(Ctrl+Enter to submit)", history: "History",
      viewHistory: "View {{count}} previous edits", previousRequirements: "Previous edit requests:",
      submitTooltip: "Submit (Ctrl+Enter)"
    }
  }
};

export interface AiRefineInputProps {
  /** 标题文字 */
  title: string;
  /** 输入框占位文字 */
  placeholder: string;
  /** 提交回调函数，接收当前要求和历史要求，返回 Promise */
  onSubmit: (requirement: string, previousRequirements: string[]) => Promise<void>;
  /** 是否禁用（例如没有内容可修改时） */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 状态变化回调，通知父组件当前是否正在提交 */
  onStatusChange?: (isSubmitting: boolean) => void;
}

const AiRefineInputComponent: React.FC<AiRefineInputProps> = ({
  title,
  placeholder,
  onSubmit,
  disabled = false,
  className = '',
  onStatusChange,
}) => {
  const t = useT(aiRefineI18n);
  const [requirement, setRequirement] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleSubmit = async () => {
    if (!requirement.trim() || isSubmitting || disabled) return;

    const currentRequirement = requirement.trim();
    setIsSubmitting(true);
    onStatusChange?.(true); // 通知父组件开始提交
    try {
      await onSubmit(currentRequirement, history);
      // 成功后将当前要求添加到历史
      setHistory(prev => [...prev, currentRequirement]);
      // 清空输入框
      setRequirement('');
    } finally {
      setIsSubmitting(false);
      onStatusChange?.(false); // 通知父组件提交结束
    }
  };

  // 处理 Ctrl+Enter 快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (disabled) {
    return null;
  }

  // 判断是否为紧凑模式（没有标题时）
  const isCompactMode = !title;

  return (
    <div className={isCompactMode ? `group ${className}` : `group rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-[var(--app-shadow-soft)] md:p-4 ${className}`}>
      {/* 标题和历史按钮 - 仅非紧凑模式显示 */}
      {!isCompactMode && (
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--app-accent)] md:w-[18px] md:h-[18px]" />
            <h3 className="text-xs font-semibold text-[var(--app-text)] md:text-sm">{title}</h3>
            <span className="hidden text-xs text-[var(--app-text-tertiary)] sm:inline">{t('aiRefine.ctrlEnterSubmit')}</span>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-xs text-[var(--app-accent)] transition-colors hover:text-[var(--app-accent-strong)]"
            >
              <History size={14} />
              <span className="hidden sm:inline">{t('aiRefine.history')} ({history.length})</span>
              <span className="sm:hidden">{history.length}</span>
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      )}
      
      {/* 历史记录展示 */}
      {showHistory && history.length > 0 && (
        <div className={`${isCompactMode ? 'mb-2' : 'mb-3'} max-h-32 overflow-y-auto rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-[var(--app-shadow-soft)]`}>
          <div className="mb-1 text-xs text-[var(--app-text-tertiary)]">{t('aiRefine.previousRequirements')}</div>
          <ul className="space-y-1">
            {history.map((req, idx) => (
              <li key={idx} className="flex items-start gap-1 text-xs text-[var(--app-text-secondary)]">
                <span className="flex-shrink-0 text-[var(--app-accent)]">{idx + 1}.</span>
                <span className="break-all">{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="flex gap-2 items-center relative">
        {/* 紧凑模式下显示图标和历史按钮 */}
        {isCompactMode && (
          <>
            <Sparkles size={16} className={`flex-shrink-0 transition-colors ${isSubmitting ? 'text-[var(--app-accent-strong)]' : 'text-[var(--app-accent)]'}`} />
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex flex-shrink-0 items-center gap-1 text-xs text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-accent)]"
                title={t('aiRefine.viewHistory', { count: history.length })}
              >
                <History size={14} />
                <span className="hidden sm:inline">{history.length}</span>
              </button>
            )}
          </>
        )}
        
        <div className="flex-1 relative">
          <input
            type="text"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)] ${
              isSubmitting ? 'bg-[var(--app-surface-hover)]' : 'bg-[var(--app-surface)]'
            }`}
            disabled={isSubmitting}
          />
          {isSubmitting && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--app-radius-control)]">
              <div className="absolute inset-x-3 bottom-0 h-px animate-pulse bg-[var(--app-accent)]" />
            </div>
          )}
        </div>
        
        {/* 提交按钮 - 移动端始终显示，桌面端鼠标悬停时显示 */}
        <button
          onClick={handleSubmit}
          disabled={!requirement.trim() || isSubmitting}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--app-radius-control)] transition-all ${
            !requirement.trim() || isSubmitting
              ? 'cursor-not-allowed bg-[var(--app-surface-hover)] text-[var(--app-text-tertiary)]'
              : 'bg-[var(--app-primary-action)] text-[var(--app-surface)] hover:bg-[var(--app-primary-action-hover)] active:scale-95'
          } md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100`}
          title={t('aiRefine.submitTooltip')}
        >
          <Send size={16} className={isSubmitting ? 'animate-pulse' : ''} />
        </button>
      </div>
    </div>
  );
};

// 使用 memo 包装组件，避免父组件频繁重渲染时影响输入框
// 只有当 props 真正变化时才重新渲染
export const AiRefineInput = memo(AiRefineInputComponent);

