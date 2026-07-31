import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/api/endpoints';
import { devLog } from '@/utils/logger';
import { getT } from '@/utils/i18nHelper';
import { normalizeErrorMessage } from '@/utils';
import type { NarrationQualityReport, NativeExportQualityReport } from '@/types';

const exportI18n = {
  zh: { exportStore: { exportFailed: '导出失败', pollFailed: '轮询失败' } },
  en: { exportStore: { exportFailed: 'Export failed', pollFailed: 'Polling failed' } }
};
const t = getT(exportI18n);

// Note: Backend uses 'RUNNING' but we also accept 'PROCESSING' for compatibility
export type ExportTaskStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
export type ExportTaskType = 'pptx' | 'pdf' | 'editable-pptx' | 'native-pptx' | 'native-pdf' | 'native-html' | 'images' | 'video' | 'podcast' | 'workspace';

export interface ExportTask {
  id: string;
  taskId: string;
  projectId: string;
  type: ExportTaskType;
  status: ExportTaskStatus;
  pageIds?: string[]; // 选中的页面ID列表，undefined表示全部
  progress?: {
    total: number;
    completed: number;
    percent?: number;
    current_step?: string;
    help_text?: string;
    messages?: string[];
    warnings?: string[];  // 导出警告信息
    render_profile?: 'proof' | 'final';
    source_proof_task_id?: string;
    workspace_version_id?: string;
    format?: 'mp3' | 'wav';
    workspace_kind?: 'ppt' | 'video' | 'podcast';
    sidecars?: Record<string, string>;
    warning_details?: {   // 警告详细信息
      style_extraction_failed?: Array<{ element_id: string; reason: string }>;
      text_render_failed?: Array<{ text: string; reason: string }>;
      image_add_failed?: Array<{ path: string; reason: string }>;
      json_parse_failed?: Array<{ context: string; reason: string }>;
      other_warnings?: string[];
      total_warnings?: number;
    };
    quality_report?: NativeExportQualityReport | NarrationQualityReport;
  };
  downloadUrl?: string;
  filename?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

interface ExportTasksState {
  tasks: ExportTask[];
  
  // Actions
  addTask: (task: Omit<ExportTask, 'createdAt'>) => void;
  updateTask: (id: string, updates: Partial<ExportTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: (projectId?: string | null) => void;
  pollTask: (id: string, projectId: string, taskId: string) => Promise<void>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  restoreActiveTasks: () => void; // 恢复正在进行的任务并重新开始轮询
}

const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useExportTasksStore = create<ExportTasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (task) => {
        set((state) => {
          // Check if task with this id already exists
          const existingIndex = state.tasks.findIndex(t => t.id === task.id);
          
          if (existingIndex >= 0) {
            // Update existing task
            const updatedTasks = [...state.tasks];
            updatedTasks[existingIndex] = {
              ...updatedTasks[existingIndex],
              ...task,
              // Update completedAt if status changed to completed/failed
              completedAt: (task.status === 'COMPLETED' || task.status === 'FAILED')
                ? new Date().toISOString()
                : updatedTasks[existingIndex].completedAt,
            };
            return { tasks: updatedTasks };
          } else {
            // Add new task
            const newTask: ExportTask = {
              ...task,
              createdAt: new Date().toISOString(),
            };
            return {
              tasks: [newTask, ...state.tasks].slice(0, 20), // Keep max 20 tasks
            };
          }
        });
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        }));
      },

      removeTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        }));
      },

      clearCompleted: (projectId) => {
        set((state) => ({
          tasks: state.tasks.filter(
            (task) => {
              const isCompleted = task.status === 'COMPLETED' || task.status === 'FAILED';
              if (!isCompleted) return true;
              return projectId != null ? task.projectId !== projectId : false;
            }
          ),
        }));
      },

      pollTask: async (id, projectId, taskId) => {
        const existingTimer = pollTimers.get(id);
        if (existingTimer) clearTimeout(existingTimer);

        const poll = async () => {
          pollTimers.delete(id);
          if (get().tasks.find(task => task.id === id)?.status === 'PAUSED') return;

          try {
            const response = await api.getTaskStatus(projectId, taskId);
            const task = response.data;

            if (!task) {
              console.warn('[ExportTasksStore] No task data in response');
              return;
            }

            const existingProgress = get().tasks.find(task => task.id === id)?.progress;
            const updates: Partial<ExportTask> = {
              status: task.status as ExportTaskStatus,
            };

            if (task.progress) {
              // Parse progress if it's a string (from database JSON field)
              let progressData = task.progress;
              if (typeof progressData === 'string') {
                try {
                  progressData = JSON.parse(progressData);
                } catch (e) {
                  console.warn('[ExportTasksStore] Failed to parse progress:', e);
                }
              }
              const parsedProgress = progressData as Record<string, any>;
              const resumeKwargs = parsedProgress._resume?.kwargs as Record<string, any> | undefined;
              
              updates.progress = {
                ...existingProgress,
                ...parsedProgress,
                total: parsedProgress.total ?? existingProgress?.total ?? 0,
                completed: parsedProgress.completed ?? existingProgress?.completed ?? 0,
                render_profile: parsedProgress.render_profile
                  || resumeKwargs?.render_profile
                  || existingProgress?.render_profile,
                source_proof_task_id: parsedProgress.source_proof_task_id
                  || resumeKwargs?.source_proof_task_id
                  || existingProgress?.source_proof_task_id,
                workspace_version_id: parsedProgress.workspace_version_id
                  || resumeKwargs?.workspace_version_id
                  || existingProgress?.workspace_version_id,
              };
              
              // Extract download URL if available
              const downloadUrl = progressData.download_url || progressData.download_url_absolute;
              if (downloadUrl) {
                updates.downloadUrl = downloadUrl;
              }
              if (progressData.filename) {
                updates.filename = progressData.filename;
              }
            }

            if (task.status === 'COMPLETED') {
              updates.completedAt = new Date().toISOString();
              get().updateTask(id, updates);
            } else if (task.status === 'FAILED') {
              const taskErrorMessage = task.error_message
                || task.error
                || t('exportStore.exportFailed');
              updates.errorMessage = normalizeErrorMessage(taskErrorMessage);
              updates.completedAt = new Date().toISOString();
              get().updateTask(id, updates);
            } else if (task.status === 'PENDING' || task.status === 'RUNNING' || task.status === 'PROCESSING') {
              get().updateTask(id, updates);
              // Continue polling
              pollTimers.set(id, setTimeout(poll, 2000));
            } else if (task.status === 'PAUSED') {
              get().updateTask(id, updates);
            }
          } catch (error: any) {
            console.error('[ExportTasksStore] Poll error:', error);
            if (error?.code === 'ECONNABORTED') {
              pollTimers.set(id, setTimeout(poll, 2000));
              return;
            }
            get().updateTask(id, {
              status: 'FAILED',
              errorMessage: normalizeErrorMessage(error.message || t('exportStore.pollFailed')),
              completedAt: new Date().toISOString(),
            });
          }
        };

        await poll();
      },

      pauseTask: async (id) => {
        const task = get().tasks.find(item => item.id === id);
        if (!task) return;
        await api.pauseTask(task.projectId, task.taskId);
        const timer = pollTimers.get(id);
        if (timer) clearTimeout(timer);
        pollTimers.delete(id);
        get().updateTask(id, { status: 'PAUSED' });
      },

      resumeTask: async (id) => {
        const task = get().tasks.find(item => item.id === id);
        if (!task) return;
        const response = await api.resumeTask(task.projectId, task.taskId);
        const status = (response.data?.status || 'RUNNING') as ExportTaskStatus;
        get().updateTask(id, { status });
        if (task.type.startsWith('native-') && status === 'PENDING') return;
        await get().pollTask(id, task.projectId, task.taskId);
      },

      restoreActiveTasks: () => {
        // 恢复所有正在进行的任务并重新开始轮询
        const state = get();
        const activeTasks = state.tasks.filter(
          task => !task.type.startsWith('native-')
            && (task.status === 'PENDING' || task.status === 'PROCESSING' || task.status === 'RUNNING')
        );
        
        if (activeTasks.length > 0) {
          devLog(`[ExportTasksStore] 恢复 ${activeTasks.length} 个正在进行的任务`);
          activeTasks.forEach(task => {
            // 重新开始轮询
            state.pollTask(task.id, task.projectId, task.taskId).catch(err => {
              console.error(`[ExportTasksStore] 恢复任务 ${task.id} 失败:`, err);
            });
          });
        }
      },
    }),
    {
      name: 'export-tasks-storage',
      partialize: (state) => ({
        // Persist all tasks (including active ones) so they can be restored after page refresh
        tasks: state.tasks.slice(0, 20), // Keep max 20 tasks
      }),
    }
  )
);
