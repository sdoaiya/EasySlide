import { create } from 'zustand';
import * as api from '@/api/endpoints';
import type { ContentProject, ContentWorkspaceKind, ProjectWorkspace } from '@/types';
import type { ContentSpineOptimization } from '@/api/endpoints';
import { useExportTasksStore } from './useExportTasksStore';

export const selectContentWorkspace = (
  project: ContentProject | null | undefined,
  kind: ContentWorkspaceKind,
): ProjectWorkspace | undefined => project?.workspaces.find((workspace) => workspace.kind === kind);

export const selectSpineSummary = (project: ContentProject | null | undefined) => {
  const document = project?.spine.document;
  return {
    topic: document?.topic?.value || project?.project_title || '',
    sources: Array.isArray(document?.sources) ? document.sources : [],
  };
};

type ContentProjectState = {
  project: ContentProject | null;
  loading: boolean;
  error: string | null;
  load: (projectId: string) => Promise<void>;
  confirmSpine: () => Promise<void>;
  updateSpine: (document: Record<string, unknown>) => Promise<void>;
  optimizeSpine: (context: Pick<ContentSpineOptimization, 'topic' | 'audience' | 'goal'>) => Promise<ContentSpineOptimization>;
  initializeWorkspace: (kind: ContentWorkspaceKind) => Promise<void>;
  clear: () => void;
};

export const useContentProjectStore = create<ContentProjectState>((set, get) => ({
  project: null,
  loading: false,
  error: null,

  load: async (projectId) => {
    set((state) => ({
      project: state.project?.project_id === projectId ? state.project : null,
      loading: true,
      error: null,
    }));
    try {
      const response = await api.getContentProject(projectId);
      set({ project: response.data, loading: false });
    } catch (error: any) {
      set({ error: error?.response?.data?.error?.message || error.message, loading: false });
    }
  },

  confirmSpine: async () => {
    const project = get().project;
    if (!project) return;
    await api.confirmContentSpine(project.project_id, project.spine.revision);
    await get().load(project.project_id);
  },

  updateSpine: async (document) => {
    const project = get().project;
    if (!project) return;
    await api.updateContentSpine(project.project_id, document, project.spine.revision);
    await get().load(project.project_id);
  },

  optimizeSpine: async (context) => {
    const project = get().project;
    if (!project) throw new Error('项目简报尚未加载');
    const response = await api.optimizeContentSpine(project.project_id, context);
    if (!response.data) throw new Error('AI 未返回项目简报建议');
    return response.data;
  },

  initializeWorkspace: async (kind) => {
    const project = get().project;
    if (!project) return;
    const response = await api.initializeContentWorkspace(project.project_id, kind);
    const taskId = response.data?.task_id;
    if (taskId) {
      const taskKey = `workspace-init-${taskId}`;
      useExportTasksStore.getState().addTask({
        id: taskKey,
        taskId,
        projectId: project.project_id,
        type: 'workspace',
        status: 'PENDING',
        progress: {
          total: 1,
          completed: 0,
          current_step: `准备${kind === 'video' ? '视频' : '播客'}工作区`,
          workspace_kind: kind,
        },
      });
      void useExportTasksStore.getState().pollTask(taskKey, project.project_id, taskId);
    }
    await get().load(project.project_id);
  },

  clear: () => set({ project: null, loading: false, error: null }),
}));
