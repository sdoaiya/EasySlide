import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Trash2, FileText, Clock, CheckCircle, XCircle, Loader2, AlertTriangle, HelpCircle, Settings, RefreshCw, Pause, Play, Square, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExportTasksStore, type ExportTask, type ExportTaskType } from '@/store/useExportTasksStore';
import { useT } from '@/hooks/useT';
import type { Page } from '@/types';
import { Button } from './Button';
import { cn } from '@/utils';
import { ExportQualityReport } from '@/components/export/ExportQualityReport';

// Export 组件自包含翻译
const exportI18n = {
  zh: {
    export: {
      tasks: "导出任务", inProgress: "{{count}} 进行中", clearHistory: "清除",
      exportPptx: "PPTX", exportPdf: "PDF", exportEditablePptx: "可编辑 PPTX", exportNativePptx: "原生可编辑 PPTX", exportNativePdf: "原生 PDF", exportNativeHtml: "离线 HTML", exportImages: "图片", exportVideo: "讲解视频", exportPodcast: "播客音频",
      generateVideo: "生成视频候选", generatePodcast: "生成节目候选", initializeWorkspace: "初始化工作区",
      allPages: "全部", pageRange: "第{{start}}-{{end}}页", singlePage: "第{{num}}页", pagesCount: "{{count}}页",
      warnings: "{{count}} 条警告", clickToView: "点击查看", warningsTitle: "导出警告",
      warningsCount: "导出警告 ({{count}} 条)", detailInfo: "详细信息",
      styleExtractionFailed: "样式提取失败 ({{count}} 个)", textRenderFailed: "文本渲染失败 ({{count}} 个)",
      moreItems: "... 还有 {{count}} 条", exportFailed: "导出失败", preparing: "准备中...",
      retry: "重试",
      pause: "暂停任务", resume: "继续任务", paused: "已暂停", cancel: "取消任务", openResult: "查看结果",
      qualityReport: "查看质量报告",
      settingsTip: "可在「项目设置 → 导出设置」中调整配置或开启「返回半成品」选项",
      codexReconnectTip: "如果是 Codex 授权过期或连接中断，也可以前往设置重新连接 OpenAI 授权后再试",
    },
    shared: { historyRecords: "历史记录" }
  },
  en: {
    export: {
      tasks: "Export Tasks", inProgress: "{{count}} in progress", clearHistory: "Clear",
      exportPptx: "PPTX", exportPdf: "PDF", exportEditablePptx: "Editable PPTX", exportNativePptx: "Native editable PPTX", exportNativePdf: "Native PDF", exportNativeHtml: "Offline HTML", exportImages: "Images", exportVideo: "Narration Video", exportPodcast: "Podcast audio",
      generateVideo: "Generate video candidate", generatePodcast: "Generate podcast candidate", initializeWorkspace: "Initialize workspace",
      allPages: "All", pageRange: "Pages {{start}}-{{end}}", singlePage: "Page {{num}}", pagesCount: "{{count}} pages",
      warnings: "{{count}} warnings", clickToView: "Click to view", warningsTitle: "Export Warnings",
      warningsCount: "Export Warnings ({{count}})", detailInfo: "Details",
      styleExtractionFailed: "Style extraction failed ({{count}})", textRenderFailed: "Text render failed ({{count}})",
      moreItems: "... {{count}} more", exportFailed: "Export Failed", preparing: "Preparing...",
      retry: "Retry",
      pause: "Pause task", resume: "Resume task", paused: "Paused", cancel: "Cancel task", openResult: "Open result",
      qualityReport: "View quality report",
      settingsTip: "Adjust settings in \"Project Settings → Export Settings\" or enable \"Allow Partial Results\"",
      codexReconnectTip: "If Codex authorization expired or the connection was interrupted, reconnect OpenAI authorization in Settings and try again.",
    },
    shared: { historyRecords: "History Records" }
  }
};

const getPageRangeText = (pageIds: string[] | undefined, pages: Page[], t: (key: string, options?: any) => string): string => {
  if (!pageIds || pageIds.length === 0) {
    return t('export.allPages');
  }
  
  const indices: number[] = [];
  pageIds.forEach(pageId => {
    const index = pages.findIndex(p => (p.id || p.page_id) === pageId);
    if (index >= 0) {
      indices.push(index);
    }
  });
  
  if (indices.length === 0) {
    return t('export.pagesCount', { count: pageIds.length });
  }
  
  indices.sort((a, b) => a - b);
  const minIndex = indices[0];
  const maxIndex = indices[indices.length - 1];
  
  if (indices.length === maxIndex - minIndex + 1) {
    if (minIndex === maxIndex) {
      return t('export.singlePage', { num: minIndex + 1 });
    }
    return t('export.pageRange', { start: minIndex + 1, end: maxIndex + 1 });
  } else {
    return t('export.pagesCount', { count: pageIds.length });
  }
};

const TaskStatusIcon: React.FC<{ status: ExportTask['status'] }> = ({ status }) => {
  switch (status) {
    case 'PENDING':
      return <Clock size={16} className="text-[var(--app-text-tertiary)]" />;
    case 'PROCESSING':
    case 'RUNNING':
      return <Loader2 size={16} className="animate-spin text-[var(--app-accent)]" />;
    case 'PAUSED':
      return <Pause size={16} className="text-[var(--app-warning)]" />;
    case 'COMPLETED':
      return <CheckCircle size={16} className="text-[var(--app-success)]" />;
    case 'FAILED':
      return <XCircle size={16} className="text-[var(--app-error)]" />;
    case 'CANCELLED':
      return <Square size={16} className="text-[var(--app-text-tertiary)]" />;
    default:
      return null;
  }
};

const WarningsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  warnings: string[];
  warningDetails?: any;
}> = ({ isOpen, onClose, warnings, warningDetails }) => {
  const t = useT(exportI18n);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeLabel = `${t('common.close')} ${t('export.warningsTitle')}`;

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[color:var(--app-surface)]/80" onClick={onClose} />
      
      <div role="dialog" aria-modal="true" aria-labelledby="export-warning-title" className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-soft)] mx-4">
        <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-accent-soft)] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-[var(--app-warning)]" />
            <h3 id="export-warning-title" className="text-base font-semibold text-[var(--app-text)]">
              {t('export.warningsCount', { count: warnings.length })}
            </h3>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--app-radius-control)] transition-colors hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={18} className="text-[var(--app-text-tertiary)]" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {warnings.map((warning, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded border border-[var(--app-accent-soft)] bg-[var(--app-accent-soft)] p-2 text-sm text-[var(--app-text)]"
              >
                <span className="mt-0.5 text-[var(--app-warning)]">•</span>
                <span className="break-words">{warning}</span>
              </div>
            ))}
          </div>
          
          {warningDetails && (
            <div className="mt-4 border-t border-[var(--app-border)] pt-4">
              <h4 className="mb-2 text-sm font-medium text-[var(--app-text-secondary)]">{t('export.detailInfo')}</h4>
              
              {warningDetails.style_extraction_failed?.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-[var(--app-text-tertiary)]">
                    {t('export.styleExtractionFailed', { count: warningDetails.style_extraction_failed.length })}
                  </p>
                  <div className="max-h-32 overflow-y-auto rounded bg-[var(--app-surface-muted)] p-2 text-xs text-[var(--app-text-secondary)]">
                    {warningDetails.style_extraction_failed.slice(0, 10).map((item: any, idx: number) => (
                      <div key={idx} className="truncate" title={item.reason}>
                        • {item.element_id}: {item.reason}
                      </div>
                    ))}
                    {warningDetails.style_extraction_failed.length > 10 && (
                      <div className="mt-1 text-[var(--app-text-tertiary)]">
                        {t('export.moreItems', { count: warningDetails.style_extraction_failed.length - 10 })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {warningDetails.text_render_failed?.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-[var(--app-text-tertiary)]">
                    {t('export.textRenderFailed', { count: warningDetails.text_render_failed.length })}
                  </p>
                  <div className="max-h-32 overflow-y-auto rounded bg-[var(--app-surface-muted)] p-2 text-xs text-[var(--app-text-secondary)]">
                    {warningDetails.text_render_failed.slice(0, 10).map((item: any, idx: number) => (
                      <div key={idx} className="truncate" title={item.reason}>
                        • "{item.text}": {item.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-3">
          <button
            onClick={onClose}
            className="min-h-10 w-full rounded-md bg-[var(--app-surface-hover)] px-4 py-2 text-sm font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const OpenResultButton: React.FC<{ task: ExportTask; onOpen?: (task: ExportTask) => void }> = ({ task, onOpen }) => {
  const t = useT(exportI18n);
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<ExternalLink size={14} />}
      onClick={() => { if (onOpen) onOpen(task); else if (task.resultRoute) navigate(task.resultRoute); }}
      className="text-xs px-2 py-1"
    >
      {t('export.openResult')}
    </Button>
  );
};

const TaskItem: React.FC<{
  task: ExportTask;
  pages: Page[];
  onRemove: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel?: () => void;
  onRetry?: (task: ExportTask) => void;
  onOpenResult?: (task: ExportTask) => void;
  showProjectTitle?: boolean;
}> = ({ task, pages, onRemove, onPause, onResume, onCancel, onRetry, onOpenResult, showProjectTitle }) => {
  const t = useT(exportI18n);
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [showQualityReport, setShowQualityReport] = useState(false);
  
  const taskTypeLabels: Record<ExportTaskType, string> = {
    'pptx': t('export.exportPptx'),
    'pdf': t('export.exportPdf'),
    'editable-pptx': t('export.exportEditablePptx'),
    'native-pptx': t('export.exportNativePptx'),
    'native-pdf': t('export.exportNativePdf'),
    'native-html': t('export.exportNativeHtml'),
    'images': t('export.exportImages'),
    'video': t('export.exportVideo'),
    'podcast': t('export.exportPodcast'),
    'generate-video': t('export.generateVideo'),
    'generate-podcast': t('export.generatePodcast'),
    'initialize-workspace': t('export.initializeWorkspace'),
    'workspace': '准备工作区',
  };
  
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const pageRangeText = getPageRangeText(task.pageIds, pages, t);
  const handleDownload = async (url = task.downloadUrl, filename = task.filename) => {
    if (!url) return;
    if (window.electronAPI?.saveDownload) {
      await window.electronAPI.saveDownload(url, filename);
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getProgressPercent = () => {
    if (!task.progress) return 0;
    if (task.progress.percent !== undefined) return task.progress.percent;
    if (task.progress.total > 0) {
      return Math.round((task.progress.completed / task.progress.total) * 100);
    }
    return 0;
  };

  const progressPercent = getProgressPercent();
  const isProcessing = task.status === 'PROCESSING' || task.status === 'RUNNING' || task.status === 'PENDING';
  const showsProgress = isProcessing || task.status === 'PAUSED';
  
  const hasWarnings = task.status === 'COMPLETED' && task.progress?.warnings && task.progress.warnings.length > 0;

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--app-surface-hover)]">
      <div className="mt-0.5">
        <TaskStatusIcon status={task.status} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="truncate text-sm font-medium text-[var(--app-text-secondary)]">
            {taskTypeLabels[task.type]}
          </span>
          {showProjectTitle && task.projectTitle && (
            <span className="max-w-[120px] truncate text-xs text-[var(--app-text-tertiary)]">
              {task.projectTitle}
            </span>
          )}
          <span className="text-xs text-[var(--app-text-tertiary)]">
            {pageRangeText}
          </span>
          <span className="text-xs text-[var(--app-text-tertiary)]">
            {formatTime(task.createdAt)}
          </span>
        </div>
        
        {showsProgress && (
          <div className="mt-2 space-y-1.5">
            {task.progress ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--app-accent)]">
                    {task.status === 'PAUSED' ? t('export.paused') : (progressPercent > 0 ? `${progressPercent}%` : t('export.preparing'))}
                  </span>
                  {task.progress.current_step && (
                    <span className="max-w-[140px] truncate text-xs text-[var(--app-text-tertiary)]" title={task.progress.current_step}>
                      {task.progress.current_step}
                    </span>
                  )}
                </div>
                
                <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-hover)]">
                  <div
                    className="h-full bg-[var(--app-accent)] transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                
                {task.progress.messages && task.progress.messages.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {task.progress.messages.slice(-2).map((msg, idx) => (
                      <div key={idx} className="truncate text-xs text-[var(--app-text-tertiary)]" title={msg}>
                        {msg}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--app-surface-hover)]">
                  <div className="h-full animate-pulse bg-[var(--app-accent)]" style={{ width: '30%' }} />
                </div>
                <span className="whitespace-nowrap text-xs text-[var(--app-text-tertiary)]">{t('common.pending')}</span>
              </div>
            )}
          </div>
        )}
        
        {task.status === 'FAILED' && task.errorMessage && (
          <div className="mt-2 space-y-2">
            <div className="rounded border border-[var(--app-error-soft)] bg-[var(--app-error-soft)] p-2">
              <div className="flex items-start gap-2">
                <XCircle size={14} className="mt-0.5 flex-shrink-0 text-[var(--app-error)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--app-error)]">{t('export.exportFailed')}</p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-xs text-[var(--app-error)]">
                    {task.errorMessage}
                  </p>
                </div>
              </div>
            </div>

            {task.progress?.help_text && (
              <div className="rounded-[var(--app-radius-control)] border border-[var(--app-accent-soft)] bg-[var(--app-accent-soft)] p-2">
                <div className="flex items-start gap-2">
                  <HelpCircle size={14} className="mt-0.5 flex-shrink-0 text-[var(--app-accent)]" />
                  <p className="text-xs text-[var(--app-accent)]">
                    {task.progress.help_text}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-tertiary)]">
              <Settings size={12} />
              <span>{t('export.settingsTip')}</span>
            </div>

            {task.errorMessage.toLowerCase().includes('codex') && (
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-tertiary)]">
                <Settings size={12} />
                <span>{t('export.codexReconnectTip')}</span>
              </div>
            )}
          </div>
        )}
        
        {hasWarnings && (
          <>
            <button
              onClick={() => setShowWarningsModal(true)}
              className="mt-1.5 w-full rounded border border-[var(--app-accent-soft)] bg-[var(--app-accent-soft)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={12} className="flex-shrink-0 text-[var(--app-warning)]" />
                <span className="text-xs font-medium text-[var(--app-text)]">
                  {t('export.warnings', { count: task.progress?.warnings?.length ?? 0 })}
                </span>
                <span className="ml-auto text-[11px] text-[var(--app-warning)]">
                  {t('export.clickToView')}
                </span>
              </div>
            </button>
            
            <WarningsModal
              isOpen={showWarningsModal}
              onClose={() => setShowWarningsModal(false)}
              warnings={task.progress?.warnings ?? []}
              warningDetails={task.progress?.warning_details}
            />
          </>
        )}
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0">
        {isProcessing && onPause && task.capabilities?.pause !== false && (
          <button
            onClick={onPause}
            className="p-1 text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-accent)]"
            title={t('export.pause')}
            aria-label={t('export.pause')}
          >
            <Pause size={16} />
          </button>
        )}

        {isProcessing && onCancel && task.capabilities?.cancel !== false && (
          <button
            onClick={onCancel}
            className="p-1 text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-error)]"
            title={t('export.cancel')}
            aria-label={t('export.cancel')}
          >
            <Square size={16} />
          </button>
        )}

        {task.status === 'PAUSED' && (
          <button
            onClick={onResume}
            className="p-1 text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-accent)]"
            title={t('export.resume')}
            aria-label={t('export.resume')}
          >
            <Play size={16} />
          </button>
        )}

        {task.status === 'FAILED' && onRetry && task.capabilities?.retry !== false && (
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => onRetry(task)}
            className="text-xs px-2 py-1"
          >
            {t('export.retry')}
          </Button>
        )}

        {task.resultRoute && (
          <OpenResultButton task={task} onOpen={onOpenResult} />
        )}

        {task.status === 'COMPLETED' && task.downloadUrl && (
          <Button
            variant="primary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => void handleDownload()}
            className="text-xs px-2 py-1"
          >
            {t('common.download')}
          </Button>
        )}

        {task.status === 'COMPLETED' && task.progress?.sidecars && Object.entries(task.progress.sidecars).map(([kind, url]) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => void handleDownload(url, `${task.filename?.replace(/\.(mp3|wav)$/i, '') || 'podcast'}.${kind}.json`)}
            className="text-xs px-2 py-1"
          >
            {kind === 'transcript' ? '逐字稿' : kind === 'cover_manifest' ? '封面清单' : kind}
          </Button>
        ))}

        {task.status === 'COMPLETED' && task.progress?.quality_report && (
          <button
            type="button"
            onClick={() => setShowQualityReport(true)}
            className="rounded-md px-2 py-1 text-xs text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]"
            aria-label={t('export.qualityReport')}
          >
            {t('export.qualityReport')}
          </button>
        )}
        
        <button
          onClick={onRemove}
          className="p-1 text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-text-secondary)]"
          title={t('common.delete')}
        >
          <X size={14} />
        </button>
      </div>
      {showQualityReport && task.progress?.quality_report && (
        <ExportQualityReport report={task.progress.quality_report} onClose={() => setShowQualityReport(false)} />
      )}
    </div>
  );
};

interface ExportTasksPanelProps {
  projectId?: string;
  pages?: Page[];
  className?: string;
  onRetry?: (task: ExportTask) => void;
  onOpenResult?: (task: ExportTask) => void;
  showProjectTitle?: boolean;
}

export const ExportTasksPanel: React.FC<ExportTasksPanelProps> = ({ projectId, pages = [], className, onRetry, onOpenResult, showProjectTitle }) => {
  const t = useT(exportI18n);
  const [isExpanded, setIsExpanded] = useState(true);
  const { tasks, removeTask, clearCompleted, restoreActiveTasks, loadTasks, pauseTask, resumeTask, cancelTask, retryTask } = useExportTasksStore();

  const filteredTasks = projectId
    ? tasks.filter(task => task.projectId === projectId)
    : tasks;

  const activeTasks = filteredTasks.filter(
    task => task.status === 'PENDING' || task.status === 'PROCESSING' || task.status === 'RUNNING' || task.status === 'PAUSED'
  );
  const completedTasks = filteredTasks.filter(
    task => task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED'
  );

  useEffect(() => {
    // 后端回填后恢复进行中任务的轮询（localStorage 不再是事实源）
    void Promise.resolve(loadTasks(projectId ? { projectId } : {})).then(() => restoreActiveTasks());
  }, [projectId]);

  useEffect(() => {
    // 窗口重新获得焦点时刷新一次
    const onFocus = () => {
      void Promise.resolve(loadTasks(projectId ? { projectId } : {})).then(() => restoreActiveTasks());
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [projectId]);

  const handleRetry = (task: ExportTask) => {
    if (onRetry) { onRetry(task); return; }
    void retryTask(task.id).catch(console.error);
  };

  if (filteredTasks.length === 0) {
    return null;
  }
  
  return (
    <div className={cn(
      "overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-soft)]",
      className
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center bg-[var(--app-surface-muted)] px-4 py-3 transition-colors hover:bg-[var(--app-surface-hover)]"
      >
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-[var(--app-text-secondary)]" />
          <span className="text-sm font-medium text-[var(--app-text-secondary)]">
            {t('export.tasks')}
          </span>
          {activeTasks.length > 0 && (
            <span className="rounded-[var(--app-radius-control)] bg-[color:var(--app-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--app-accent)]">
              {t('export.inProgress', { count: activeTasks.length })}
            </span>
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {activeTasks.length > 0 && (
            <div className="border-b border-[var(--app-border-soft)] p-2">
              {activeTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task}
                  pages={pages}
                  onRemove={() => void removeTask(task.id).catch(console.error)}
                  onPause={() => void pauseTask(task.id).catch(console.error)}
                  onResume={() => void resumeTask(task.id).catch(console.error)}
                  onCancel={() => void cancelTask(task.id).catch(console.error)}
                  onRetry={handleRetry}
                  onOpenResult={onOpenResult}
                  showProjectTitle={showProjectTitle}
                />
              ))}
            </div>
          )}
          
          {completedTasks.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-1 mb-1">
                <span className="text-xs text-[var(--app-text-tertiary)]">{t('shared.historyRecords')}</span>
                <button
                  onClick={() => clearCompleted(projectId)}
                  className="flex items-center gap-1 text-xs text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]"
                >
                  <Trash2 size={12} />
                  {t('export.clearHistory')}
                </button>
              </div>
              {completedTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  pages={pages}
                  onRemove={() => void removeTask(task.id).catch(console.error)}
                  onPause={() => void pauseTask(task.id).catch(console.error)}
                  onResume={() => void resumeTask(task.id).catch(console.error)}
                  onCancel={() => void cancelTask(task.id).catch(console.error)}
                  onRetry={handleRetry}
                  onOpenResult={onOpenResult}
                  showProjectTitle={showProjectTitle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
