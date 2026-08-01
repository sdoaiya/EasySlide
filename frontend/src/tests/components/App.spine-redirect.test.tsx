import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SpineLegacyRedirect } from '@/App';
import type { ContentProject, ContentProjectEntry } from '@/types';

let mockProject: ContentProject | null = null;
vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: (selector: (state: { project: ContentProject | null }) => unknown) =>
    selector({ project: mockProject }),
}));

const project = (lastWorkspace: ContentProjectEntry | null, initializedKinds: Array<'ppt' | 'video' | 'podcast'>): ContentProject => ({
  project_id: 'project-1',
  project_title: '旧项目',
  lifecycle_state: 'active',
  last_workspace: lastWorkspace,
  project_settings: { pronunciation_lexicon: [], narration_preferences: { quality_check: false, strict_quality_check: false, subtitle_timing: 'estimated', emotion_director: { intensity: 'standard', pace: 'normal', pause: 'normal', relationship: 'neutral' }, page_overrides: {} } },
  spine: { id: 'spine-1', project_id: 'project-1', revision: 1, status: 'draft', content_hash: 'hash', document: { topic: { value: '旧项目' } } },
  workspaces: (['ppt', 'video', 'podcast'] as const).map((kind) => ({
    id: `${kind}-1`,
    project_id: 'project-1',
    kind,
    state: initializedKinds.includes(kind) ? 'draft' : 'uninitialized',
    revision: initializedKinds.includes(kind) ? 1 : 0,
    source_kind: 'spine',
    settings: {},
  })),
});

function renderRedirect() {
  render(
    <MemoryRouter initialEntries={['/project/project-1/spine']}>
      <Routes>
        <Route path="/project/:projectId/spine" element={<SpineLegacyRedirect />} />
        <Route path="/project/:projectId/ppt/outline" element={<div>PPT 大纲页</div>} />
        <Route path="/project/:projectId/video" element={<div>视频工作区页</div>} />
        <Route path="/project/:projectId/podcast" element={<div>播客工作区页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SpineLegacyRedirect', () => {
  it('redirects to the last visited target workspace', () => {
    mockProject = project('video', ['ppt', 'video']);
    renderRedirect();
    expect(screen.getByText('视频工作区页')).toBeInTheDocument();
  });

  it('redirects to podcast when it is the last workspace', () => {
    mockProject = project('podcast', ['podcast']);
    renderRedirect();
    expect(screen.getByText('播客工作区页')).toBeInTheDocument();
  });

  it('maps legacy spine value to the first initialized workspace', () => {
    mockProject = project('spine', ['podcast']);
    renderRedirect();
    expect(screen.getByText('播客工作区页')).toBeInTheDocument();
  });

  it('falls back to the PPT outline when nothing is initialized', () => {
    mockProject = project(null, []);
    renderRedirect();
    expect(screen.getByText('PPT 大纲页')).toBeInTheDocument();
  });
});
