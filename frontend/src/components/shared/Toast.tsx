import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose,
  duration = type === 'error' ? 0 : type === 'success' ? 2000 : type === 'warning' ? 5000 : 3000,
}) => {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onCloseRef.current(), duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    info: <Info size={20} />,
    warning: <AlertTriangle size={20} />,
  };

  const styles = {
    success: 'border-[color:var(--app-success)]/25 bg-[var(--app-surface)] text-[var(--app-text)]',
    error: 'border-[color:var(--app-error)]/30 bg-[var(--app-surface)] text-[var(--app-text)]',
    info: 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]',
    warning: 'border-[color:var(--app-warning)]/30 bg-[var(--app-surface)] text-[var(--app-text)]',
  };

  return (
    <div
      className={cn(
        'flex max-w-[420px] items-center gap-3 rounded-[var(--app-radius-card)] border px-4 py-3 shadow-[var(--app-shadow-soft)]',
        'transition-[opacity,transform] duration-200',
        styles[type]
      )}
    >
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button
        type="button"
        aria-label="关闭通知"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
      >
        <X size={18} />
      </button>
    </div>
  );
};

// Toast 管理器
export const useToast = () => {
  const [toasts, setToasts] = React.useState<Array<{ id: string; props: Omit<ToastProps, 'onClose'> }>>([]);

  const show = (props: Omit<ToastProps, 'onClose'>) => {
    const id = Math.random().toString(36);
    setToasts((prev) => {
      const newToasts = [...prev, { id, props }];
      // 最多保留5个toast，超过则移除最早的
      return newToasts.length > 5 ? newToasts.slice(-5) : newToasts;
    });
  };

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ToastContainer = React.useCallback(() => (
    <div className="fixed top-20 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            {...toast.props}
            onClose={() => remove(toast.id)}
          />
        </div>
      ))}
    </div>
  ), [remove, toasts]);

  return {
    show,
    ToastContainer,
  };
};
