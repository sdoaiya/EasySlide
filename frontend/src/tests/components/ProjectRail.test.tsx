import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectRailSlot, useProjectRail } from '@/components/project-rail/ProjectRail';
import { VideoWorkspace } from '@/components/content-project/VideoWorkspace';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  exportVideo: vi.fn(),
  getProject: vi.fn(),
  handoffFrames: vi.fn(),
  getTaskStatus: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/api/endpoints', () => ({
  updateContentWorkspace: mocks.update,
  exportVideoWorkspace: mocks.exportVideo,
  getProject: mocks.getProject,
  handoffVideoWorkspaceFrames: mocks.handoffFrames,
  getTaskStatus: mocks.getTaskStatus,
}));

vi.mock('@/components/content-project/WorkspaceVersionHistory', () => ({
  WorkspaceVersionHistory: () => <div>版本历史</div>,
}));

vi.mock('@/components/shared/MaterialSelector', () => ({
  MaterialSelector: () => null,
}));

const workspace = {
  id: 'video-1',
  project_id: 'project-1',
  kind: 'video' as const,
  state: 'draft' as const,
  revision: 1,
  current_version_id: 'version-1',
  source_kind: 'spine' as const,
  settings: {},
  document: {
    schema_version: 1,
    title: '视频工作区',
    aspect_ratio: '16:9',
    scenes: [
      { scene_id: 'scene.1', title: '开场', visual: { kind: 'blank', source_ref: null }, narration: { mode: 'single' as const, text: '原旁白', segments: [] }, subtitles: { enabled: true, text: '原旁白' }, duration_ms: 3000, transition: 'cut' as const, animation: { intensity: 'subtle' as const, cues: [] }, audio_cues: [] },
    ],
  },
};

describe('ProjectRail 统一左侧工具架', () => {
  it('renders the context index inside the nav slot and drops the second sidebar at wide viewport', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <>
        <ProjectRailSlot collapsed={false} />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />
      </>
    );

    const slot = document.querySelector('[data-content-project-rail-slot]');
    expect(slot).toHaveTextContent('开场');
    // 工作区不再渲染第二条完整侧栏
    expect(screen.queryByRole('complementary', { name: '页面栏' })).not.toBeInTheDocument();
    expect(screen.getByRole('main').parentElement).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)',
    });

    fireEvent.click(screen.getByTestId('video-scene-rail-scene.1'));
  });

  it('keeps the rail inline when no nav slot exists (fallback)', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveTextContent('开场');
  });

  it('hides the slot content while collapsed but keeps the DOM mounted', () => {
    const { rerender } = render(<ProjectRailSlot collapsed={false} />);
    const slot = document.querySelector('[data-content-project-rail-slot]');
    expect(slot).not.toHaveClass('hidden');
    rerender(<ProjectRailSlot collapsed />);
    expect(slot).toHaveClass('hidden');
    expect(document.querySelector('[data-content-project-rail-slot]')).toBe(slot);
  });
});

function RailConsumer() {
  const { active } = useProjectRail();
  return <div data-testid="rail-state">{active ? 'nav' : 'inline'}</div>;
}

describe('useProjectRail', () => {
  it('activates only when both the slot exists and the viewport is wide', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { rerender } = render(
      <>
        <ProjectRailSlot collapsed={false} />
        <RailConsumer />
      </>
    );
    expect(screen.getByTestId('rail-state')).toHaveTextContent('nav');

    // 无槽位时回退内联
    rerender(<RailConsumer />);
    expect(screen.getByTestId('rail-state')).toHaveTextContent('inline');
  });
});
