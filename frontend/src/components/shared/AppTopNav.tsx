import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ClipboardList, FileText, Film, FolderOpen, GitCompareArrows, Globe, Home, ImagePlus, LayoutDashboard, Mic2, Monitor, Moon, Presentation, Settings, Sun } from 'lucide-react';
import { getStaticAssetUrl } from '@/api/client';
import { useTheme } from '@/hooks/useTheme';
import { useT } from '@/hooks/useT';
import { Button } from './Button';
import { MaterialCenterModal } from './MaterialCenterModal';
import { MaterialGeneratorModal } from './MaterialGeneratorModal';
import { selectContentWorkspace, selectSpineSummary, useContentProjectStore } from '@/store/useContentProjectStore';

const topNavI18n = {
  zh: {
    nav: { home: '首页', createProject: '创建项目', history: '我的项目', tasks: '任务中心', materialCenter: '素材中心', materialGenerate: '素材生成', settings: '设置' },
    settings: { language: { label: '界面语言' }, theme: { label: '主题模式', light: '浅色', dark: '深色', system: '跟随系统' } },
    actions: { closeThemeMenu: '关闭主题菜单' },
  },
  en: {
    nav: { home: 'Home', createProject: 'Create Project', history: 'My Projects', tasks: 'Task Center', materialCenter: 'Material Center', materialGenerate: 'Material Generation', settings: 'Settings' },
    settings: { language: { label: 'Interface Language' }, theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' } },
    actions: { closeThemeMenu: 'Close theme menu' },
  },
};

export function AppTopNav() {
  const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const t = useT(topNavI18n);
  const { theme, isDark, setTheme } = useTheme();
  const contentProject = useContentProjectStore((state) => state.project);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isMaterialCenterOpen, setIsMaterialCenterOpen] = useState(false);
  const [isMaterialGeneratorOpen, setIsMaterialGeneratorOpen] = useState(false);

  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
  const projectId = projectMatch?.[1] || null;
  const isProjectRoute = Boolean(projectId);
  const project = contentProject?.project_id === projectId ? contentProject : null;
  const spineSummary = selectSpineSummary(project);
  const projectEntries = [
    { key: 'spine', label: '内容主线', icon: FileText, path: `/project/${projectId}/spine` },
    { key: 'ppt', label: 'PPT', icon: Presentation, path: `/project/${projectId}/ppt/outline` },
    { key: 'video', label: '视频', icon: Film, path: `/project/${projectId}/video` },
    { key: 'podcast', label: '播客', icon: Mic2, path: `/project/${projectId}/podcast` },
  ] as const;

  const items = [
    { path: '/home', label: t('nav.home'), icon: Home, action: () => navigate('/home') },
    { path: '/create', label: t('nav.createProject'), icon: LayoutDashboard, action: () => navigate('/create') },
    { path: '/history', label: t('nav.history'), icon: FileText, action: () => navigate('/history') },
    { path: '/tasks', label: t('nav.tasks'), icon: ClipboardList, action: () => navigate('/tasks') },
    { label: t('nav.materialCenter'), icon: FolderOpen, action: () => setIsMaterialCenterOpen(true) },
    { label: t('nav.materialGenerate'), icon: ImagePlus, action: () => setIsMaterialGeneratorOpen(true) },
  ];

  return (
    <>
      <nav
        role={isProjectRoute ? 'complementary' : 'navigation'}
        aria-label={isProjectRoute ? '项目工作区导航' : '工作台导航'}
        data-content-project-nav={isProjectRoute ? true : undefined}
        className={`sticky top-0 z-40 h-16 border-b border-[var(--app-border)] bg-[var(--app-surface)] lg:fixed lg:inset-y-0 lg:left-0 ${isDesktop ? 'lg:top-10 lg:h-[calc(100vh-40px)]' : 'lg:top-0 lg:h-screen'} lg:w-[216px] lg:border-b-0 lg:border-r lg:bg-[var(--app-surface-muted)]`}
      >
        <div className="relative z-[1] mx-auto flex h-full max-w-7xl items-center justify-between px-5 lg:mx-0 lg:max-w-none lg:flex-col lg:items-stretch lg:px-4 lg:py-5">
          <button autoFocus type="button" onClick={() => navigate('/home')} className="flex h-10 items-center overflow-hidden lg:h-14 lg:w-full lg:justify-center lg:px-2" aria-label="EasySlide">
            <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="w-[132px] max-w-none object-contain lg:w-[160px]" />
          </button>
          {isProjectRoute ? (
            <div className="mt-2 flex min-h-0 flex-1 flex-col">
              <button type="button" onClick={() => navigate('/home')} className="mb-4 flex h-10 w-full items-center gap-2 rounded-[var(--app-radius-control)] px-3 text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]">
                <ChevronDown size={16} className="rotate-90" aria-hidden="true" />
                <span>返回作品墙</span>
              </button>
              <div className="mb-3 px-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">Content Project</p>
                <p className="mt-1 truncate text-sm font-semibold">{spineSummary.topic || project?.project_title || '未命名项目'}</p>
              </div>
              <div className="space-y-1" aria-label="项目一级入口">
                {projectEntries.map(({ key, label, icon: Icon, path }) => {
                  const active = key === 'ppt'
                    ? location.pathname.startsWith(`/project/${projectId}/ppt`)
                    : location.pathname === path;
                  const workspace = key === 'spine' ? null : selectContentWorkspace(project, key);
                  const state = key === 'spine' ? project?.spine.status : workspace?.state;
                  return (
                    <Link
                      key={key}
                      to={path}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      data-workspace-nav-item
                      className={`flex h-11 w-full items-center gap-2 rounded-[var(--app-radius-control)] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${active ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] font-medium text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'}`}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                      <span className="text-[10px] text-[var(--app-text-tertiary)]">{state === 'uninitialized' ? '未创建' : state === 'confirmed' ? '已确认' : state || ''}</span>
                    </Link>
                  );
                })}
              </div>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('content-project:open-sync'))} className="mt-4 flex h-10 w-full items-center gap-2 border-t border-[var(--app-border)] px-3 pt-4 text-sm text-[var(--app-text-secondary)] hover:text-[var(--app-text)]">
                <GitCompareArrows size={16} aria-hidden="true" />
                <span className="flex-1 text-left">同步候选</span>
                <span className="text-xs tabular-nums">{project?.pending_sync_count || 0}</span>
              </button>
              <div data-content-project-rail-slot className="mt-3 min-h-0 flex-1 overflow-hidden border-t border-[var(--app-border)] pt-3" />
            </div>
          ) : (
            <div className="flex items-center gap-0.5 lg:mt-8 lg:w-full lg:flex-1 lg:flex-col lg:items-stretch lg:gap-1.5">
              {items.map(({ path, label, icon: Icon, action }) => {
                const active = location.pathname === path;
                return (
                  <Button
                    key={label}
                    variant="ghost"
                    size="sm"
                    icon={<Icon size={16} aria-hidden="true" />}
                    onClick={action}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    data-workspace-nav-item
                    className={`lg:h-11 lg:w-full lg:justify-start lg:px-3 ${active ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : ''}`}
                  >
                    <span className="hidden lg:inline">{label}</span>
                  </Button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-1.5 lg:grid lg:w-full lg:grid-cols-3 lg:border-t lg:border-[var(--app-border)] lg:pt-4">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} aria-hidden="true" />}
              onClick={() => navigate('/settings')}
              aria-label={t('nav.settings')}
              aria-current={location.pathname === '/settings' ? 'page' : undefined}
              data-workspace-nav-item
              className={`lg:h-10 lg:w-full lg:justify-center lg:px-2 ${location.pathname === '/settings' ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : ''}`}
            />
              <button
                type="button"
                onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')}
                className="flex h-10 min-w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] lg:w-full"
                title={t('settings.language.label')}
                aria-label={t('settings.language.label')}
              >
                <Globe size={16} aria-hidden="true" />
              </button>
              <div className="relative lg:w-full">
                <button
                  type="button"
                  onClick={() => setIsThemeMenuOpen((open) => !open)}
                  className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] lg:w-full"
                  title={t('settings.theme.label')}
                  aria-label={t('settings.theme.label')}
                  aria-haspopup="menu"
                  aria-expanded={isThemeMenuOpen}
                >
                  {theme === 'system' ? <Monitor size={16} /> : isDark ? <Moon size={16} /> : <Sun size={16} />}
                  <ChevronDown size={12} className={`transition-transform ${isThemeMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isThemeMenuOpen && (
                  <>
                    <button type="button" aria-label={t('actions.closeThemeMenu')} className="fixed inset-0 z-40 cursor-default" onClick={() => setIsThemeMenuOpen(false)} />
                    <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[132px] rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-[var(--app-shadow-floating)] lg:bottom-0 lg:left-full lg:right-auto lg:top-auto lg:ml-2 lg:mt-0">
                      {(['light', 'dark', 'system'] as const).map((value) => {
                        const Icon = value === 'light' ? Sun : value === 'dark' ? Moon : Monitor;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={theme === value}
                            onClick={() => { setTheme(value); setIsThemeMenuOpen(false); }}
                            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-sm transition-colors hover:bg-[var(--app-surface-hover)] ${theme === value ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'}`}
                          >
                            <Icon size={14} aria-hidden="true" />
                            <span>{t(`settings.theme.${value}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
          </div>
        </div>
      </nav>
      <MaterialGeneratorModal projectId={null} isOpen={isMaterialGeneratorOpen} onClose={() => setIsMaterialGeneratorOpen(false)} />
      <MaterialCenterModal isOpen={isMaterialCenterOpen} onClose={() => setIsMaterialCenterOpen(false)} />
    </>
  );
}
