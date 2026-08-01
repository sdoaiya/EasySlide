import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 统一左侧项目工具架（重构计划 §8 / UI_RULES 11）
 *
 * 唯一左侧工具架由 AppTopNav 承载：项目入口 + 当前页面/场景/片段索引。
 * 工作区（PPT 页面栏、视频场景、播客片段）通过 ProjectRailPortal 把索引
 * 渲染进导航槽；窄视口（<1024px）或测试环境（无导航槽）时回退为工作区
 * 自身的内联侧栏，保证任一视口最多一条完整侧栏。
 */
const railBreakpoint = '(min-width: 1024px)';

export function useProjectRail() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    setTarget(document.querySelector<HTMLElement>('[data-content-project-rail-slot]'));
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(railBreakpoint);
    setWide(media.matches);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // active：导航槽存在且视口 >=1024px 时，索引渲染进导航槽
  return { target, active: Boolean(target && wide) };
}

export function ProjectRailPortal({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : children;
}

/**
 * AppTopNav 内的导航槽。折叠态通过 CSS 隐藏内容，但 DOM 保持挂载，
 * 避免工作区在折叠/展开时重挂载索引。
 */
export function ProjectRailSlot({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      data-content-project-rail-slot
      role="complementary"
      aria-label="项目上下文索引"
      className={`mt-3 min-h-0 flex-1 overflow-hidden border-t border-[var(--app-border)] pt-3 ${collapsed ? 'hidden' : ''}`}
    />
  );
}
