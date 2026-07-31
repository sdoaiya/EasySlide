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

  it('keeps reduced-motion rules complete for native page transitions', () => {
    const nativeCss = source('src/native-deck/native-deck.css');

    expect(nativeCss).toContain('.native-enter-slide-down');
    expect(nativeCss).toContain('.native-page-outgoing');
    expect(nativeCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
