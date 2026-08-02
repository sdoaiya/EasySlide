import { useEffect } from 'react';
import { ClipboardList, RefreshCw, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ExportTasksPanel } from '@/components/shared';
import { useExportTasksStore, type ExportTask } from '@/store/useExportTasksStore';
import { useT } from '@/hooks/useT';
import { Button } from '@/components/shared/Button';

const taskCenterI18n = {
  zh: {
    tasks: {
      title: '任务中心',
      total: '共 {{count}} 条任务',
      refresh: '刷新',
      loadMore: '加载更多',
      noMore: '已加载全部',
      serverDriven: '任务来自服务器，刷新或重启后可恢复',
    },
  },
  en: {
    tasks: {
      title: 'Task Center',
      total: '{{count}} tasks',
      refresh: 'Refresh',
      loadMore: 'Load more',
      noMore: 'All loaded',
      serverDriven: 'Tasks are stored on the server and survive refresh',
    },
  },
};

export function TaskCenter() {
  const t = useT(taskCenterI18n);
  const navigate = useNavigate();
  const { total, hasMore, loading, loadTasks, loadMoreTasks, restoreActiveTasks } = useExportTasksStore();

  useEffect(() => {
    // 跨项目后端任务列表（计划 §5.3：不依赖浏览器历史）
    void loadTasks({}).then(() => restoreActiveTasks());
  }, []);

  useEffect(() => {
    const onFocus = () => { void loadTasks({}).then(() => restoreActiveTasks()); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleOpenResult = (task: ExportTask) => {
    if (task.resultRoute) navigate(task.resultRoute);
  };

  return (
    <main className="min-h-screen bg-[var(--app-background)] px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3 border-b border-[var(--app-border)] pb-4">
          <ClipboardList size={20} aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t('tasks.title')}</h1>
          <span className="text-sm text-[var(--app-text-tertiary)]">{t('tasks.total', { count: total })}</span>
          <button
            onClick={() => void loadTasks({}).then(() => restoreActiveTasks())}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-secondary)]"
            title={t('tasks.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('tasks.refresh')}
          </button>
        </div>
        <ExportTasksPanel className="mt-6" onOpenResult={handleOpenResult} showProjectTitle />
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" icon={<ChevronDown size={14} />} onClick={() => void loadMoreTasks()} disabled={loading}>
              {t('tasks.loadMore')}
            </Button>
          </div>
        )}
        {!hasMore && total > 0 && (
          <p className="mt-4 text-center text-xs text-[var(--app-text-tertiary)]">{t('tasks.noMore')}</p>
        )}
      </div>
    </main>
  );
}
