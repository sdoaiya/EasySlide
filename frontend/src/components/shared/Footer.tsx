import React from 'react';
import { useTranslation } from 'react-i18next';

export const Footer: React.FC = () => {
  const { i18n } = useTranslation();

  const zh = i18n.language?.startsWith('zh');
  return (
    <footer className="mt-auto w-full border-t border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-5 text-sm text-[var(--app-text-secondary)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-semibold text-[var(--app-text)]">EasySlide</span>
          <span className="ml-3 text-xs text-[var(--app-text-tertiary)]">© 2026 {zh ? '保留所有权利。' : 'All rights reserved.'}</span>
        </div>
        <nav aria-label={zh ? '页脚链接' : 'Footer links'} className="flex flex-wrap gap-4">
          <a href="/privacy" className="hover:text-[var(--app-accent)]">{zh ? '隐私政策' : 'Privacy'}</a>
          <a href="/terms" className="hover:text-[var(--app-accent)]">{zh ? '服务条款' : 'Terms'}</a>
          <a href="/cookies" className="hover:text-[var(--app-accent)]">{zh ? 'Cookie 政策' : 'Cookies'}</a>
        </nav>
      </div>
    </footer>
  );
};
