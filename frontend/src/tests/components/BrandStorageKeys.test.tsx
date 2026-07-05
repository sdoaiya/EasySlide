import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from '@/hooks/useTheme';

describe('EasySlide browser storage keys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates the legacy theme key to the EasySlide key', () => {
    localStorage.setItem('banana-slides-theme', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('easyslide-theme')).toBe('dark');
    expect(localStorage.getItem('banana-slides-theme')).toBeNull();
  });

  it('migrates the legacy language key before i18n detection runs', async () => {
    localStorage.setItem('banana-slides-language', 'en');
    vi.resetModules();

    await import('@/i18n');

    expect(localStorage.getItem('easyslide-language')).toBe('en');
    expect(localStorage.getItem('banana-slides-language')).toBeNull();
  });
});
