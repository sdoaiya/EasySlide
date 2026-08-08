import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { MaterialCenterModal } from '@/components/shared/MaterialCenterModal';
import { listMaterials } from '@/api/endpoints';

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listMaterials: vi.fn().mockResolvedValue({
      data: {
        materials: [
          {
            id: 'mat-1',
            url: '/uploads/materials/cozy.png',
            name: 'Cozy material',
            filename: 'cozy.png',
            created_at: '2026-07-04T00:00:00Z',
          },
          {
            id: 'audio-1',
            url: '/uploads/materials/active.mp3',
            name: '活力开场.mp3',
            filename: 'active.mp3',
            media_kind: 'audio',
            mime_type: 'audio/mpeg',
            created_at: '2026-07-05T00:00:00Z',
          },
        ],
      },
    }),
    listProjects: vi.fn().mockResolvedValue({ data: { projects: [] } }),
    uploadMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    downloadMaterialsZip: vi.fn(),
  };
});

describe('MaterialCenterModal EasySlide styling', () => {
  it('uses semantic selection styling for material cards', async () => {
    render(<MaterialCenterModal isOpen onClose={() => {}} />);

    const image = await screen.findByAltText('Cozy material');
    const card = image.parentElement as HTMLElement;

    fireEvent.click(card);

    expect(card.className).toContain('border-[var(--app-accent)]');
    expect(card.className).not.toContain('border-banana-500');

    const buttons = card.querySelectorAll('button');
    expect(buttons[1]?.querySelector('span')).toHaveClass('bg-[var(--app-error)]');
    expect(buttons[1]?.className).not.toContain('bg-red-500');
    expect(document.body.innerHTML).not.toContain('bg-black/60');
    expect(document.body.innerHTML).not.toContain('bg-black/80');
    expect(document.body.innerHTML).not.toContain('bg-[color:var(--app-surface)]/85 text-white');
    expect(document.body.innerHTML).toContain('text-[var(--app-text)]');

    const nameLabel = screen.getByText('Cozy material');
    expect(nameLabel).toHaveClass('bg-[color:var(--app-text)]/85', 'text-[var(--app-surface)]');
    expect(nameLabel).not.toHaveClass('opacity-0');
    expect(screen.queryByText('活力开场.mp3')).not.toBeInTheDocument();
    expect(screen.queryByText('音频素材')).not.toBeInTheDocument();
    expect(listMaterials).toHaveBeenCalledWith('all', { mediaKind: 'image' });
  });

  it('renders a left-control and right-content workspace presentation', async () => {
    render(<MaterialCenterModal isOpen onClose={() => {}} presentation="workspace" />);

    expect(screen.getByRole('heading', { level: 1, name: '素材中心' })).toBeInTheDocument();
    expect(await screen.findByAltText('Cozy material')).toBeInTheDocument();
    expect(screen.queryByText('音频素材')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('material-grid-workspace')).not.toHaveClass('max-h-96');
  });
});
