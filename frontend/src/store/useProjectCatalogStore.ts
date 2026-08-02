import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listProjects } from '@/api/endpoints';
import { normalizeProject } from '@/utils';
import type { Project, ProjectDashboardStats } from '@/types';

/**
 * 项目目录 store（计划 §7.5.3）：最近一次成功摘要快照 + stale-while-revalidate。
 *
 * - 快照按分页键（limit/offset/status/workspace）持久化，首屏直接渲染。
 * - 挂载/聚焦后后台校准；数据变化按 project_id + updated_at 合并。
 * - 请求去重：并发（StrictMode/路由切换/focus）复用同一个 Promise。
 * - 失败保留快照，不切换空页面。
 */

const CACHE_SCHEMA_VERSION = 3;  // 完成状态改为必须存在图片或原生内容页
const REFRESH_AFTER_MS = 30_000;

export interface CatalogPageKey {
  limit: number;
  offset: number;
  status?: 'completed' | 'generating' | 'in_progress' | null;
  workspace?: 'ppt' | 'video' | 'podcast' | null;
}

export interface ProjectCatalogSnapshot {
  projects: Project[];
  total: number;
  stats: ProjectDashboardStats | null;
  fetchedAt: number;
}

export const catalogPageKeyOf = (key: CatalogPageKey): string =>
  JSON.stringify([key.limit, key.offset, key.status ?? '', key.workspace ?? '']);

interface ProjectCatalogState {
  /** 持久化快照（按分页键） */
  snapshots: Record<string, ProjectCatalogSnapshot>;
  /** 每页键的在途请求 */
  inflight: Record<string, Promise<ProjectCatalogSnapshot> | null>;
  /** 每页键的上次校准时间 */
  lastFetchedAt: Record<string, number>;

  /** 从快照读取（无快照返回 null）；空快照返回空列表 + fetchedAt */
  getSnapshot: (key: CatalogPageKey) => ProjectCatalogSnapshot | null;
  /** SWR 加载：有快照直接返回快照并后台刷新；无快照返回 Promise */
  loadCatalog: (key: CatalogPageKey, opts?: { force?: boolean }) => Promise<ProjectCatalogSnapshot>;
  /** 变更后失效对应摘要（标题/删除/创建/状态变化），下次读取强制刷新 */
  invalidate: (pageKey?: CatalogPageKey) => void;
  /** 焦点刷新：超过 30 秒才真正刷新 */
  refreshOnFocus: (key: CatalogPageKey) => void;
}

const emptyStats = (): ProjectDashboardStats => ({ total: 0, completed: 0, generating: 0, in_progress: 0 });

const fetchPage = async (key: CatalogPageKey): Promise<ProjectCatalogSnapshot> => {
  const response = await listProjects(
    key.limit,
    key.offset,
    key.status || undefined,
    key.workspace || undefined,
  );
  const data = response.data;
  const projects = (data?.projects ?? []).map(normalizeProject);
  return {
    projects,
    total: data?.total ?? projects.length,
    stats: data?.stats ?? emptyStats(),
    fetchedAt: Date.now(),
  };
};

export const useProjectCatalogStore = create<ProjectCatalogState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      inflight: {},
      lastFetchedAt: {},

      getSnapshot: (key) => {
        const snapshot = get().snapshots[catalogPageKeyOf(key)];
        if (!snapshot) return null;
        return snapshot;
      },

      loadCatalog: async (key, opts) => {
        const pageKey = catalogPageKeyOf(key);
        const snapshot = get().snapshots[pageKey];
        const existing = get().inflight[pageKey];
        if (existing) {
          // 复用同一在途请求（StrictMode/路由切换/focus 去重）
          return existing;
        }
        const now = Date.now();
        const lastFetched = get().lastFetchedAt[pageKey] ?? 0;
        if (
          !opts?.force
          && snapshot
          && lastFetched > 0
          && now - lastFetched < REFRESH_AFTER_MS
        ) {
          return snapshot;
        }
        if (snapshot && now - lastFetched < 1_000) {
          // 1 秒内已校准过，避免 focus 重复请求
          return snapshot;
        }
        const promise = fetchPage(key).then((fresh) => {
          const current = get().snapshots[pageKey];
          if (!current || fresh.fetchedAt > (current.fetchedAt ?? 0)) {
            set({
              snapshots: {
                ...get().snapshots,
                [pageKey]: fresh,
              },
              lastFetchedAt: { ...get().lastFetchedAt, [pageKey]: fresh.fetchedAt },
            });
          }
          return fresh;
        }).finally(() => {
          set({ inflight: { ...get().inflight, [pageKey]: null } });
        });
        set({ inflight: { ...get().inflight, [pageKey]: promise } });
        return promise;
      },

      invalidate: (pageKey) => {
        if (!pageKey) {
          set({ lastFetchedAt: {} });
          return;
        }
        const key = catalogPageKeyOf(pageKey);
        set({ lastFetchedAt: { ...get().lastFetchedAt, [key]: 0 } });
      },

      refreshOnFocus: (key) => {
        const pageKey = catalogPageKeyOf(key);
        const snapshot = get().snapshots[pageKey];
        const now = Date.now();
        if (!snapshot) {
          void get().loadCatalog(key);
          return;
        }
        const lastFetched = get().lastFetchedAt[pageKey] ?? 0;
        if (!lastFetched || now - lastFetched >= REFRESH_AFTER_MS) {
          void get().loadCatalog(key, { force: true });
        }
      },
    }),
    {
      name: `project-catalog-v${CACHE_SCHEMA_VERSION}`,
      partialize: (state) => ({
        // 只持久化摘要快照与新鲜度时间戳（lastFetchedAt），不存 base64/正文/密钥/日志。
        // 刷新页面后仍可命中 30s 新鲜窗口，避免持久化快照的首屏渲染退化。
        snapshots: state.snapshots,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
