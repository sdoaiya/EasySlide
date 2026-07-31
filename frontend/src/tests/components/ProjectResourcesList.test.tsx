import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectResourcesList } from '@/components/shared/ProjectResourcesList';

vi.mock('@/api/client', () => ({
  getImageUrl: (url: string) => url,
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listMaterials: vi.fn().mockResolvedValue({
      data: {
        materials: [
          {
            id: 'mat-1',
            url: '/files/materials/cover.png',
            filename: 'cover.png',
            original_filename: 'cover.png',
            media_kind: 'image',
            created_at: '',
            updated_at: '',
          },
        ],
      },
    }),
    listProjectReferenceFiles: vi.fn().mockResolvedValue({ data: { files: [] } }),
    deleteMaterial: vi.fn(),
  };
});

describe('ProjectResourcesList', () => {
  it('uses the editorial surface overlay for resource captions', async () => {
    const { container } = render(<ProjectResourcesList projectId="project-1" showFiles={false} />);

    expect(await screen.findByAltText('cover.png')).toBeInTheDocument();
  expect(container.innerHTML).not.toContain('bg-black/70');
  expect(container.innerHTML).toContain('bg-[color:var(--app-surface)]/85');
  expect(container.innerHTML).not.toContain('bg-[color:var(--app-surface)]/85 text-white');
  expect(container.innerHTML).toContain('bg-[color:var(--app-surface)]/85 text-[var(--app-text)]');
  });
});
