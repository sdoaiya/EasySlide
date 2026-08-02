import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ClipboardList, FileText, FolderOpen, Globe, Home, ImagePlus, LayoutDashboard, Monitor, Moon, Settings, Sun } from 'lucide-react';
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
    actions: { closeThemeMenu: '关闭主题菜单' },
  },
  en: {
    nav: { home: 'Home', createProject: 'Create Project', history: 'My Projects', tasks: 'Task Center', materialCenter: 'Material Center', materialGenerate: 'Material Generation', settings: 'Settings' },
    settings: { language: { label: 'Interface Language' }, theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' } },
    actions: { closeThemeMenu: 'Close theme menu' },
  },
};

/**
 * 应用级顶部导航（阶段4）：只服务应用页面（首页/创建/历史/任务中心/设置），
 * 不再渲染项目工作区左栏与模式入口——项目路由使用统一项目编辑器壳层。
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
      <nav role="navigation" aria-label="工作台导航" className="sticky top-0 z-40 h-16 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5">
          <button autoFocus type="button" onClick={() => navigate('/home')} className="flex h-10 items-center" aria-label="EasySlide">
            <img src={getStaticAssetUrl('/logo-nav-transparent.png')} alt="EasySlide Logo" className="max-w-none object-contain w-[132px]" />
          </button>
          <div className="flex items-center gap-0.5">
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
                  className={active ? 'border-[color:var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-card)]' : ''}
                >
                  <span className="hidden lg:inline">{label}</span>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} aria-hidden="true" />}
              onClick={() => navigate('/settings')}
              aria-label={t('nav.settings')}
              aria-current={location.pathname === '/settings' ? 'page' : undefined}
              data-workspace-nav-item
            />
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')}
              className="flex h-10 min-w-10 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
              title={t('settings.language.label')}
              aria-label={t('settings.language.label')}
            >
              <Globe size={16} aria-hidden="true" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen((open) => !open)}
                className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
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
                  <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[132px] rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-[var(--app-shadow-floating)]">
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
