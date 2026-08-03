import { create } from 'zustand';
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
export type ExportTaskStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ExportTaskType = 'pptx' | 'pdf' | 'editable-pptx' | 'native-pptx' | 'native-pdf' | 'native-html' | 'images' | 'video' | 'podcast' | 'workspace' | 'generate-video' | 'generate-podcast' | 'initialize-workspace' | 'generate-pages' | 'generate-images' | 'generate-descriptions' | 'narration-batch';

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
  errorCode?: string;
  /** 任务结果路由（审查页 / 工作区 / 下载链接），来自服务端投影 */
  resultRoute?: string;
  /** 服务端计算的控制能力，前端不再硬编码 */
  capabilities?: { pause: boolean; resume: boolean; cancel: boolean; retry: boolean };
  category?: string;
  workspaceKind?: string;
  operation?: string;
  projectTitle?: string;
  createdAt: string;
  completedAt?: string;
}

interface ExportTasksState {
  tasks: ExportTask[];
  /** 服务端任务总数（分页保留历史，不再截断为本地 20 条） */
  total: number;
  hasMore: boolean;
  loading: boolean;

  // Actions
  addTask: (task: Omit<ExportTask, 'createdAt'>) => void;
  updateTask: (id: string, updates: Partial<ExportTask>) => void;
  removeTask: (id: string) => Promise<void>;
  clearCompleted: (projectId?: string | null) => void;
  pollTask: (id: string, projectId: string, taskId: string) => Promise<void>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  /** 从后端回填任务列表（唯一事实源），返回后端总数 */
  loadTasks: (filters?: api.ServerTaskListParams) => Promise<number>;
  /** 分页加载更多历史任务 */
  loadMoreTasks: () => Promise<void>;
  /** 恢复进行中的任务并重新开始轮询 */
  restoreActiveTasks: () => void;
}

const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

// 后端 task_type / workspace_kind → 前端展示类型
export function mapTaskType(taskType?: string, workspaceKind?: string): ExportTaskType {
  if (!taskType) return 'workspace';
  if (taskType === 'GENERATE_WORKSPACE_CANDIDATE') {
    return workspaceKind === 'podcast' ? 'generate-podcast' : workspaceKind === 'video' ? 'generate-video' : 'workspace';
  }
  if (taskType === 'EXPORT_VIDEO_WORKSPACE') return 'video';
  if (taskType === 'EXPORT_PODCAST_WORKSPACE') return 'podcast';
  if (taskType === 'INITIALIZE_CONTENT_WORKSPACE') return 'initialize-workspace';
  if (taskType === 'GENERATE_NATIVE_DECK') return 'generate-pages';
  if (taskType === 'GENERATE_IMAGES') return 'generate-images';
  if (taskType === 'GENERATE_DESCRIPTIONS') return 'generate-descriptions';
  if (taskType === 'NARRATION_AI_BATCH') return 'narration-batch';
  return 'workspace';
}

/** 后端投影 → 前端任务视图模型 */
function projectionToTask(item: any, existing?: ExportTask): ExportTask {
  const progress = existing?.progress;
  const type = item.task_type ? mapTaskType(item.task_type, item.workspace_kind) : (existing?.type ?? 'workspace');
  const base: ExportTask = {
    id: item.task_id ?? existing?.id ?? '',
    taskId: item.task_id ?? existing?.taskId ?? '',
    projectId: item.project_id ?? existing?.projectId ?? '',
    type,
    status: item.status as ExportTaskStatus,
    progress: {
      ...progress,
      total: item.progress?.total ?? progress?.total ?? 0,
      completed: item.progress?.completed ?? progress?.completed ?? 0,
      percent: item.progress?.percent ?? progress?.percent,
      current_step: item.progress?.current_step ?? progress?.current_step,
      workspace_kind: item.workspace_kind,
    },
    downloadUrl: item.result?.download_url
      ?? item.progress?.download_url
      ?? item.progress?.download_url_absolute
      ?? existing?.downloadUrl,
    filename: item.result?.filename ?? item.progress?.filename ?? existing?.filename,
    errorMessage: item.error_message ?? existing?.errorMessage,
    errorCode: item.error_code ?? existing?.errorCode,
    resultRoute: item.result?.route,
    capabilities: item.capabilities,
    category: item.category,
    workspaceKind: item.workspace_kind,
    operation: item.operation,
    projectTitle: item.project_title,
    createdAt: item.created_at ?? existing?.createdAt ?? new Date().toISOString(),
    completedAt: item.completed_at ?? existing?.completedAt,
  };
  if (item.status === 'COMPLETED' && !base.completedAt) base.completedAt = new Date().toISOString();
  if (item.status === 'FAILED' && item.error_message) {
    base.errorMessage = normalizeErrorMessage(item.error_message);
  }
  return base;
}

export const useExportTasksStore = create<ExportTasksState>()((set, get) => ({
  tasks: [],
  total: 0,
  hasMore: false,
  loading: false,

  addTask: (task) => {
    set((state) => {
      const existingIndex = state.tasks.findIndex((item) => item.id === task.id);
      if (existingIndex >= 0) {
        const updatedTasks = [...state.tasks];
        updatedTasks[existingIndex] = {
          ...updatedTasks[existingIndex],
          ...task,
          completedAt: (task.status === 'COMPLETED' || task.status === 'FAILED')
            ? new Date().toISOString()
            : updatedTasks[existingIndex].completedAt,
        };
        return { tasks: updatedTasks };
      }
      const newTask: ExportTask = { ...task, createdAt: new Date().toISOString() };
      return { tasks: [newTask, ...state.tasks] };
    });
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    }));
  },

  removeTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;
    if (task.taskId) {
      try {
        await api.deleteTask(task.projectId, task.taskId);
      } catch (error) {
        // 删除失败：任务保留、轮询继续，但把错误 surface 出来（抛错 + 任务上的错误标志）
        console.error('[ExportTasksStore] 删除任务失败:', error);
        get().updateTask(id, {
          errorMessage: normalizeErrorMessage(error instanceof Error ? error.message : String(error)),
        });
        throw error;
      }
    }
    const timer = pollTimers.get(id);
    if (timer) clearTimeout(timer);
    pollTimers.delete(id);
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      total: Math.max(0, state.total - (task.taskId ? 1 : 0)),
    }));
  },

  clearCompleted: (projectId) => {
    set((state) => {
      let removed = 0;
      const tasks = state.tasks.filter((task) => {
        const isCompleted = task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED';
        if (!isCompleted) return true;
        if (projectId != null && task.projectId !== projectId) return true;
        removed += 1;
        return false;
      });
      // 按移除数量同步减少 total
      return { tasks, total: Math.max(0, state.total - removed) };
    });
  },

  pollTask: async (id, projectId, taskId) => {
    const existingTimer = pollTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const poll = async () => {
      pollTimers.delete(id);
      const current = get().tasks.find((task) => task.id === id);
      if (!current) return;
      if (current.status === 'PAUSED' || current.status === 'COMPLETED' || current.status === 'FAILED' || current.status === 'CANCELLED') return;
      if (!taskId) return; // 本地任务无后端 task，不轮询

      try {
        const response = await api.getTaskStatus(projectId, taskId);
        const item = response.data as any;
        if (!item) {
          console.warn('[ExportTasksStore] No task data in response');
          return;
        }
        // 竞态守卫：在途响应晚到时，本地已暂停/取消的任务不能被中间状态覆写，也不重新挂定时器
        const local = get().tasks.find((task) => task.id === id);
        if (
          local
          && (local.status === 'PAUSED' || local.status === 'CANCELLED')
          && item.status !== 'COMPLETED'
          && item.status !== 'FAILED'
          && item.status !== 'CANCELLED'
        ) {
          return;
        }
        const updates = projectionToTask(item, get().tasks.find((task) => task.id === id));
        updates.id = id;
        get().updateTask(id, updates);

        if (item.status === 'COMPLETED' || item.status === 'FAILED' || item.status === 'CANCELLED') {
          return;
        }
        if (item.status === 'PAUSED') return;
        pollTimers.set(id, setTimeout(poll, 2000));
      } catch (error: any) {
        console.error('[ExportTasksStore] Poll error:', error);
        if (error?.code === 'ECONNABORTED') {
          pollTimers.set(id, setTimeout(poll, 2000));
          return;
        }
        if (error?.response?.status === 404) {
          // 任务已在别处被 dismiss：移除本地任务并停止轮询，而不是误标 FAILED
          const timer = pollTimers.get(id);
          if (timer) clearTimeout(timer);
          pollTimers.delete(id);
          set((state) => ({
            tasks: state.tasks.filter((task) => task.id !== id),
            total: Math.max(0, state.total - 1),
          }));
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
    const task = get().tasks.find((item) => item.id === id);
    if (!task || !task.taskId) return;
    const response = await api.pauseTask(task.projectId, task.taskId);
    const timer = pollTimers.get(id);
    if (timer) clearTimeout(timer);
    pollTimers.delete(id);
    get().updateTask(id, projectionToTask(response.data as any, task));
  },

  resumeTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || !task.taskId) return;
    const response = await api.resumeTask(task.projectId, task.taskId);
    const resumed = projectionToTask(response.data as any, task);
    get().updateTask(id, resumed);
    // 原生导出由原生工作区负责恢复，避免在浏览器端重复轮询
    if (task.type.startsWith('native-') && resumed.status === 'PENDING') return;
    await get().pollTask(id, task.projectId, task.taskId);
  },

  cancelTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || !task.taskId) return;
    const response = await api.cancelTask(task.projectId, task.taskId);
    const timer = pollTimers.get(id);
    if (timer) clearTimeout(timer);
    pollTimers.delete(id);
    get().updateTask(id, projectionToTask(response.data as any, task));
  },

  retryTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || !task.taskId) return;
    const response = await api.retryTask(task.projectId, task.taskId);
    get().updateTask(id, projectionToTask(response.data as any, task));
    await get().pollTask(id, task.projectId, task.taskId);
  },

  loadTasks: async (filters = {}) => {
    set({ loading: true });
    try {
      const response = await api.listServerTasks({ limit: 100, ...filters });
      const { tasks: serverTasks = [], total = 0 } = response.data ?? {};
      const serverIds = new Set(serverTasks.map((item: any) => item.task_id));
      // 合并：后端投影为准，保留本地乐观任务（无后端 task 的帧截取/创建中任务）
      const merged = [
        ...serverTasks.map((item: any) => projectionToTask(item)),
        ...get().tasks.filter((task) => !serverIds.has(task.taskId)),
      ];
      set({ tasks: merged, total, hasMore: merged.length < total, loading: false });
      return total;
    } catch (error) {
      console.error('[ExportTasksStore] loadTasks error:', error);
      set({ loading: false });
      return get().total;
    }
  },

  loadMoreTasks: async () => {
    const state = get();
    if (state.loading || !state.hasMore) return;
    set({ loading: true });
    try {
      const response = await api.listServerTasks({ limit: 100, cursor: state.tasks.length });
      const { tasks: serverTasks = [], total = 0 } = response.data ?? {};
      const known = new Set(state.tasks.map((task) => task.taskId));
      const appended = serverTasks
        .filter((item: any) => !known.has(item.task_id))
        .map((item: any) => projectionToTask(item));
      const merged = [...state.tasks, ...appended];
      set({ tasks: merged, total, hasMore: merged.length < total, loading: false });
    } catch (error) {
      console.error('[ExportTasksStore] loadMoreTasks error:', error);
      set({ loading: false });
    }
  },

  restoreActiveTasks: () => {
    // 从后端发现进行中的任务并恢复轮询（不再依赖 localStorage）；
    // 原生导出由原生工作区恢复，浏览器端不重复轮询
    const state = get();
    const activeTasks = state.tasks.filter(
      (task) => task.taskId
        && !task.type.startsWith('native-')
        && (task.status === 'PENDING' || task.status === 'PROCESSING' || task.status === 'RUNNING')
    );
    if (activeTasks.length > 0) {
      devLog(`[ExportTasksStore] 恢复 ${activeTasks.length} 个进行中的任务`);
      activeTasks.forEach((task) => {
        state.pollTask(task.id, task.projectId, task.taskId).catch((err) => {
          console.error(`[ExportTasksStore] 恢复任务 ${task.id} 失败:`, err);
        });
      });
    }
  },
}));
