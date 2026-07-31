import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { MaterialCenterModal } from '@/components/shared/MaterialCenterModal';

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
    expect(buttons[1]?.className).toContain('bg-[var(--app-error)]');
    expect(buttons[1]?.className).not.toContain('bg-red-500');
    expect(document.body.innerHTML).not.toContain('bg-black/60');
    expect(document.body.innerHTML).not.toContain('bg-black/80');
    expect(document.body.innerHTML).not.toContain('bg-[color:var(--app-surface)]/85 text-white');
    expect(document.body.innerHTML).toContain('text-[var(--app-text)]');
  });
});
