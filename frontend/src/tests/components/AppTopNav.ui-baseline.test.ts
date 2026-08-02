import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('editorial workbench navigation baseline', () => {
  it('keeps the app tool shelf as a top bar without paper texture or a project rail', () => {
    const nav = source('src/components/shared/AppTopNav.tsx');
    const css = source('src/index.css');

    // 应用级左侧工具架（本地工作台形态）：桌面 216px 左栏，无项目 rail
    expect(nav).toContain('lg:w-[216px]');
    expect(nav).toContain('lg:fixed');
    expect(nav).not.toContain('ProjectRailSlot');
    expect(nav).not.toContain('blue_noise_med.png');
    expect(css).toContain('background: var(--app-surface-muted) !important;');
  });

  it('keeps the project mode navigation in the unified project shell', () => {
    const nav = source('src/components/shared/AppTopNav.tsx');
    const shell = source('src/components/content-project/ContentProjectLayout.tsx');

    // 项目模式切换移入统一项目编辑器壳层（阶段4）
    expect(shell).toContain("'ppt'");
    expect(shell).toContain("'video'");
    expect(shell).toContain("'podcast'");
    // 应用导航不再承载项目模式入口
    expect(nav).not.toContain("key: 'ppt'");
    expect(nav).not.toContain('contentProject');
    expect(nav).not.toContain('ProjectRailSlot');
    // 内容主线入口与主线同步审核仍不进入前台导航
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
