import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCard } from '@/components/history/ProjectCard';

const project = {
  project_id: 'project-1',
  project_title: '编辑部作品',
  idea_prompt: '作品内容',
  status: 'DRAFT',
  pages: [],
  workspaces: [{
    id: 'workspace-1',
    project_id: 'project-1',
    kind: 'video',
    state: 'draft',
    revision: 1,
    source_kind: 'manual',
    settings: {},
  }],
  created_at: '2026-07-30T10:00:00Z',
  updated_at: '2026-07-30T10:00:00Z',
} as any;

const props = (onExport: ReturnType<typeof vi.fn>) => ({
  project,
  isSelected: false,
  isEditing: false,
  editingTitle: project.project_title,
  onSelect: vi.fn(),
  onToggleSelect: vi.fn(),
  onDelete: vi.fn(),
  onExport,
  onStartEdit: vi.fn(),
  onTitleChange: vi.fn(),
  onTitleKeyDown: vi.fn(),
  onSaveEdit: vi.fn(),
  isBatchMode: false,
  layout: 'grid' as const,
});

describe('ProjectCard actions and summary', () => {
  it('keeps export out of the home grid and available in the project list', () => {
    const onExport = vi.fn();
    render(<ProjectCard {...props(onExport)} />);
    expect(screen.queryByRole('button', { name: /^导出$/ })).not.toBeInTheDocument();

    render(<ProjectCard {...props(onExport)} layout="list" />);
    fireEvent.click(screen.getByRole('button', { name: /^导出$/ }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('renders status, page count and cover from the lightweight catalog summary', async () => {
    render(<ProjectCard {...props(vi.fn())} project={{
      ...project,
      pages: undefined,
      cover_url: '/files/project-1/cover.webp',
      dashboard_status: 'completed',
      page_count: 15,
    }} />);

    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('15 页')).toBeInTheDocument();
    expect(await screen.findByRole('img')).toHaveAttribute('src', expect.stringContaining('/files/project-1/cover.webp'));
  });

  it.each(['grid', 'list'] as const)('keeps the %s project open control separate from action controls', (layout) => {
    const onSelect = vi.fn();
    render(<ProjectCard {...props(vi.fn())} onSelect={onSelect} layout={layout} />);

    const openControl = screen.getByRole('button', { name: project.project_title });
    expect(openControl.tagName).toBe('H3');
    expect(openControl.querySelector('button, input, [role="menuitem"]')).toBeNull();

    fireEvent.keyDown(openControl, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(project);
  });
});
