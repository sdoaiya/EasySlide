import { create } from 'zustand';
import * as api from '@/api/endpoints';
import type { CreateWorkspaceGenerationRunRequest, OptimizeWorkspaceGenerationRunRequest, WorkspaceGenerationRun } from '@/types';

type WorkspaceGenerationState = {
  runs: WorkspaceGenerationRun[];
  loading: boolean;
  error: string | null;
  loadRuns: (projectId: string) => Promise<void>;
  getRun: (projectId: string, runId: string) => Promise<WorkspaceGenerationRun | null>;
  createRun: (projectId: string, data: CreateWorkspaceGenerationRunRequest) => Promise<WorkspaceGenerationRun | null>;
  controlRun: (projectId: string, runId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => Promise<void>;
  publishRun: (projectId: string, runId: string) => Promise<WorkspaceGenerationRun | null>;
  optimizeRun: (projectId: string, runId: string, data: OptimizeWorkspaceGenerationRunRequest) => Promise<WorkspaceGenerationRun | null>;
  clear: () => void;
};

const errorMessage = (cause: any) => cause?.response?.data?.error?.message || cause?.message || '操作失败，请稍后重试。';

export const useWorkspaceGenerationStore = create<WorkspaceGenerationState>((set) => ({
  runs: [],
  loading: false,
  error: null,

  loadRuns: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.listWorkspaceGenerationRuns(projectId);
      set({ runs: response.data?.runs || [], loading: false });
    } catch (cause: any) {
      set({ error: errorMessage(cause), loading: false });
    }
  },

  getRun: async (projectId, runId) => {
    try {
      const response = await api.getWorkspaceGenerationRun(projectId, runId);
      const run = response.data;
      if (run) {
        set((state) => ({
          runs: state.runs.some((item) => item.run_id === run.run_id)
            ? state.runs.map((item) => item.run_id === run.run_id ? run : item)
            : [run, ...state.runs],
        }));
      }
      return run || null;
    } catch (cause: any) {
      set({ error: errorMessage(cause) });
      return null;
    }
  },

  createRun: async (projectId, data) => {
    set({ error: null });
    try {
      const response = await api.createWorkspaceGenerationRun(projectId, data);
      const run = response.data;
      if (run) {
        set((state) => ({
          runs: [run, ...state.runs.filter((item) => item.run_id !== run.run_id)],
        }));
      }
      return run || null;
    } catch (cause: any) {
      set({ error: errorMessage(cause) });
      return null;
    }
  },

  controlRun: async (projectId, runId, action) => {
    try {
      const response = await api.controlWorkspaceGenerationRun(projectId, runId, action);
      const run = response.data;
      if (run) {
        set((state) => ({
          runs: state.runs.map((item) => item.run_id === run.run_id ? run : item),
        }));
      }
    } catch (cause: any) {
      set({ error: errorMessage(cause) });
    }
  },

  publishRun: async (projectId, runId) => {
    set({ error: null });
    try {
      const response = await api.publishWorkspaceGenerationRun(projectId, runId);
      const run = response.data;
      if (run) {
        set((state) => ({
          runs: state.runs.map((item) => item.run_id === run.run_id ? run : item),
        }));
      }
      return run || null;
    } catch (cause: any) {
      set({ error: errorMessage(cause) });
      return null;
    }
  },

  optimizeRun: async (projectId, runId, data) => {
    set({ error: null });
    try {
      const response = await api.optimizeWorkspaceGenerationRun(projectId, runId, data);
      const run = response.data;
      if (run) {
        set((state) => ({
          runs: [run, ...state.runs.filter((item) => item.run_id !== run.run_id)],
        }));
      }
      return run || null;
    } catch (cause: any) {
      set({ error: errorMessage(cause) });
      return null;
    }
  },

  clear: () => set({ runs: [], loading: false, error: null }),
}));
