import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ClipboardList, FileText, FolderOpen, Globe, Home, ImagePlus, LayoutDashboard, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from 'lucide-react';
import { getStaticAssetUrl } from '@/api/client';
import { useTheme } from '@/hooks/useTheme';
import { useT } from '@/hooks/useT';
import { Button } from './Button';
import { MaterialCenterModal } from './MaterialCenterModal';
import { MaterialGeneratorModal } from './MaterialGeneratorModal';

const topNavI18n = {
  zh: {
    nav: { home: '首页', createProject: '创建项目', history: '我的项目', tasks: '任务中心', materialCenter: '素材中心', materialGenerate: '素材生成', settings: '设置' },
    settings: { language: { label: '界面语言' }, theme: { label: '主题模式', light: '浅色', dark: '深色', system: '跟随系统' } },
    actions: { closeThemeMenu: '关闭主题菜单', collapse: '收起侧栏', expand: '展开侧栏' },
  },
  en: {
    nav: { home: 'Home', createProject: 'Create Project', history: 'My Projects', tasks: 'Task Center', materialCenter: 'Material Center', materialGenerate: 'Material Generation', settings: 'Settings' },
    settings: { language: { label: 'Interface Language' }, theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' } },
    actions: { closeThemeMenu: 'Close theme menu', collapse: 'Collapse sidebar', expand: 'Expand sidebar' },
  },
};

/**
 * 应用级左侧工具架（本地工作台形态）。
 * 桌面端固定 216px 左栏（可收起为 44px），移动端为顶部横条；
 * 只服务应用页面（首页/创建/历史/任务中心/设置），项目路由不渲染。
 */
export function AppTopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const t = useT(topNavI18n);
  const { theme, isDark, setTheme } = useTheme();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isMaterialCenterOpen, setIsMaterialCenterOpen] = useState(false);
  const [isMaterialGeneratorOpen, setIsMaterialGeneratorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-nav-offset', collapsed ? '44px' : '216px');
    return () => {
      document.documentElement.style.removeProperty('--app-nav-offset');
    };
  }, [collapsed]);

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
        role="navigation"
        aria-label="工作台导航"
        className={`sticky top-0 z-40 h-16 border-b border-[var(--app-border)] bg-[var(--app-surface)] lg:fixed lg:inset-y-0 lg:left-0 lg:h-screen lg:border-b-0 lg:border-r lg:bg-[var(--app-surface-muted)] ${collapsed ? 'lg:w-[44px]' : 'lg:w-[216px]'}`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5 lg:mx-0 lg:max-w-none lg:flex-col lg:items-stretch lg:px-0">
          <button autoFocus type="button" onClick={() => navigate('/home')} className={`flex h-10 items-center overflow-hidden lg:h-14 lg:w-full ${collapsed ? 'lg:justify-center lg:px-0' : 'lg:justify-start lg:px-3'}`} aria-label="EasySlide">
            <img src={getStaticAssetUrl('/logo-nav-transparent.png')} alt="EasySlide Logo" className={`max-w-none object-contain ${collapsed ? 'w-10 lg:w-10' : 'w-[132px] lg:w-[160px]'}`} />
          </button>
          <div className={`flex items-center gap-0.5 lg:mt-4 lg:w-full lg:flex-1 lg:flex-col lg:items-stretch lg:gap-1.5 ${collapsed ? 'lg:px-0' : 'lg:px-2'}`}>
            {items.map(({ path, label, icon: Icon, action }) => {
              const active = path ? location.pathname === path : false;
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
                  title={collapsed ? label : undefined}
                  className={`lg:h-11 lg:w-full lg:justify-start lg:px-3 ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${active ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'}`}
                >
                  {!collapsed && <span className="hidden lg:inline">{label}</span>}
                </Button>
              );
            })}
          </div>
          <div className={`flex items-center gap-1.5 lg:grid lg:w-full lg:gap-1 lg:border-t lg:border-[var(--app-border)] lg:pt-3 ${collapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} ${collapsed ? 'lg:px-0' : 'lg:px-2'}`}>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="hidden h-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] lg:flex"
              title={collapsed ? t('actions.expand') : t('actions.collapse')}
              aria-label={collapsed ? t('actions.expand') : t('actions.collapse')}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} aria-hidden="true" />}
              onClick={() => navigate('/settings')}
              aria-label={t('nav.settings')}
              aria-current={location.pathname === '/settings' ? 'page' : undefined}
              data-workspace-nav-item
              title={collapsed ? t('nav.settings') : undefined}
              className={`lg:h-10 lg:w-full lg:min-w-0 lg:justify-center lg:px-2 ${location.pathname === '/settings' ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : ''}`}
            />
            {!collapsed && (
              <button
                type="button"
                onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')}
                className="flex h-10 min-w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] lg:w-full"
                title={t('settings.language.label')}
                aria-label={t('settings.language.label')}
              >
                <Globe size={16} aria-hidden="true" />
              </button>
            )}
            {!collapsed && (
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
            )}
          </div>
        </div>
      </nav>
      <MaterialGeneratorModal projectId={null} isOpen={isMaterialGeneratorOpen} onClose={() => setIsMaterialGeneratorOpen(false)} />
      <MaterialCenterModal isOpen={isMaterialCenterOpen} onClose={() => setIsMaterialCenterOpen(false)} />
    </>
  );
}
