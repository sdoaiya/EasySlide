import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectRailSlot } from '@/components/project-rail/ProjectRail';
import { VideoWorkspace } from '@/components/content-project/VideoWorkspace';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  exportVideo: vi.fn(),
  getProject: vi.fn(),
  handoffFrames: vi.fn(),
  getTaskStatus: vi.fn(),
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

describe('编辑区独立侧栏', () => {
  it('保持场景索引在工作区自己的侧栏，不嵌入项目导航槽', () => {
    render(
      <>
        <ProjectRailSlot collapsed={false} />
        <VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />
      </>
    );

    // 工作区侧栏承载场景索引
    const sidebar = screen.getByRole('complementary', { name: '页面栏' });
    expect(sidebar).toHaveTextContent('开场');
    // 导航槽保持为空（编辑区独立）
    const slot = document.querySelector('[data-content-project-rail-slot]');
    expect(slot).not.toHaveTextContent('开场');
    // 点击场景可选中
    fireEvent.click(screen.getByTestId('video-scene-rail-scene.1'));
    expect(screen.getByLabelText('场景标题')).toHaveValue('开场');
  });

  it('无导航槽时同样保持工作区侧栏', () => {
    render(<VideoWorkspace projectId="project-1" spineRevision={3} workspace={workspace} onChanged={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveTextContent('开场');
  });

  it('折叠态槽内容隐藏但 DOM 常驻', () => {
    const { rerender } = render(<ProjectRailSlot collapsed={false} />);
    const slot = document.querySelector('[data-content-project-rail-slot]');
    expect(slot).not.toHaveClass('hidden');
    rerender(<ProjectRailSlot collapsed />);
    expect(slot).toHaveClass('hidden');
    expect(document.querySelector('[data-content-project-rail-slot]')).toBe(slot);
  });
});
