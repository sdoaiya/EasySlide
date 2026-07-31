import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full';
  showCloseButton?: boolean;
  headerActions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  headerActions,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 250);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isVisible) return null;

  const sizes = {
    sm: 'max-w-[380px]',
    md: 'max-w-[480px]',
    lg: 'max-w-[640px]',
    xl: 'max-w-[800px]',
    wide: 'max-w-[1120px]',
    full: 'max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)]',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      {/* 遮罩 */}
      <div
        className={cn(
          'fixed inset-0 z-0 transition-all duration-300',
          'bg-[color:var(--app-surface)]/80',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 容器 */}
      <div
        className="relative z-10 flex min-h-full items-center justify-center p-4 sm:p-6"
        onClick={handleBackdropClick}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          className={cn(
            'relative w-full flex flex-col',
            size === 'full' ? 'max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]' : 'max-h-[85vh]',
            // 背景和边框
            'bg-[var(--app-surface)]',
            'border border-[var(--app-border)]',
            // 圆角 + 裁剪滚动条
            'overflow-hidden rounded-[var(--app-radius-modal)]',
            // 阴影 - 多层次
            'shadow-[var(--app-shadow-soft)]',
            '',
            // 动画
            'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            isAnimating
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-[0.96] translate-y-3',
            sizes[size]
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          {title && (
            <div className="relative flex-shrink-0 px-7 pt-7 pb-5">
              <h2
                id="modal-title"
                className={cn(
                  'text-xl font-semibold text-[var(--app-text)]',
                  showCloseButton || headerActions ? 'pr-24' : ''
                )}
              >
                {title}
              </h2>
            </div>
          )}

          {headerActions && (
            <div
              className={cn(
                'absolute z-20 flex items-center gap-2',
                title ? 'top-5 right-16' : 'top-4 right-14'
              )}
            >
              {headerActions}
            </div>
          )}

          {/* 关闭按钮 */}
          {showCloseButton && (
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              className={cn(
                'absolute z-20 group',
                'w-10 h-10 flex items-center justify-center',
                'rounded-[var(--app-radius-control)]',
                'text-[var(--app-text-tertiary)]',
                'hover:text-[var(--app-text)]',
                'hover:bg-[var(--app-surface-hover)]',
                'active:scale-95',
                'transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]',
                title ? 'top-5 right-5' : 'top-4 right-4'
              )}
              aria-label="关闭"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}

          {/* 内容区域 */}
          <div
            className={cn(
              'relative px-7 pb-7 overflow-y-auto flex-1',
              size === 'full' ? 'max-h-[calc(100vh-8rem)]' : 'max-h-[85vh]',
              'scrollbar-thin scrollbar-thumb-[var(--app-border-strong)]',
              title ? '' : 'pt-7'
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
