import { create } from 'zustand';
import type { Project, RenderMode, Task } from '@/types';
import * as api from '@/api/endpoints';
import {
  debounce,
  downloadFromUrl,
  normalizeProject,
  normalizeErrorMessage,
} from '@/utils';
import { devLog } from '@/utils/logger';
import { getT } from '@/utils/i18nHelper';

const storeI18n = {
  zh: {
    store: {
      createFailed: '创建项目失败',
      createNoId: '项目创建失败：未返回项目ID',
      syncFailed: '同步项目失败',
      projectNotFound: '项目不存在，可能已被删除',
      requestFailed: '请求失败',
      requestFailedStatus: '请求失败: {{status}}',
      networkError: '网络错误，请检查后端服务是否启动',
      updateOrderFailed: '更新顺序失败',
      newPage: '新页面',
      addPageFailed: '添加页面失败',
      deletePageFailed: '删除页面失败',
      taskStartFailed: '任务启动失败',
      taskFailed: '任务失败',
      unknownTaskStatus: '未知任务状态: {{status}}',
      taskQueryFailed: '任务查询失败',
      generateOutlineFailed: '生成大纲失败',
      generateFromDescFailed: '从描述生成失败',
      projectIdMissing: '项目ID不存在',
      noTaskId: '未收到任务ID',
      generateDescFailed: '生成描述失败',
      generateDescTimeout: '生成描述失败：轮询超时',
      startGenerationFailed: '启动生成任务失败',
      regenerateFailed: '重新生成失败',
      batchGenerateFailed: '批量生成失败',
      editImageFailed: '编辑图片失败',
      exportLinkFailed: '导出链接获取失败',
      exportFailed: '导出失败',
      exportEditableFailed: '导出可编辑PPTX失败',
    }
  },
  en: {
    store: {
      createFailed: 'Failed to create project',
      createNoId: 'Project creation failed: no project ID returned',
      syncFailed: 'Failed to sync project',
      projectNotFound: 'Project not found, it may have been deleted',
      requestFailed: 'Request failed',
      requestFailedStatus: 'Request failed: {{status}}',
      networkError: 'Network error, please check if the backend service is running',
      updateOrderFailed: 'Failed to update page order',
      newPage: 'New Page',
      addPageFailed: 'Failed to add page',
      deletePageFailed: 'Failed to delete page',
      taskStartFailed: 'Failed to start task',
      taskFailed: 'Task failed',
      unknownTaskStatus: 'Unknown task status: {{status}}',
      taskQueryFailed: 'Failed to query task',
      generateOutlineFailed: 'Failed to generate outline',
      generateFromDescFailed: 'Failed to generate from description',
      projectIdMissing: 'Project ID not found',
      noTaskId: 'No task ID received',
      generateDescFailed: 'Failed to generate description',
      generateDescTimeout: 'Failed to generate description: polling timeout',
      startGenerationFailed: 'Failed to start generation task',
      regenerateFailed: 'Failed to regenerate',
      batchGenerateFailed: 'Batch generation failed',
      editImageFailed: 'Failed to edit image',
      exportLinkFailed: 'Failed to get export link',
      exportFailed: 'Export failed',
      exportEditableFailed: 'Failed to export editable PPTX',
    }
  }
};
const t = getT(storeI18n);
const pollingImageTaskIds = new Set<string>();

const getUnfinishedImageTaskPageIds = (task: Task, project: Project): string[] => {
  const manifestPages = Array.isArray(task.progress?.pages) ? task.progress.pages : null;
  if (manifestPages) {
    return manifestPages
      .filter((item: any) => typeof item?.page_id === 'string' && item.status !== 'completed')
      .map((item: any) => item.page_id);
  }
  if (Array.isArray(task.progress?.page_ids)) {
    return (task.progress!.page_ids as unknown[]).filter((id): id is string => typeof id === 'string');
  }
  return project.pages
    .filter(page => page.status === 'QUEUED' || page.status === 'GENERATING')
    .map(page => page.id)
    .filter((id): id is string => !!id);
};

interface ProjectState {
  // 状态
  currentProject: Project | null;
  isGlobalLoading: boolean;
  activeTaskId: string | null;
  taskProgress: { total: number; completed: number } | null;
  error: string | null;
  // 每个页面的生成任务ID映射 (pageId -> taskId)
  pageGeneratingTasks: Record<string, string>;
  activeImageTask: Task | null;
  // 警告消息
  warningMessage: string | null;
  // 流式大纲生成中
  isOutlineStreaming: boolean;
  // 流式描述生成中
  isDescriptionStreaming: boolean;

  // Actions
  setCurrentProject: (project: Project | null) => void;
  setGlobalLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // 项目操作
  initializeProject: (type: 'idea' | 'outline' | 'description', content: string, templateImage?: File, templateStyle?: string, referenceFileIds?: string[], aspectRatio?: string, renderMode?: RenderMode, nativeTheme?: string, templatePackId?: string) => Promise<void>;
  syncProject: (projectId?: string) => Promise<Project | undefined>;
  
  // 页面操作
  updatePageLocal: (pageId: string, data: any) => void;
  saveAllPages: () => Promise<void>;
  reorderPages: (newOrder: string[]) => Promise<void>;
  addNewPage: () => Promise<void>;
  deletePageById: (pageId: string) => Promise<void>;
  
  // 异步任务
  startAsyncTask: (apiCall: () => Promise<any>) => Promise<void>;
  pollTask: (taskId: string) => Promise<void>;
  pollImageTask: (taskId: string, pageIds: string[]) => void;
  restoreImageGeneration: () => void;
  pauseImageGeneration: () => Promise<void>;
  resumeImageGeneration: () => Promise<void>;

  // 生成操作
  generateOutline: () => Promise<void>;
  generateOutlineStream: (lockPageCount?: boolean) => Promise<{ complete: boolean } | undefined>;
  generateFromDescription: () => Promise<void>;
  generateDescriptions: (detailLevel?: string) => Promise<void>;
  generatePageDescription: (pageId: string, detailLevel?: string) => Promise<void>;
  regenerateRenovationPage: (pageId: string, keepLayout?: boolean) => Promise<void>;
  generatePageImage: (pageId: string, forceRegenerate?: boolean) => Promise<void>;
  generateImages: (pageIds?: string[]) => Promise<void>;
  editPageImage: (
    pageId: string,
    editPrompt: string,
    contextImages?: {
      useTemplate?: boolean;
      descImageUrls?: string[];
      uploadedFiles?: File[];
    }
  ) => Promise<void>;
  
  // 导出
  exportPPTX: (pageIds?: string[]) => Promise<void>;
  exportPDF: (pageIds?: string[]) => Promise<void>;
  exportEditablePPTX: (filename?: string, pageIds?: string[]) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  // 防抖的API更新函数（在store内部定义，以便访问syncProject）
const debouncedUpdatePage = debounce(
  async (projectId: string, pageId: string, data: any) => {
      try {
    const promises: Promise<any>[] = [];

    // 如果更新的是 description_content，使用专门的端点
    if (data.description_content) {
      promises.push(api.updatePageDescription(projectId, pageId, data.description_content));
    }

    // 如果更新的是 outline_content，使用专门的端点
    if (data.outline_content) {
      promises.push(api.updatePageOutline(projectId, pageId, data.outline_content));
    }

    // 如果更新的是 part 字段，使用通用端点
    if ('part' in data) {
      promises.push(api.updatePage(projectId, pageId, { part: data.part }));
    }

    // 如果没有特定的内容更新，使用通用端点
    if (promises.length === 0) {
      await api.updatePage(projectId, pageId, data);
    } else {
      // 并行执行所有更新请求
      await Promise.all(promises);
    }
        
        // API调用成功后，同步项目状态以更新updated_at
        // 图片生成期间 poll 已在 2s 同步，跳过以避免并发竞态
        const { syncProject, pageGeneratingTasks } = get();
        if (Object.keys(pageGeneratingTasks).length === 0) {
          await syncProject(projectId);
        }
      } catch (error: any) {
        console.error('保存页面失败:', error);
        // 可以在这里添加错误提示，但为了避免频繁提示，暂时只记录日志
        // 如果需要，可以通过事件系统或toast通知用户
    }
  },
  1000
);

  return {
  // 初始状态
  currentProject: null,
  isGlobalLoading: false,
  activeTaskId: null,
  taskProgress: null,
  error: null,
  pageGeneratingTasks: {},
  activeImageTask: null,
  warningMessage: null,
  isOutlineStreaming: false,
  isDescriptionStreaming: false,

  // Setters
  setCurrentProject: (project) => set({ currentProject: project }),
  setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),
  setError: (error) => set({ error }),

  // 初始化项目
  initializeProject: async (type, content, templateImage, templateStyle, referenceFileIds, aspectRatio, renderMode = 'image', nativeTheme = 'theme01', templatePackId) => {
    set({ isGlobalLoading: true, error: null });
    try {
      const request: any = {};

      if (type === 'idea') {
        request.idea_prompt = content;
      } else if (type === 'outline') {
        request.outline_text = content;
      } else if (type === 'description') {
        request.description_text = content;
      }

      // 添加风格描述（如果有）
      if (templateStyle && templateStyle.trim()) {
        request.template_style = templateStyle.trim();
      }
      if (templatePackId && templatePackId.trim()) {
        request.template_pack_id = templatePackId.trim();
      }

      // 添加画面比例（如果有）
      if (aspectRatio) {
        request.image_aspect_ratio = aspectRatio;
      }

      request.render_mode = renderMode;
      if (renderMode === 'native') {
        request.native_theme = nativeTheme;
      }

      // 1. 创建项目
      const response = await api.createProject(request);
      const projectId = response.data?.project_id;

      if (!projectId) {
        throw new Error(t('store.createNoId'));
      }

      // 2. 关联参考文件到项目（在生成之前，确保 AI 能读取参考文件）
      if (referenceFileIds && referenceFileIds.length > 0) {
        try {
          await Promise.all(
            referenceFileIds.map(fileId => api.associateFileToProject(fileId, projectId))
          );
          devLog(`[初始化项目] 已关联 ${referenceFileIds.length} 个参考文件`);
        } catch (error) {
          console.warn('[初始化项目] 关联参考文件失败:', error);
        }
      }

      // 3. 如果有模板图片，上传模板
      if (templateImage) {
        try {
          await api.uploadTemplate(projectId, templateImage);
        } catch (error) {
          console.warn('模板上传失败:', error);
          // 模板上传失败不影响项目创建，继续执行
        }
      }

      // 4. 获取完整项目信息。大纲/描述入口的 AI 生成由大纲页的 SSE 流程接管。
      const projectResponse = await api.getProject(projectId);
      const project = normalizeProject(projectResponse.data);

      if (project) {
        set({ currentProject: project });
        // 保存到 localStorage
        localStorage.setItem('currentProjectId', project.id!);
      }
    } catch (error: any) {
      set({ error: normalizeErrorMessage(error.message || t('store.createFailed')) });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // 同步项目数据
  syncProject: async (projectId?: string) => {
    const { currentProject } = get();

    // 如果没有提供 projectId，尝试从 currentProject 或 localStorage 获取
    let targetProjectId = projectId;
    if (!targetProjectId) {
      if (currentProject?.id) {
        targetProjectId = currentProject.id;
      } else {
        targetProjectId = localStorage.getItem('currentProjectId') || undefined;
      }
    }

    if (!targetProjectId) {
      console.warn('syncProject: 没有可用的项目ID');
      return;
    }

    try {
      const response = await api.getProject(targetProjectId);
      if (response.data) {
        const project = normalizeProject(response.data);
        devLog('[syncProject] 同步项目数据:', {
          projectId: project.id,
          pagesCount: project.pages?.length || 0,
          status: project.status
        });
        set({ currentProject: project });
        // 确保 localStorage 中保存了项目ID
        localStorage.setItem('currentProjectId', project.id!);
        return project;
      }
    } catch (error: any) {
      // 提取更详细的错误信息
      let errorMessage = t('store.syncFailed');
      let shouldClearStorage = false;
      
      if (error.response) {
        // 服务器返回了错误响应
        const errorData = error.response.data;
        if (error.response.status === 404) {
          // 404错误：项目不存在，清除localStorage
          errorMessage = errorData?.error?.message || t('store.projectNotFound');
          shouldClearStorage = true;
        } else if (errorData?.error?.message) {
          // 从后端错误格式中提取消息
          errorMessage = errorData.error.message;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (errorData?.error) {
          errorMessage = typeof errorData.error === 'string' ? errorData.error : errorData.error.message || t('store.requestFailed');
        } else {
          errorMessage = t('store.requestFailedStatus', { status: error.response.status });
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        errorMessage = t('store.networkError');
      } else if (error.message) {
        // 其他错误
        errorMessage = error.message;
      }
      
      // 如果项目不存在，清除localStorage并重置当前项目
      // 不显示错误toast，因为这通常是自动同步时发现的过期项目ID
      if (shouldClearStorage) {
        console.warn('[syncProject] 项目不存在，清除localStorage');
        localStorage.removeItem('currentProjectId');
        set({ currentProject: null });
      } else {
        set({ error: normalizeErrorMessage(errorMessage) });
      }
    }
  },

  // 本地更新页面（乐观更新）
  updatePageLocal: (pageId, data) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, ...data } : page
    );

    set({
      currentProject: {
        ...currentProject,
        pages: updatedPages,
      },
    });

    // 防抖后调用API
    debouncedUpdatePage(currentProject.id, pageId, data);
  },

  // 立即保存所有页面的更改（用于保存按钮）
  // 等待防抖完成，然后同步项目状态以确保updated_at更新
  saveAllPages: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    // 等待防抖延迟时间（1秒）+ 额外时间确保API调用完成
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 同步项目状态，这会从后端获取最新的updated_at
    await get().syncProject(currentProject.id);
  },

  // 重新排序页面
  reorderPages: async (newOrder) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // 乐观更新
    const reorderedPages = newOrder
      .map((id) => currentProject.pages.find((p) => p.id === id))
      .filter(Boolean) as any[];

    set({
      currentProject: {
        ...currentProject,
        pages: reorderedPages,
      },
    });

    try {
      await api.updatePagesOrder(currentProject.id, newOrder);
    } catch (error: any) {
      set({ error: error.message || t('store.updateOrderFailed') });
      // 失败后重新同步
      await get().syncProject();
    }
  },

  // 添加新页面
  addNewPage: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const newPage = {
        outline_content: { title: t('store.newPage'), points: [] },
        order_index: currentProject.pages.length,
      };

      const response = await api.addPage(currentProject.id, newPage);
      if (response.data) {
        await get().syncProject();
      }
    } catch (error: any) {
      set({ error: error.message || t('store.addPageFailed') });
    }
  },

  // 删除页面
  deletePageById: async (pageId) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      await api.deletePage(currentProject.id, pageId);
      await get().syncProject();
    } catch (error: any) {
      set({ error: error.message || t('store.deletePageFailed') });
    }
  },

  // 启动异步任务
  startAsyncTask: async (apiCall) => {
    devLog('[异步任务] 启动异步任务...');
    set({ isGlobalLoading: true, error: null });
    try {
      const response = await apiCall();
      devLog('[异步任务] API响应:', response);
      
      // task_id 在 response.data 中
      const taskId = response.data?.task_id;
      if (taskId) {
        devLog('[异步任务] 收到task_id:', taskId, '开始轮询...');
        set({ activeTaskId: taskId });
        await get().pollTask(taskId);
      } else {
        console.warn('[异步任务] 响应中没有task_id，可能是同步操作:', response);
        // 同步操作完成后，刷新项目数据
        await get().syncProject();
        set({ isGlobalLoading: false });
      }
    } catch (error: any) {
      console.error('[异步任务] 启动失败:', error);
      set({ error: error.message || t('store.taskStartFailed'), isGlobalLoading: false });
      throw error;
    }
  },

  // 轮询任务状态
  pollTask: async (taskId) => {
    devLog(`[轮询] 开始轮询任务: ${taskId}`);
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('[轮询] 没有当前项目，停止轮询');
      return;
    }
    const projectId = currentProject.id!;

    const poll = async () => {
      try {
        devLog(`[轮询] 查询任务状态: ${taskId}`);
        const response = await api.getTaskStatus(projectId, taskId);
        const task = response.data;
        
        if (!task) {
          console.warn('[轮询] 响应中没有任务数据');
          return;
        }

        // 更新进度
        if (task.progress) {
          set({ taskProgress: task.progress });
        }

        devLog(`[轮询] Task ${taskId} 状态: ${task.status}`, task);

        // 检查任务状态
        if (task.status === 'COMPLETED') {
          devLog(`[轮询] Task ${taskId} 已完成，刷新项目数据`);
          
          // 如果是导出可编辑PPTX任务，检查是否有下载链接
          if (task.task_type === 'EXPORT_EDITABLE_PPTX' && task.progress) {
            const progress = typeof task.progress === 'string' 
              ? JSON.parse(task.progress) 
              : task.progress;
            
            const downloadUrl = progress?.download_url;
            if (downloadUrl) {
              devLog('[导出可编辑PPTX] 从任务响应中获取下载链接:', downloadUrl);
              // 延迟一下，确保状态更新完成后再打开下载链接
              setTimeout(() => {
                downloadFromUrl(
                  downloadUrl,
                  progress?.filename || downloadUrl.split('/').pop()?.split('?')[0],
                );
              }, 500);
            } else {
              console.warn('[导出可编辑PPTX] 任务完成但没有下载链接');
            }
          }
          
          set({ 
            activeTaskId: null, 
            taskProgress: null, 
            isGlobalLoading: false 
          });
          // 刷新项目数据
          await get().syncProject();
        } else if (task.status === 'FAILED') {
          console.error(`[轮询] Task ${taskId} 失败:`, task.error_message || task.error);
          set({ 
            error: normalizeErrorMessage(task.error_message || task.error || t('store.taskFailed')),
            activeTaskId: null,
            taskProgress: null,
            isGlobalLoading: false
          });
        } else if (task.status === 'PENDING' || task.status === 'PROCESSING') {
          // 继续轮询（PENDING 或 PROCESSING）
          devLog(`[轮询] Task ${taskId} 处理中，2秒后继续轮询...`);
          setTimeout(poll, 2000);
        } else {
          // 未知状态，停止轮询
          console.warn(`[轮询] Task ${taskId} 未知状态: ${task.status}，停止轮询`);
          set({ 
            error: `${t('store.unknownTaskStatus', { status: task.status })}`,
            activeTaskId: null,
            taskProgress: null,
            isGlobalLoading: false
          });
        }
      } catch (error: any) {
        console.error('任务轮询错误:', error);
        set({ 
          error: normalizeErrorMessage(error.message || t('store.taskQueryFailed')),
          activeTaskId: null,
          isGlobalLoading: false
        });
      }
    };

    await poll();
  },

  // 生成大纲（同步操作，不需要轮询）
  generateOutline: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.generateOutline(currentProject.id!);
      devLog('[生成大纲] API响应:', response);
      
      // 刷新项目数据，确保获取最新的大纲页面
      await get().syncProject();
      
      // 再次确认数据已更新
      const { currentProject: updatedProject } = get();
      devLog('[生成大纲] 刷新后的项目:', updatedProject?.pages.length, '个页面');
    } catch (error: any) {
      console.error('[生成大纲] 错误:', error);
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        t('store.generateOutlineFailed');
      set({ error: normalizeErrorMessage(message) });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // 流式生成大纲（SSE，逐页渲染）
  generateOutlineStream: async (lockPageCount?: boolean) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isOutlineStreaming: true, error: null });

    // Clear existing pages for fresh streaming display
    set({
      currentProject: { ...currentProject, pages: [] },
    });

    // Concurrent queue: pages are pushed by SSE callbacks, drained by a timer loop
    const pageQueue: any[] = [];
    let streamDone = false;
    let doneData: { total: number; pages: any[]; complete?: boolean } | null = null;
    const STAGGER_MS = 150;

    // Start the render loop — runs concurrently with the SSE stream
    const renderPromise = new Promise<void>((resolve) => {
      const tick = () => {
        if (pageQueue.length > 0) {
          const page = pageQueue.shift()!;
          const { currentProject: proj } = get();
          if (proj) {
            const tempPage: any = {
              id: `streaming-${page.index}`,
              order_index: page.index,
              outline_content: { title: page.title, points: page.points },
              description_content: page.description_text
                ? { text: page.description_text, ...(page.extra_fields ? { extra_fields: page.extra_fields } : {}) }
                : undefined,
              part: page.part,
              status: page.description_text ? 'DESCRIPTION_GENERATED' : 'DRAFT',
            };
            set({
              currentProject: { ...proj, pages: [...proj.pages, tempPage] },
            });
          }
          setTimeout(tick, STAGGER_MS);
        } else if (streamDone) {
          resolve();
        } else {
          // Queue empty but stream still going — poll quickly
          setTimeout(tick, 30);
        }
      };
      tick();
    });

    try {
      await api.generateOutlineStream(currentProject.id!, {
        onPage: (page) => { pageQueue.push(page); },
        onDone: (data) => { doneData = data; },
        onError: (message) => {
          console.error('[流式大纲] 错误:', message);
          set({ error: normalizeErrorMessage(message), isOutlineStreaming: false });
          streamDone = true;
        },
      }, undefined /* language */, lockPageCount);

      streamDone = true;
      await renderPromise;

      // Replace temp pages with real persisted pages
      if (doneData) {
        const { currentProject: proj } = get();
        if (proj) {
          const normalized = normalizeProject({ ...proj, pages: doneData.pages });
          set({ currentProject: normalized, isOutlineStreaming: false });
        }
        devLog('[流式大纲] 完成:', doneData.total, '个页面');
        return { complete: doneData.complete ?? false };
      } else {
        set({ isOutlineStreaming: false });
        return { complete: false };
      }
    } catch (error: any) {
      console.error('[流式大纲] 错误:', error);
      streamDone = true;
      set({
        error: normalizeErrorMessage(error.message || t('store.generateOutlineFailed')),
        isOutlineStreaming: false,
      });
      throw error;
    }
  },

  // 从描述生成大纲和页面描述（同步操作）
  generateFromDescription: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.generateFromDescription(currentProject.id!);
      devLog('[从描述生成] API响应:', response);
      
      // 刷新项目数据，确保获取最新的大纲和描述
      await get().syncProject();
      
      // 再次确认数据已更新
      const { currentProject: updatedProject } = get();
      devLog('[从描述生成] 刷新后的项目:', updatedProject?.pages.length, '个页面');
    } catch (error: any) {
      console.error('[从描述生成] 错误:', error);
      set({ error: error.message || t('store.generateFromDescFailed') });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // 生成描述（根据设置选择流式或并行模式）
  generateDescriptions: async (detailLevel?: string) => {
    const { currentProject } = get();
    if (!currentProject || !currentProject.id) return;

    const pages = currentProject.pages.filter((p) => p.id);
    if (pages.length === 0) return;

    // 检查描述生成模式，优先从 sessionStorage 缓存读取以避免额外 API 调用
    let mode: string = 'streaming';
    try {
      const cached = sessionStorage.getItem('easyslide-settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.description_generation_mode) {
          mode = parsed.description_generation_mode;
        }
      }
    } catch { /* ignore */ }

    if (mode === 'streaming') {
      // 流式模式
      set({ isDescriptionStreaming: true, error: null });

      const updatedPages = currentProject.pages.map((page) =>
        page.id ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
      );
      set({ currentProject: { ...currentProject, pages: updatedPages } });

      // Concurrent queue + render loop (like outline streaming)
      const descQueue: api.DescriptionStreamEvent[] = [];
      let streamDone = false;
      let doneData: { total: number; pages: any[]; warning?: string } | null = null;
      const STAGGER_MS = 100;

      const renderPromise = new Promise<void>((resolve) => {
        const tick = () => {
          if (descQueue.length > 0) {
            const desc = descQueue.shift()!;
            const { currentProject: proj } = get();
            if (proj) {
              const updatedPages = proj.pages.map((page) => {
                if (page.id === desc.page_id) {
                  return {
                    ...page,
                    status: 'DESCRIPTION_GENERATED' as const,
                    description_content: {
                      text: desc.text,
                      ...(desc.extra_fields ? { extra_fields: desc.extra_fields } : {}),
                    },
                  };
                }
                return page;
              });
              set({ currentProject: { ...proj, pages: updatedPages } });
            }
            setTimeout(tick, STAGGER_MS);
          } else if (streamDone) {
            resolve();
          } else {
            setTimeout(tick, 30);
          }
        };
        tick();
      });

      try {
        await api.generateDescriptionsStream(currentProject.id, {
          onDescription: (data) => { descQueue.push(data); },
          onDone: (data) => { doneData = data; },
          onError: (message) => {
            console.error('[流式描述] 错误:', message);
            set({ error: normalizeErrorMessage(message) });
            streamDone = true;
          },
        }, undefined, detailLevel);

        streamDone = true;
        await renderPromise;

        if (doneData) {
          const { currentProject: proj } = get();
          if (proj) {
            const normalized = normalizeProject({ ...proj, pages: doneData.pages });
            set({
              currentProject: normalized,
              isDescriptionStreaming: false,
              ...(doneData.warning ? { error: doneData.warning } : {}),
            });
          }
          devLog('[流式描述] 完成:', doneData.total, '个页面');
        } else {
          // 无 doneData（SSE error 或连接中断）→ 从后端恢复真实状态
          await get().syncProject();
          set({ isDescriptionStreaming: false });
        }
      } catch (error: any) {
        console.error('[流式描述] 错误:', error);
        streamDone = true;
        await get().syncProject();
        set({
          error: normalizeErrorMessage(error.message || t('store.generateDescFailed')),
          isDescriptionStreaming: false,
        });
        throw error;
      }
    } else {
      // 并行模式（原有逻辑）
      set({ error: null });

      const updatedPages = currentProject.pages.map((page) =>
        page.id ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
      );
      set({ currentProject: { ...currentProject, pages: updatedPages } });

      try {
        const projectId = currentProject.id;
        if (!projectId) {
          throw new Error(t('store.projectIdMissing'));
        }

        const response = await api.generateDescriptions(projectId, undefined, detailLevel);
        const taskId = response.data?.task_id;

        if (!taskId) {
          throw new Error(t('store.noTaskId'));
        }

        let pollErrors = 0;
        const pollAndSync = async () => {
          try {
            const taskResponse = await api.getTaskStatus(projectId, taskId);
            const task = taskResponse.data;

            if (task) {
              if (task.progress) {
                set({ taskProgress: task.progress });
              }

              await get().syncProject();

              if (task.status === 'COMPLETED') {
                set({ taskProgress: null, activeTaskId: null });
                await get().syncProject();
              } else if (task.status === 'FAILED') {
                set({
                  taskProgress: null,
                  activeTaskId: null,
                  error: normalizeErrorMessage(task.error_message || task.error || t('store.generateDescFailed'))
                });
                await get().syncProject();
              } else if (task.status === 'PENDING' || task.status === 'PROCESSING') {
                setTimeout(pollAndSync, 2000);
              }
            }
          } catch (error: any) {
            console.error('[生成描述] 轮询错误:', error);
            pollErrors++;
            if (pollErrors >= 10) {
              console.error('[生成描述] 轮询错误次数过多，停止轮询');
              set({
                taskProgress: null,
                activeTaskId: null,
                error: normalizeErrorMessage(error.message || t('store.generateDescTimeout'))
              });
              await get().syncProject();
              return;
            }
            await get().syncProject();
            setTimeout(pollAndSync, 2000);
          }
        };

        setTimeout(pollAndSync, 2000);

      } catch (error: any) {
        console.error('[生成描述] 启动任务失败:', error);
        await get().syncProject();
        set({ error: normalizeErrorMessage(error.message || t('store.startGenerationFailed')) });
        throw error;
      }
    }
  },

  // 生成单页描述
  generatePageDescription: async (pageId: string, detailLevel?: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // 如果该页面正在生成，不重复提交
    const targetPage = currentProject.pages.find((p) => p.id === pageId);
    if (targetPage?.status === 'GENERATING_DESCRIPTION') {
      devLog(`[生成描述] 页面 ${pageId} 正在生成中，跳过重复请求`);
      return;
    }

    set({ error: null });

    // 乐观更新：设置页面状态为 GENERATING_DESCRIPTION
    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
    );
    set({ currentProject: { ...currentProject, pages: updatedPages } });

    try {
      const response = await api.generatePageDescription(currentProject.id, pageId, true, undefined, detailLevel);

      if (response.data) {
        const updatedPageData = response.data;
        const { currentProject: latestProject } = get();
        if (latestProject) {
          const newPages = latestProject.pages.map((page) =>
            page.id === pageId ? { ...page, ...updatedPageData } : page
          );
          set({ currentProject: { ...latestProject, pages: newPages } });
          devLog(`[生成描述] 页面 ${pageId} 描述已更新，数据来自 API 响应`);
        }
      }
    } catch (error: any) {
      // 恢复页面状态
      await get().syncProject();
      set({ error: normalizeErrorMessage(error.message || t('store.generateDescFailed')) });
      throw error;
    }
  },

  // 重新生成 PPT 翻新项目的单页（重新解析原 PDF 并提取内容）
  regenerateRenovationPage: async (pageId: string, keepLayout: boolean = false) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // 如果该页面正在生成，不重复提交
    const targetPage = currentProject.pages.find((p) => p.id === pageId);
    if (targetPage?.status === 'GENERATING_DESCRIPTION') {
      devLog(`[PPT翻新] 页面 ${pageId} 正在生成中，跳过重复请求`);
      return;
    }

    set({ error: null });

    // 乐观更新：设置页面状态为 GENERATING_DESCRIPTION
    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
    );
    set({ currentProject: { ...currentProject, pages: updatedPages } });

    try {
      const response = await api.regenerateRenovationPage(currentProject.id, pageId, keepLayout);

      if (response.data) {
        const updatedPageData = response.data;
        const { currentProject: latestProject } = get();
        if (latestProject) {
          const newPages = latestProject.pages.map((page) =>
            page.id === pageId ? { ...page, ...updatedPageData } : page
          );
          set({ currentProject: { ...latestProject, pages: newPages } });
          devLog(`[PPT翻新] 页面 ${pageId} 大纲和描述已更新`);
        }
      }
    } catch (error: any) {
      await get().syncProject();
      set({ error: normalizeErrorMessage(error.message || t('store.regenerateFailed')) });
      throw error;
    }
  },

  // 生成单页图片（用于预览页的手动重新生成）
  generatePageImage: async (pageId: string, forceRegenerate: boolean = false) => {
    const { currentProject } = get();
    if (!currentProject) return;

    if (get().pageGeneratingTasks[pageId]) {
      devLog(`[单页生成] 页面 ${pageId} 正在生成中，跳过重复请求`);
      return;
    }

    set({ error: null, warningMessage: null });

    try {
      const response = await api.generatePageImage(currentProject.id, pageId, forceRegenerate);
      const taskId = response.data?.task_id;

      if (taskId) {
        devLog(`[单页生成] 收到 task_id: ${taskId}，开始轮询页面 ${pageId}`);
        set((state) => ({
          pageGeneratingTasks: {
            ...state.pageGeneratingTasks,
            [pageId]: taskId,
          },
        }));

        await get().syncProject();
        get().pollImageTask(taskId, [pageId]);
      } else {
        await get().syncProject();
      }
    } catch (error: any) {
      console.error('[单页生成] 启动失败:', error);
      await get().syncProject();
      throw error;
    }
  },

  // 生成图片（非阻塞，每个页面显示生成状态）
  generateImages: async (pageIds?: string[]) => {
    const { currentProject, pageGeneratingTasks } = get();
    if (!currentProject?.id) return;

    const requestedIds = new Set(
      pageIds || currentProject.pages.map(page => page.id).filter((id): id is string => !!id),
    );
    const targetPageIds = currentProject.pages
      .filter(page => page.id && requestedIds.has(page.id))
      .filter(page => !page.generated_image_path && !pageGeneratingTasks[page.id!])
      .map(page => page.id!);
    if (targetPageIds.length === 0) {
      devLog('[批量生成] 没有待生成页面，已保留现有图片');
      return;
    }

    set({ error: null, warningMessage: null });
    
    try {
      // 调用批量生成 API
      const response = await api.generateImages(currentProject.id, undefined, targetPageIds);
      const taskId = response.data?.task_id;
      
      if (taskId) {
        devLog(`[批量生成] 收到 task_id: ${taskId}，标记 ${targetPageIds.length} 个页面为生成中`);
        const activeImageTask: Task = {
          task_id: taskId,
          task_type: 'GENERATE_IMAGES',
          status: 'PENDING',
          progress: { total: targetPageIds.length, completed: 0, failed: 0, page_ids: targetPageIds },
        };
        set((state) => {
          const nextTasks = { ...state.pageGeneratingTasks };
          targetPageIds.forEach(id => { nextTasks[id] = taskId; });
          return { pageGeneratingTasks: nextTasks, activeImageTask };
        });
        
        // 立即同步一次项目数据，以获取后端设置的 'QUEUED' 状态
        await get().syncProject();

        // 开始轮询批量任务状态（非阻塞）
        get().pollImageTask(taskId, targetPageIds);
      } else {
        // 如果没有返回 task_id，可能是同步接口，直接刷新
        await get().syncProject();
      }
    } catch (error: any) {
      console.error('[批量生成] 启动失败:', error);
      throw error;
    }
  },

  // 轮询图片生成任务（非阻塞，支持页面离开后重新接管）
  pollImageTask: (taskId: string, pageIds: string[]) => {
    const projectId = get().currentProject?.id;
    if (!projectId || pollingImageTaskIds.has(taskId)) return;
    pollingImageTaskIds.add(taskId);
    let pollErrors = 0;

    const stopPolling = () => pollingImageTaskIds.delete(taskId);
    const schedulePoll = (poll: () => Promise<void>, delay = 2000) => {
      setTimeout(() => void poll(), delay);
    };
    const clearPageTaskMappings = () => {
      const nextTasks = { ...get().pageGeneratingTasks };
      pageIds.forEach(id => {
        if (nextTasks[id] === taskId) delete nextTasks[id];
      });
      return nextTasks;
    };
    const syncCurrentProject = async () => {
      if (get().currentProject?.id === projectId) {
        await get().syncProject(projectId);
      }
    };

    const poll = async () => {
      if (get().currentProject?.id !== projectId) {
        stopPolling();
        return;
      }
      try {
        const task = (await api.getTaskStatus(projectId, taskId)).data;
        if (!task) throw new Error('任务状态为空');
        pollErrors = 0;
        devLog(`[批量轮询] Task ${taskId} 状态: ${task.status}`, task.progress);

        if (task.status === 'COMPLETED') {
          stopPolling();
          set({
            pageGeneratingTasks: clearPageTaskMappings(),
            activeImageTask: null,
            warningMessage: task.progress?.warning_message || null,
          });
          await syncCurrentProject();
          return;
        }

        if (task.status === 'FAILED') {
          stopPolling();
          set({
            pageGeneratingTasks: clearPageTaskMappings(),
            activeImageTask: null,
            error: normalizeErrorMessage(task.error_message || task.error || t('store.batchGenerateFailed')),
          });
          await syncCurrentProject();
          return;
        }

        if (task.status === 'PAUSED') {
          stopPolling();
          set({ activeImageTask: task });
          await syncCurrentProject();
          return;
        }

        if (['PENDING', 'PROCESSING', 'RUNNING'].includes(task.status)) {
          set({ activeImageTask: task });
          await syncCurrentProject();

          const project = get().currentProject;
          if (project?.id === projectId) {
            const nextTasks = { ...get().pageGeneratingTasks };
            pageIds.forEach(id => {
              const page = project.pages.find(item => item.id === id);
              if (page?.generated_image_path || (page?.status === 'FAILED' && task.status !== 'PAUSED')) {
                if (nextTasks[id] === taskId) delete nextTasks[id];
              } else {
                nextTasks[id] = taskId;
              }
            });
            set({ pageGeneratingTasks: nextTasks });
          }
          schedulePoll(poll);
          return;
        }

        stopPolling();
        set({ pageGeneratingTasks: clearPageTaskMappings(), activeImageTask: null });
      } catch (error) {
        console.error('[批量轮询] 轮询错误，将自动重试:', error);
        if (get().currentProject?.id !== projectId) {
          stopPolling();
          return;
        }
        pollErrors += 1;
        if (pollErrors === 3) {
          set({ warningMessage: '图片任务连接暂时中断，正在后台自动重试。' });
        }
        schedulePoll(poll, Math.min(2000 * pollErrors, 10000));
      }
    };

    void poll();
  },

  restoreImageGeneration: () => {
    const project = get().currentProject;
    if (!project) return;
    const task = project.active_image_tasks?.[0];
    if (!task) {
      set({ activeImageTask: null });
      return;
    }
    const savedPageIds = getUnfinishedImageTaskPageIds(task, project);
    const nextTasks: Record<string, string> = {};
    savedPageIds.forEach(id => {
      const page = project.pages.find(item => item.id === id);
      if (page && !page.generated_image_path && (page.status !== 'FAILED' || task.status === 'PAUSED')) {
        nextTasks[id] = task.task_id;
      }
    });
    set({ activeImageTask: task, pageGeneratingTasks: nextTasks });
    if (task.status !== 'PAUSED') {
      get().pollImageTask(task.task_id, savedPageIds);
    }
  },

  pauseImageGeneration: async () => {
    const { currentProject, activeImageTask } = get();
    if (!currentProject?.id || !activeImageTask) return;
    const task = (await api.pauseTask(currentProject.id, activeImageTask.task_id)).data;
    if (task) set({ activeImageTask: task });
  },

  resumeImageGeneration: async () => {
    const { currentProject, activeImageTask } = get();
    if (!currentProject?.id || !activeImageTask) return;
    const task = (await api.resumeTask(currentProject.id, activeImageTask.task_id)).data;
    if (!task) return;
    const pageIds = getUnfinishedImageTaskPageIds(task, currentProject);
    const nextTasks: Record<string, string> = {};
    pageIds.forEach(id => { nextTasks[id] = task.task_id; });
    set({ activeImageTask: task, pageGeneratingTasks: nextTasks });
    get().pollImageTask(task.task_id, pageIds);
  },

  // 编辑页面图片（异步）
  editPageImage: async (pageId, editPrompt, contextImages) => {
    const { currentProject, pageGeneratingTasks } = get();
    if (!currentProject) return;

    // 如果该页面正在生成，不重复提交
    if (pageGeneratingTasks[pageId]) {
      devLog(`[编辑] 页面 ${pageId} 正在生成中，跳过重复请求`);
      return;
    }

    set({ error: null });
    try {
      const response = await api.editPageImage(currentProject.id, pageId, editPrompt, contextImages);
      const taskId = response.data?.task_id;
      
      if (taskId) {
        // 记录该页面的任务ID
        set({ 
          pageGeneratingTasks: { ...pageGeneratingTasks, [pageId]: taskId }
        });
        
        // 立即同步一次项目数据，以获取后端设置的'GENERATING'状态
        await get().syncProject();
        
        // 开始轮询（使用统一的轮询函数）
        get().pollImageTask(taskId, [pageId]);
      } else {
        // 如果没有返回task_id，可能是同步接口，直接刷新
        await get().syncProject();
      }
    } catch (error: any) {
      // 清除该页面的任务记录
      const { pageGeneratingTasks } = get();
      const newTasks = { ...pageGeneratingTasks };
      delete newTasks[pageId];
      set({ pageGeneratingTasks: newTasks, error: normalizeErrorMessage(error.message || t('store.editImageFailed')) });
      throw error;
    }
  },

  // 导出PPTX
  exportPPTX: async (pageIds?: string[]) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.exportPPTX(currentProject.id, pageIds);
      // 优先使用相对路径，避免 Docker 环境下的端口问题
      const downloadUrl =
        response.data?.download_url || response.data?.download_url_absolute;

      if (!downloadUrl) {
        throw new Error(t('store.exportLinkFailed'));
      }

      const filename = response.data?.filename
        || downloadUrl.split('/').pop()?.split('?')[0]
        || 'presentation.pptx';
      await downloadFromUrl(downloadUrl, filename);
    } catch (error: any) {
      set({ error: error.message || t('store.exportFailed') });
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // 导出PDF
  exportPDF: async (pageIds?: string[]) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.exportPDF(currentProject.id, pageIds);
      // 优先使用相对路径，避免 Docker 环境下的端口问题
      const downloadUrl =
        response.data?.download_url || response.data?.download_url_absolute;

      if (!downloadUrl) {
        throw new Error(t('store.exportLinkFailed'));
      }

      const filename = response.data?.filename
        || downloadUrl.split('/').pop()?.split('?')[0]
        || 'presentation.pdf';
      await downloadFromUrl(downloadUrl, filename);
    } catch (error: any) {
      set({ error: error.message || t('store.exportFailed') });
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // 导出可编辑PPTX（异步任务）
  exportEditablePPTX: async (filename?: string, pageIds?: string[]) => {
    const { currentProject, startAsyncTask } = get();
    if (!currentProject) return;

    try {
      devLog('[导出可编辑PPTX] 启动异步导出任务...');
      // startAsyncTask 中的 pollTask 会在任务完成时自动处理下载
      await startAsyncTask(() => api.exportEditablePPTX(currentProject.id, filename, pageIds));
      devLog('[导出可编辑PPTX] 异步任务完成');
    } catch (error: any) {
      console.error('[导出可编辑PPTX] 导出失败:', error);
      set({ error: error.message || t('store.exportEditableFailed') });
    }
  },
};});

