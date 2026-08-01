import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('editorial workbench navigation baseline', () => {
  it('keeps the desktop tool shelf below the Electron title bar without paper texture', () => {
    const nav = source('src/components/shared/AppTopNav.tsx');
    const css = source('src/index.css');

    expect(nav).toContain('lg:top-10');
    expect(nav).toContain('lg:h-[calc(100vh-40px)]');
    expect(nav).toContain('lg:top-0 lg:h-screen');
    expect(nav).toContain('hidden lg:inline');
    expect(nav).not.toContain('blue_noise_med.png');
    expect(css).toContain('background: var(--app-surface-muted) !important;');
  });

  it('keeps the project navigation limited to PPT, video, podcast, and settings', () => {
    const nav = source('src/components/shared/AppTopNav.tsx');

    expect(nav).toContain("key: 'ppt'");
    expect(nav).toContain("key: 'video'");
    expect(nav).toContain("key: 'podcast'");
    // 内容主线入口与主线同步审核已从前台导航移除
    expect(nav).not.toContain("key: 'spine'");
    expect(nav).not.toContain('主线同步审核');
    expect(nav).not.toContain('GitCompareArrows');
    expect(nav).not.toContain('pending_sync_count');
  });

  it('keeps reduced-motion rules complete for native page transitions', () => {
    const nativeCss = source('src/native-deck/native-deck.css');

    expect(nativeCss).toContain('.native-enter-slide-down');
    expect(nativeCss).toContain('.native-page-outgoing');
    expect(nativeCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
