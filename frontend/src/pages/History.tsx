import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trash2, LayoutDashboard, FileText, RefreshCw, CheckCircle, Clock3, Layers3, Plus, Search } from 'lucide-react';
import { getStaticAssetUrl } from '@/api/client';
import { AppTopNav, Button, Loading, Pagination, useToast, useConfirm } from '@/components/shared';
import { ProjectCard } from '@/components/history/ProjectCard';
import { useProjectStore } from '@/store/useProjectStore';
import { useT } from '@/hooks/useT';
import * as api from '@/api/endpoints';
import { getFirstPageImage, getProjectTitle, getProjectRoute } from '@/utils/projectUtils';
import type { Project, ProjectDashboardStats } from '@/types';
import { useExportTasksStore } from '@/store/useExportTasksStore';
import { catalogPageKeyOf, useProjectCatalogStore } from '@/store/useProjectCatalogStore';

// 页面特有翻译 - AI 可以直接看到所有文案
const historyI18n = {
  zh: {
    home: { title: 'EasySlide', actions: { createProject: '创建新项目' } },
    nav: { home: '首页', createProject: '创建项目', history: '我的项目', materialCenter: '素材中心', materialGenerate: '素材生成', settings: '设置' },
    settings: { language: { label: '界面语言' }, theme: { light: '浅色', dark: '深色' } },
    history: {
      title: '我的项目',
      subtitle: '统一查看与管理当前账户下的项目内容。',
      heroTitle: '从想法到成稿',
      heroEmphasis: '让每一页，都值得上场',
      heroDescription: '让 AI 协助完成从构思到成稿的每一步，组织内容结构、视觉叙事与整套演示。你只需要专注于真正想表达的事。',
      importFile: '导入文件',
      searchPlaceholder: '搜索项目或灵感...',
      noSearchResults: '没有找到匹配的项目',
      listTitle: '项目列表',
      listSubtitle: '支持项目编辑、重命名、删除及批量管理。',
      refresh: '刷新',
      totalCount: '项目总数',
      completed: '已完成',
      inProgress: '进行中',
      generating: '生成中',
      pageSummary: '共 {{total}} 项，第 {{current}} / {{totalPages}} 页',
      noProjects: '暂无项目',
      createFirst: '创建你的第一个项目开始使用吧',
      selectedCount: '已选择 {{count}} 项',
      cancelSelect: '取消选择',
      batchDelete: '批量删除',
      confirmDelete: '确定要删除本项目吗？',
      confirmBatchDelete: '确定要删除选中的 {{count}} 个项目吗？此操作不可恢复。',
      deleteTitle: '确认删除',
      batchDeleteTitle: '确认批量删除',
      deleteSuccess: '成功删除 {{count}} 个项目',
      deletePartial: '成功删除 {{success}} 个项目，{{fail}} 个删除失败',
      deleteCurrentProject: '已删除项目，包括当前打开的项目',
      deleteFailed: '删除项目失败',
      openFailed: '打开项目失败',
      loadFailed: '加载项目失败',
      perPage: '条/页',
      titleEmpty: '项目名称不能为空',
      titleUpdated: '项目名称已更新',
      titleUpdateFailed: '更新项目名称失败',
    },
  },
  en: {
    home: { title: 'EasySlide', actions: { createProject: 'Create Project' } },
    nav: { home: 'Home', createProject: 'Create Project', history: 'My Projects', materialCenter: 'Material Center', materialGenerate: 'Material Generation', settings: 'Settings' },
    settings: { language: { label: 'Interface Language' }, theme: { light: 'Light', dark: 'Dark' } },
    history: {
      title: 'My Projects',
      subtitle: 'View and manage projects under the current account.',
      heroTitle: 'From idea to final deck',
      heroEmphasis: 'Make every slide worth presenting',
      heroDescription: 'Turn one idea into a complete visual story with AI, from structure and narrative to a presentation-ready deck.',
      importFile: 'Import File',
      searchPlaceholder: 'Search projects or ideas...',
      noSearchResults: 'No matching projects found',
      listTitle: 'Project List',
      listSubtitle: 'Supports editing, renaming, deleting, and batch management.',
      refresh: 'Refresh',
      totalCount: 'Total Projects',
      completed: 'Completed',
      inProgress: 'In Progress',
      generating: 'Generating',
      pageSummary: '{{total}} projects, page {{current}} / {{totalPages}}',
      noProjects: 'No projects yet',
      createFirst: 'Create your first project to get started',
      selectedCount: '{{count}} selected',
      cancelSelect: 'Cancel Selection',
      batchDelete: 'Batch Delete',
      confirmDelete: 'Are you sure you want to delete this project?',
      confirmBatchDelete: 'Are you sure you want to delete {{count}} selected project(s)? This action cannot be undone.',
      deleteTitle: 'Confirm Delete',
      batchDeleteTitle: 'Confirm Batch Delete',
      deleteSuccess: 'Successfully deleted {{count}} project(s)',
      deletePartial: 'Deleted {{success}} project(s), {{fail}} failed',
      deleteCurrentProject: 'Deleted projects including the currently open one',
      deleteFailed: 'Failed to delete project',
      openFailed: 'Failed to open project',
      loadFailed: 'Failed to load projects',
      perPage: '/ page',
      titleEmpty: 'Project name cannot be empty',
      titleUpdated: 'Project name updated',
      titleUpdateFailed: 'Failed to update project name',
    },
  },
};

const PAGE_SIZE_OPTIONS = [4, 8, 16];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const PAGE_SIZE_KEY = 'history_page_size';

export const History: React.FC<{ showNavigation?: boolean }> = ({ showNavigation = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(historyI18n); // 组件内翻译 + 自动 fallback 到全局
  const { syncProject, setCurrentProject } = useProjectStore();
  const { addTask, pollTask } = useExportTasksStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [projectStats, setProjectStats] = useState<ProjectDashboardStats | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'completed' | 'generating' | 'in_progress' | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState<'ppt' | 'video' | 'podcast' | null>(null);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const totalPages = Math.ceil(totalProjects / pageSize);
  const safeTotalPages = Math.max(totalPages, 1);
  const pptStage = (project: Project) => project.workspaces?.find((workspace) => workspace.kind === 'ppt')?.stage;
  const completedCount = projectStats?.completed ?? projects.filter((project) =>
    pptStage(project) === 'COMPLETED' ||
    Boolean(project.pages?.length) && project.pages!.every((page) => page.status === 'COMPLETED' || page.generated_image_path || page.generated_image_url)
  ).length;
  const generatingCount = projectStats?.generating ?? projects.filter((project) =>
    pptStage(project) === 'GENERATING_DESCRIPTIONS' || pptStage(project) === 'GENERATING_IMAGES' || project.pages?.some((page) =>
      page.status === 'GENERATING_DESCRIPTION' || page.status === 'GENERATING' || page.status === 'QUEUED'
    )
  ).length;
  const inProgressCount = projectStats?.in_progress ?? Math.max(totalProjects - completedCount - generatingCount, 0);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleProjects = normalizedSearchQuery
    ? projects.filter((project) => getProjectTitle(project).toLocaleLowerCase().includes(normalizedSearchQuery))
    : projects;
  const isHomeRoute = location.pathname === '/home' || location.pathname === '/';
  const projectInspirationImages = projects.flatMap((project) => {
    const src = getFirstPageImage(project);
    return src ? [{ src, alt: `${getProjectTitle(project)} 项目预览` }] : [];
  }).slice(0, 3);
  const inspirationImages = [
    ...projectInspirationImages,
    ...['theme01', 'theme07', 'theme11']
      .slice(0, 3 - projectInspirationImages.length)
      .map((theme, index) => ({
        src: getStaticAssetUrl(`/assets/native-theme-previews/${theme}.webp`),
        alt: `精选模板 ${projectInspirationImages.length + index + 1}`,
      })),
  ];

  const loadProjects = useCallback(async (page: number, force = false) => {
    setIsLoading(true);
    try {
      const snapshot = await useProjectCatalogStore.getState().loadCatalog({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        status: statusFilter,
        workspace: workspaceFilter,
      }, { force });
      setProjects(snapshot.projects);
      setTotalProjects(snapshot.total);
      setProjectStats(snapshot.stats);
      setError(null);
    } catch (err: any) {
      console.error('加载项目失败:', err);
      // 失败保留已有内容（快照），只显示非阻塞错误与重试
      setError(err.message || t('history.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, statusFilter, workspaceFilter]);

  const catalogPageKey = useMemo(() => ({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    status: statusFilter,
    workspace: workspaceFilter,
  }), [pageSize, currentPage, statusFilter, workspaceFilter]);
  const catalogSnapshot = useProjectCatalogStore((state) => state.snapshots[catalogPageKeyOf(catalogPageKey)]);

  useEffect(() => {
    // 有最近成功快照：立即展示作品墙，后台再校准（计划 §7.5.3）
    const snapshot = useProjectCatalogStore.getState().getSnapshot(catalogPageKey);
    if (snapshot) {
      setProjects(snapshot.projects);
      setTotalProjects(snapshot.total);
      setProjectStats(snapshot.stats);
      setIsLoading(false);
    }
  }, [catalogPageKey]);

  useEffect(() => {
    if (!catalogSnapshot) return;
    setProjects(catalogSnapshot.projects);
    setTotalProjects(catalogSnapshot.total);
    setProjectStats(catalogSnapshot.stats);
    setError(null);
  }, [catalogSnapshot]);

  useEffect(() => {
    loadProjects(currentPage);
  }, [currentPage, pageSize, statusFilter, workspaceFilter]);

  useEffect(() => {
    // 窗口重新获得焦点只在上次校准超过 30 秒时刷新
    const onFocus = () => {
      useProjectCatalogStore.getState().refreshOnFocus(catalogPageKey);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [catalogPageKey]);

  const handleWorkspaceFilter = useCallback((value: 'ppt' | 'video' | 'podcast') => {
    setWorkspaceFilter((current) => current === value ? null : value);
    setCurrentPage(1);
    setSelectedProjects(new Set());
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setSelectedProjects(new Set());
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
    setPageSize(size);
    setCurrentPage(1);
    setSelectedProjects(new Set());
  }, []);

  const handleStatusFilter = useCallback((value: 'completed' | 'generating' | 'in_progress') => {
    setStatusFilter((current) => current === value ? null : value);
    setCurrentPage(1);
    setSelectedProjects(new Set());
  }, []);

  // ===== 项目选择与导航 =====

  const handleSelectProject = useCallback(async (project: Project) => {
    const projectId = project.id || project.project_id;
    if (!projectId) return;

    // 如果正在批量选择模式，不跳转
    if (selectedProjects.size > 0) {
      return;
    }

    // 如果正在编辑该项目，不跳转
    if (editingProjectId === projectId) {
      return;
    }

    try {
      // 设置当前项目
      setCurrentProject(project);
      localStorage.setItem('currentProjectId', projectId);
      
      // 同步项目数据
      const syncedProject = await syncProject(projectId);
      
      // 根据项目状态跳转到不同页面
      const route = getProjectRoute(syncedProject
        ? { ...project, ...syncedProject, dashboard_status: syncedProject.dashboard_status ?? project.dashboard_status }
        : project);
      navigate(route, { state: { from: 'history' } });
    } catch (err: any) {
      console.error('打开项目失败:', err);
      show({
        message: t('history.openFailed') + ': ' + (err.message || t('common.unknownError')),
        type: 'error'
      });
    }
   
  }, [selectedProjects, editingProjectId, setCurrentProject, syncProject, navigate, show]);

  // ===== 批量选择操作 =====

  const handleToggleSelect = useCallback((projectId: string) => {
    setSelectedProjects(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(projectId)) {
        newSelected.delete(projectId);
      } else {
        newSelected.add(projectId);
      }
      return newSelected;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedProjects(prev => {
      if (prev.size === projects.length) {
        return new Set();
      } else {
        const allIds = projects.map(p => p.id || p.project_id).filter(Boolean) as string[];
        return new Set(allIds);
      }
    });
  }, [projects]);

  // ===== 删除操作 =====

  const deleteProjects = useCallback(async (projectIds: string[]) => {
    setIsDeleting(true);
    const currentProjectId = localStorage.getItem('currentProjectId');
    let deletedCurrentProject = false;

    try {
      // 批量删除 - 使用 allSettled 处理部分失败
      const results = await Promise.allSettled(
        projectIds.map(projectId => api.deleteProject(projectId))
      );

      const successIds = projectIds.filter((_, i) => results[i].status === 'fulfilled');
      const failCount = results.filter(r => r.status === 'rejected').length;

      // 检查是否删除了当前项目
      if (currentProjectId && successIds.includes(currentProjectId)) {
        localStorage.removeItem('currentProjectId');
        setCurrentProject(null);
        deletedCurrentProject = true;
      }

      // 目录摘要失效，下次读取强制刷新
      useProjectCatalogStore.getState().invalidate(catalogPageKey);

      // 清空选择
      setSelectedProjects(new Set());

      // Reload current page; if all items on this page were deleted, go back one page
      if (successIds.length > 0) {
        const remainingOnPage = projects.length - successIds.length;
        const newPage = remainingOnPage <= 0 && currentPage > 1 ? currentPage - 1 : currentPage;
        if (newPage !== currentPage) {
          // setCurrentPage triggers the useEffect which calls loadProjects
          setCurrentPage(newPage);
        } else {
          await loadProjects(newPage);
        }
      }

      if (failCount > 0 && successIds.length > 0) {
        show({
          message: t('history.deletePartial', { success: successIds.length, fail: failCount }),
          type: 'warning'
        });
      } else if (deletedCurrentProject) {
        show({
          message: t('history.deleteCurrentProject'),
          type: 'info'
        });
      } else if (successIds.length > 0) {
        show({
          message: t('history.deleteSuccess', { count: successIds.length }),
          type: 'success'
        });
      } else {
        show({
          message: t('history.deleteFailed'),
          type: 'error'
        });
      }
    } catch (err: any) {
      console.error('删除项目失败:', err);
      show({
        message: t('history.deleteFailed') + ': ' + (err.message || t('common.unknownError')),
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
    }
  }, [setCurrentProject, show, projects, currentPage, loadProjects]);

  const handleDeleteProject = useCallback(async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    
    const projectId = project.id || project.project_id;
    if (!projectId) return;

    const projectTitle = getProjectTitle(project);
    confirm(
      t('history.confirmDelete', { title: projectTitle }),
      async () => {
        await deleteProjects([projectId]);
      },
      { title: t('history.deleteTitle'), variant: 'danger' }
    );
   
  }, [confirm, deleteProjects]);

  const handleExportProject = useCallback(async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    const projectId = project.id || project.project_id;
    if (!projectId) return;

    const workspace = project.workspaces?.find((item) => item.kind === project.last_workspace && item.state !== 'uninitialized')
      || project.workspaces?.find((item) => item.state !== 'uninitialized');
    const kind = workspace?.kind || 'ppt';
    const taskKey = `project-export-${projectId}-${Date.now()}`;

    try {
      if (kind === 'video') {
        const response = await api.exportVideoWorkspace(projectId, { renderProfile: 'proof' });
        const taskId = response.data?.task_id;
        if (!taskId) throw new Error('视频导出任务创建失败');
        addTask({
          id: taskKey,
          taskId,
          projectId,
          type: 'video',
          status: 'PENDING',
          progress: { total: 100, completed: 0, percent: 0, current_step: '等待生成预览', render_profile: 'proof' },
        });
        void pollTask(taskKey, projectId, taskId);
      } else if (kind === 'podcast') {
        const response = await api.exportPodcastWorkspace(projectId, { format: 'mp3' });
        const taskId = response.data?.task_id;
        if (!taskId) throw new Error('播客导出任务创建失败');
        addTask({
          id: taskKey,
          taskId,
          projectId,
          type: 'podcast',
          status: 'PENDING',
          progress: { total: 100, completed: 0, percent: 0, current_step: '等待播客渲染', format: 'mp3' },
        });
        void pollTask(taskKey, projectId, taskId);
      } else if (project.render_mode === 'native' || workspace?.settings?.render_mode === 'native') {
        const response = await api.createNativePptxExport(projectId, 'pptx');
        const taskId = response.data?.task_id;
        if (!taskId) throw new Error('原生 PPTX 导出任务创建失败');
        addTask({ id: taskKey, taskId, projectId, type: 'native-pptx', status: 'PENDING' });
        void pollTask(taskKey, projectId, taskId);
      } else {
        const response = await api.exportPPTX(projectId);
        const downloadUrl = response.data?.download_url || response.data?.download_url_absolute;
        if (!downloadUrl) throw new Error('PPTX 导出未返回下载地址');
        addTask({
          id: taskKey,
          taskId: '',
          projectId,
          type: 'pptx',
          status: 'COMPLETED',
          downloadUrl,
          filename: response.data?.filename,
        });
      }
      show({ message: '导出任务已提交，请在任务中心查看进度', type: 'success', duration: 2000 });
    } catch (cause: any) {
      const message = cause?.response?.data?.error?.message || cause?.response?.data?.message || cause?.message || '导出失败';
      const failedTaskType = kind === 'video'
        ? 'video'
        : kind === 'podcast'
          ? 'podcast'
          : project.render_mode === 'native' || workspace?.settings?.render_mode === 'native'
            ? 'native-pptx'
            : 'pptx';
      addTask({ id: taskKey, taskId: '', projectId, type: failedTaskType, status: 'FAILED', errorMessage: message });
      show({ message, type: 'error' });
    }
  }, [addTask, pollTask, show]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedProjects.size === 0) return;

    const count = selectedProjects.size;
    confirm(
      t('history.confirmBatchDelete', { count }),
      async () => {
        const projectIds = Array.from(selectedProjects);
        await deleteProjects(projectIds);
      },
      { title: t('history.batchDeleteTitle'), variant: 'danger' }
    );
  }, [selectedProjects, confirm, deleteProjects, t]);

  // ===== 编辑操作 =====

  const handleStartEdit = useCallback((e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    
    // 如果正在批量选择模式，不允许编辑
    if (selectedProjects.size > 0) {
      return;
    }
    
    const projectId = project.id || project.project_id;
    if (!projectId) return;
    
    const currentTitle = getProjectTitle(project);
    setEditingProjectId(projectId);
    setEditingTitle(currentTitle);
  }, [selectedProjects]);

  const handleCancelEdit = useCallback(() => {
    setEditingProjectId(null);
    setEditingTitle('');
  }, []);

  const handleSaveEdit = useCallback(async (projectId: string) => {
    const nextTitle = editingTitle.trim();

    if (!nextTitle) {
      show({ message: t('history.titleEmpty'), type: 'error' });
      return;
    }

    try {
      const targetProject = projects.find((p) => (p.id || p.project_id) === projectId);
      if (!targetProject) return;
      await api.updateProject(projectId, { project_title: nextTitle });
      useProjectCatalogStore.getState().invalidate(catalogPageKey);

      // 更新本地状态
      setProjects(prev => prev.map(p => {
        const id = p.id || p.project_id;
        if (id === projectId) {
          return {
            ...p,
            project_title: nextTitle,
          };
        }
        return p;
      }));

      setEditingProjectId(null);
      setEditingTitle('');
      show({ message: t('history.titleUpdated'), type: 'success' });
    } catch (err: any) {
      console.error('更新项目名称失败:', err);
      show({
        message: t('history.titleUpdateFailed') + ': ' + (err.message || t('common.unknownError')),
        type: 'error'
      });
    }
   
  }, [editingTitle, projects, show, t]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent, projectId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(projectId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  return (
    <div className="min-h-screen bg-[var(--app-background)] text-[var(--app-text)] lg:pl-[var(--app-nav-offset,216px)]">
      {showNavigation && <AppTopNav />}

      <main className={isHomeRoute ? 'min-h-[calc(100vh-2.5rem)]' : undefined}>
        {isHomeRoute && (
        <section className="px-4 pt-4 md:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 shadow-[var(--app-shadow-control)] xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--app-text-tertiary)]">本地创作工作台 · 最近项目</p>
              <h1 className="mt-0.5 text-lg font-semibold">作品工作台</h1>
              <p className="mt-0.5 text-xs text-[var(--app-text-secondary)]">PPT、视频与播客统一创作，内容保存在本机。</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row xl:max-w-[620px]">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-background)] px-3 text-[var(--app-text-tertiary)] focus-within:border-[var(--app-accent)]">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">{t('history.searchPlaceholder')}</span>
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('history.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--app-text)] outline-none" />
              </label>
              <Button icon={<Plus size={16} />} onClick={() => navigate('/create')}>{t('home.actions.createProject')}</Button>
            </div>
          </div>
        </section>
        )}

        <div className={`mx-auto px-4 md:px-6 ${isHomeRoute ? 'max-w-[1600px] py-4' : 'max-w-7xl py-6 md:py-7'}`}>
          {!isHomeRoute && (
            <section className="mb-7 grid gap-6 border-b border-[var(--app-border)] pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)] lg:items-stretch">
              <header className="flex min-h-40 flex-col items-start justify-between gap-6 py-1">
                <div>
                  <h1 className="text-xl font-semibold leading-7">{t('history.title')}</h1>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--app-text-secondary)]">{t('history.subtitle')}</p>
                </div>
                <Button variant="primary" size="sm" icon={<LayoutDashboard size={16} />} onClick={() => navigate('/create')}>
                  {t('home.actions.createProject')}
                </Button>
              </header>
              <div aria-label="项目统计" className="grid grid-cols-2 overflow-hidden rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)]">
                {[
                  { label: t('history.totalCount'), value: totalProjects, icon: FileText, tone: 'var(--app-accent-blue)', bg: 'var(--app-accent-blue-soft)' },
                  { label: t('history.completed'), value: completedCount, icon: CheckCircle, tone: 'var(--app-success)', bg: 'rgba(36, 138, 61, 0.14)' },
                  { label: t('history.inProgress'), value: inProgressCount, icon: Layers3, tone: 'var(--app-accent-violet)', bg: 'var(--app-accent-violet-soft)' },
                  { label: t('history.generating'), value: generatingCount, icon: Clock3, tone: 'var(--app-accent-coral)', bg: 'var(--app-accent-coral-soft)' },
                ].map((item, index) => {
                  const Icon = item.icon;
                  const filter = index === 1 ? 'completed' : index === 2 ? 'in_progress' : index === 3 ? 'generating' : null;
                  return (
                    <button key={item.label} type="button" disabled={!filter} onClick={() => filter && handleStatusFilter(filter)} aria-pressed={filter ? statusFilter === filter : undefined} className={`flex min-w-0 items-center gap-3 px-4 py-4 text-left transition-colors ${index % 2 === 0 ? 'border-r border-[var(--app-border)]' : ''} ${index < 2 ? 'border-b border-[var(--app-border)]' : ''} ${filter ? 'cursor-pointer hover:bg-[var(--app-surface-hover)]' : 'cursor-default'} ${filter && statusFilter === filter ? 'bg-[var(--app-surface-hover)]' : ''}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)]" style={{ background: item.bg, color: item.tone }}><Icon size={17} aria-hidden="true" /></span>
                      <div className="min-w-0"><div className="truncate text-xs text-[var(--app-text-secondary)]">{item.label}</div><div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: item.tone }}>{item.value}</div></div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loading message={t('common.loading')} />
          </div>
        ) : projects.length === 0 && error ? (
          // 无快照且加载失败：显示错误与重试（计划 §7.5.3 非阻塞）
          <section className="border-y border-[var(--app-border)] py-10 text-center">
            <p className="mb-4 text-sm text-[var(--app-text-secondary)]">{error}</p>
            <Button variant="primary" onClick={() => loadProjects(currentPage, true)}>
              {t('common.retry')}
            </Button>
          </section>
        ) : projects.length === 0 ? (
          <section className="rounded-[var(--app-radius-card)] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] px-6 py-12 text-center">
            <h2 className="mb-2 text-[15px] font-semibold leading-[22px]">
              {t('history.noProjects')}
            </h2>
            <p className="mb-5 text-sm text-[var(--app-text-secondary)]">
              {t('history.createFirst')}
            </p>
            <Button size="sm" onClick={() => navigate('/create')}>{t('home.actions.createProject')}</Button>
          </section>
        ) : (
          <section aria-labelledby="project-list-title">
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-warning-soft)] bg-[var(--app-warning-soft)] px-3 py-2 text-xs text-[var(--app-warning)]">
                <span className="min-w-0 flex-1 truncate">{error}</span>
                <Button variant="secondary" size="sm" onClick={() => loadProjects(currentPage, true)}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="project-list-title" className="text-[15px] font-semibold leading-[22px]">{t('history.listTitle')}</h2>
                <p className="mt-0.5 text-xs text-[var(--app-text-secondary)]">{t('history.listSubtitle')}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={16} />}
                onClick={() => loadProjects(currentPage, true)}
              >
                {t('history.refresh')}
              </Button>
            </div>

            <div className="mb-3 flex min-h-10 flex-wrap items-center gap-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 shadow-[var(--app-shadow-control)]">
              <div className="flex items-center gap-1" role="group" aria-label="项目类型筛选">
                {([['ppt', 'PPT'], ['video', '视频'], ['podcast', '播客']] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={workspaceFilter === value} onClick={() => handleWorkspaceFilter(value)} className={`h-8 rounded-[var(--app-radius-control)] px-3 text-xs font-medium transition-colors ${workspaceFilter === value ? 'bg-[var(--app-text)] text-[var(--app-surface)]' : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'}`}>{label}</button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={selectedProjects.size === projects.length ? t('common.deselectAll') : t('common.selectAll')}
                  checked={selectedProjects.size === projects.length && projects.length > 0}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-[var(--app-border-strong)] accent-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                />
                <span className="text-sm text-[var(--app-text-secondary)]">
                  {selectedProjects.size === projects.length ? t('common.deselectAll') : t('common.selectAll')}
                </span>
              </label>

              {selectedProjects.size > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--app-text-secondary)]">
                    {t('history.selectedCount', { count: selectedProjects.size })}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedProjects(new Set())} disabled={isDeleting}>
                    {t('history.cancelSelect')}
                  </Button>
                  <Button variant="secondary" size="sm" icon={<Trash2 size={16} />} onClick={handleBatchDelete} disabled={isDeleting} loading={isDeleting}>
                    {t('history.batchDelete')}
                  </Button>
                </div>
              )}
            </div>

            <div data-testid={isHomeRoute ? 'project-grid' : 'project-list'} className={isHomeRoute ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-2'}>
              {visibleProjects.map((project) => {
                const projectId = project.id || project.project_id;
                if (!projectId) return null;

                return (
                  <ProjectCard
                    key={projectId}
                    data-rise
                    riseDelay={visibleProjects.indexOf(project) * 40}
                    project={project}
                    isSelected={selectedProjects.has(projectId)}
                    isEditing={editingProjectId === projectId}
                    editingTitle={editingTitle}
                    onSelect={handleSelectProject}
                    onToggleSelect={handleToggleSelect}
                    onDelete={handleDeleteProject}
                    onExport={handleExportProject}
                    onStartEdit={handleStartEdit}
                    onTitleChange={setEditingTitle}
                    onTitleKeyDown={handleTitleKeyDown}
                    onSaveEdit={handleSaveEdit}
                    isBatchMode={selectedProjects.size > 0}
                    layout={isHomeRoute ? 'grid' : 'list'}
                  />
                );
              })}
            </div>
            {isHomeRoute && visibleProjects.length === 0 && (
              <div className="py-10 text-center text-sm text-[var(--app-text-secondary)]">{t('history.noSearchResults')}</div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-[var(--app-border)] pt-4 text-sm text-[var(--app-text-secondary)] sm:flex-row sm:items-center sm:justify-between">
              <span>{t('history.pageSummary', { total: totalProjects, current: currentPage, totalPages: safeTotalPages })}</span>
              <Pagination
                currentPage={currentPage}
                totalPages={safeTotalPages}
                onPageChange={handlePageChange}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                pageSizeLabel={t('history.perPage')}
              />
            </div>
          </section>
        )}
        {isHomeRoute && (
          <section aria-labelledby="inspiration-title" className="mt-5 border-t border-[var(--app-border)] pt-4">
            <div className="mb-3">
              <h2 id="inspiration-title" className="text-[15px] font-semibold">灵感墙</h2>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">精选模板与视觉素材，保持少量、可用、不过度装饰。</p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {inspirationImages.map((image, index) => (
                <div key={`${image.src}-${index}`} className="group overflow-hidden rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)]">
                  <img src={image.src} alt={image.alt} className="aspect-[3/1] w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}
        </div>
      </main>
      <ToastContainer />
      {ConfirmDialog}
    </div>
  );
};
