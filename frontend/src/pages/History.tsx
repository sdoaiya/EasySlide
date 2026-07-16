import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home as HomeIcon, Trash2, Sun, Moon, LayoutDashboard, FolderOpen, ImagePlus, Settings, FileText, RefreshCw, CheckCircle, Clock3, Layers3 } from 'lucide-react';
import { Button, Loading, Card, Pagination, useToast, useConfirm, MaterialGeneratorModal, MaterialCenterModal } from '@/components/shared';
import { ProjectCard } from '@/components/history/ProjectCard';
import { useProjectStore } from '@/store/useProjectStore';
import { useTheme } from '@/hooks/useTheme';
import { useT } from '@/hooks/useT';
import * as api from '@/api/endpoints';
import { getStaticAssetUrl } from '@/api/client';
import { normalizeProject } from '@/utils';
import { getProjectTitle, getProjectRoute } from '@/utils/projectUtils';
import type { Project, ProjectDashboardStats } from '@/types';

// 页面特有翻译 - AI 可以直接看到所有文案
const historyI18n = {
  zh: {
    home: { title: 'EasySlide', actions: { createProject: '创建新项目' } },
    nav: { home: '主页', createProject: '创建项目', history: '我的项目', materialCenter: '素材中心', materialGenerate: '素材生成', settings: '设置' },
    settings: { language: { label: '界面语言' }, theme: { light: '浅色', dark: '深色' } },
    history: {
      title: '我的项目',
      subtitle: '统一查看与管理当前账户下的项目内容。',
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

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_KEY = 'history_page_size';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const t = useT(historyI18n); // 组件内翻译 + 自动 fallback 到全局
  const { isDark, setTheme } = useTheme();
  const { syncProject, setCurrentProject } = useProjectStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [projectStats, setProjectStats] = useState<ProjectDashboardStats | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    return saved ? Number(saved) : DEFAULT_PAGE_SIZE;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isMaterialCenterOpen, setIsMaterialCenterOpen] = useState(false);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const totalPages = Math.ceil(totalProjects / pageSize);
  const safeTotalPages = Math.max(totalPages, 1);
  const completedCount = projectStats?.completed ?? projects.filter((project) =>
    project.status === 'COMPLETED' ||
    Boolean(project.pages?.length) && project.pages!.every((page) => page.status === 'COMPLETED' || page.generated_image_path || page.generated_image_url)
  ).length;
  const generatingCount = projectStats?.generating ?? projects.filter((project) =>
    project.status === 'GENERATING_DESCRIPTIONS' || project.status === 'GENERATING_IMAGES' || project.pages?.some((page) =>
      page.status === 'GENERATING_DESCRIPTION' || page.status === 'GENERATING' || page.status === 'QUEUED'
    )
  ).length;
  const inProgressCount = projectStats?.in_progress ?? Math.max(totalProjects - completedCount - generatingCount, 0);

  const loadProjects = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;
      const response = await api.listProjects(pageSize, offset);
      if (response.data?.projects) {
        const normalizedProjects = response.data.projects.map(normalizeProject);
        setProjects(normalizedProjects);
        setTotalProjects(response.data.total ?? 0);
        setProjectStats(response.data.stats ?? null);
      }
    } catch (err: any) {
      console.error('加载项目失败:', err);
      setError(err.message || t('history.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    loadProjects(currentPage);
  }, [currentPage, pageSize]);

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
      const route = getProjectRoute(syncedProject || project);
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
    <div className="min-h-screen bg-[#f5f9fc] dark:bg-background-primary relative overflow-hidden">
      {/* 导航栏 */}
      <nav aria-label="工作台导航" className="relative z-50 h-16 md:h-18 bg-white/40 dark:bg-background-primary backdrop-blur-2xl dark:backdrop-blur-none dark:border-b dark:border-border-primary">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center">
            <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="h-12 md:h-14 w-auto rounded-lg object-contain" />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button variant="ghost" size="sm" icon={<HomeIcon size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => navigate('/')} className="text-xs md:text-sm hover:bg-sky-50 hover:text-cyan-700 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium">
              <span className="hidden md:inline">{t('nav.home')}</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<LayoutDashboard size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => navigate('/create')} className="text-xs md:text-sm hover:bg-sky-50 hover:text-cyan-700 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium">
              <span className="hidden md:inline">{t('nav.createProject')}</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<FileText size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => navigate('/history')} className="text-xs md:text-sm bg-sky-50 text-cyan-700 shadow-sm transition-all duration-200 font-medium">
              <span>{t('nav.history')}</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<FolderOpen size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => setIsMaterialCenterOpen(true)} className="text-xs md:text-sm hover:bg-sky-50 hover:text-cyan-700 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium">
              <span className="hidden md:inline">{t('nav.materialCenter')}</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => setIsMaterialModalOpen(true)} className="text-xs md:text-sm hover:bg-sky-50 hover:text-cyan-700 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium">
              <span className="hidden md:inline">{t('nav.materialGenerate')}</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />} onClick={() => navigate('/settings')} className="text-xs md:text-sm hover:bg-sky-50 hover:text-cyan-700 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium">
              <span className="hidden md:inline">{t('nav.settings')}</span>
            </Button>
            <div className="h-5 w-px bg-gray-300 dark:bg-border-primary mx-1" />
            <button onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')} className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-foreground-tertiary hover:text-cyan-700 dark:hover:text-gray-100 hover:bg-sky-50 dark:hover:bg-background-hover rounded-md transition-all" title={t('settings.language.label')}>
              {i18n.language?.startsWith('zh') ? 'EN' : '中'}
            </button>
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-1.5 text-slate-600 dark:text-foreground-tertiary hover:text-cyan-700 dark:hover:text-gray-100 hover:bg-sky-50 dark:hover:bg-background-hover rounded-md transition-all" title={isDark ? t('settings.theme.light') : t('settings.theme.dark')}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ??? */}
      <main className="relative max-w-7xl mx-auto px-3 md:px-6 py-10 md:py-16">
        <section className="mb-8 rounded-[32px] border border-white/80 bg-white/95 p-7 md:p-10 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-border-primary dark:bg-background-secondary dark:shadow-none">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-950 dark:text-foreground-primary mb-5">{t('history.title')}</h1>
              <p className="text-base md:text-lg font-medium text-slate-600 dark:text-foreground-tertiary mb-8">{t('history.subtitle')}</p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/create')}
                className="rounded-2xl bg-blue-600 px-7 shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:bg-blue-700"
              >
                {t('home.actions.createProject')}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: t('history.totalCount'), value: totalProjects, icon: FileText, tone: 'blue', active: true },
                { label: t('history.completed'), value: completedCount, icon: CheckCircle, tone: 'emerald' },
                { label: t('history.inProgress'), value: inProgressCount, icon: Layers3, tone: 'cyan' },
                { label: t('history.generating'), value: generatingCount, icon: Clock3, tone: 'orange' },
              ].map((item) => {
                const Icon = item.icon;
                const toneClass = item.tone === 'emerald'
                  ? 'text-emerald-600 bg-emerald-50 ring-emerald-100'
                  : item.tone === 'orange'
                    ? 'text-orange-500 bg-orange-50 ring-orange-100'
                    : item.tone === 'cyan'
                      ? 'text-cyan-600 bg-cyan-50 ring-cyan-100'
                      : 'text-blue-600 bg-blue-50 ring-blue-100';
                return (
                  <div
                    key={item.label}
                    className={`rounded-[24px] border bg-white/90 p-5 shadow-sm transition-all ${
                      item.active
                        ? 'border-sky-300 bg-sky-50/80 shadow-[0_18px_50px_rgba(56,189,248,0.16)]'
                        : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ring-8 ${toneClass}`}>
                        <Icon size={22} />
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-500">{item.label}</div>
                        <div className="mt-1 text-2xl font-extrabold text-slate-950">{item.value}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loading message={t('common.loading')} />
          </div>
        ) : error ? (
          <Card className="p-8 text-center shadow-[0_20px_60px_rgba(15,70,120,0.08)]">
            <p className="text-slate-600 dark:text-foreground-tertiary mb-4">{error}</p>
            <Button variant="primary" onClick={() => loadProjects(currentPage)}>
              {t('common.retry')}
            </Button>
          </Card>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center shadow-[0_20px_60px_rgba(15,70,120,0.08)]">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-foreground-secondary mb-2">
              {t('history.noProjects')}
            </h3>
            <p className="text-slate-500 dark:text-foreground-tertiary mb-6">
              {t('history.createFirst')}
            </p>
          </Card>
        ) : (
          <section className="rounded-[32px] border border-white/80 bg-white/95 p-5 md:p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-border-primary dark:bg-background-secondary dark:shadow-none">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-950 dark:text-foreground-primary">{t('history.listTitle')}</h2>
                <p className="mt-2 text-sm md:text-base text-slate-500 dark:text-foreground-tertiary">{t('history.listSubtitle')}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={16} />}
                onClick={() => loadProjects(currentPage)}
                className="rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-sky-50 hover:text-blue-700"
              >
                {t('history.refresh')}
              </Button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProjects.size === projects.length && projects.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-cyan-600 border-sky-200 dark:border-border-primary rounded focus:ring-cyan-500"
                />
                <span className="text-sm text-slate-700 dark:text-foreground-secondary">
                  {selectedProjects.size === projects.length ? t('common.deselectAll') : t('common.selectAll')}
                </span>
              </label>

              {selectedProjects.size > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 dark:text-foreground-tertiary">
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

            <div className="space-y-4">
              {projects.map((project) => {
                const projectId = project.id || project.project_id;
                if (!projectId) return null;

                return (
                  <ProjectCard
                    key={projectId}
                    project={project}
                    isSelected={selectedProjects.has(projectId)}
                    isEditing={editingProjectId === projectId}
                    editingTitle={editingTitle}
                    onSelect={handleSelectProject}
                    onToggleSelect={handleToggleSelect}
                    onDelete={handleDeleteProject}
                    onStartEdit={handleStartEdit}
                    onTitleChange={setEditingTitle}
                    onTitleKeyDown={handleTitleKeyDown}
                    onSaveEdit={handleSaveEdit}
                    isBatchMode={selectedProjects.size > 0}
                  />
                );
              })}
            </div>

            <div className="mt-7 flex flex-col gap-4 border-t border-slate-100 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>{t('history.pageSummary', { total: totalProjects, current: currentPage, totalPages: safeTotalPages })}</span>
              <Pagination
                currentPage={currentPage}
                totalPages={safeTotalPages}
                onPageChange={handlePageChange}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
                pageSizeLabel={t('history.perPage')}
              />
            </div>
          </section>
        )}
      </main>
      <ToastContainer />
      <MaterialGeneratorModal projectId={null} isOpen={isMaterialModalOpen} onClose={() => setIsMaterialModalOpen(false)} />
      <MaterialCenterModal isOpen={isMaterialCenterOpen} onClose={() => setIsMaterialCenterOpen(false)} />
      {ConfirmDialog}
    </div>
  );
};
