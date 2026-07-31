import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function useProjectRailTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.querySelector<HTMLElement>('[data-content-project-rail-slot]'));
  }, []);

  return target;
}

export function ProjectRailPortal({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : children;
}
