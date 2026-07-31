import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MaterialSelector } from '@/components/shared/MaterialSelector';
import { listMaterials } from '@/api/endpoints';

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listProjects: vi.fn().mockResolvedValue({ data: { projects: [] } }),
    listMaterials: vi.fn().mockResolvedValue({
      data: {
        materials: [
          { id: 'audio-1', url: '/files/materials/voice.mp3', filename: 'voice.mp3', original_filename: 'voice.mp3', media_kind: 'audio', mime_type: 'audio/mpeg', created_at: '', updated_at: '' },
          { id: 'text-1', url: '/files/materials/script.md', filename: 'script.md', original_filename: 'script.md', media_kind: 'transcript', mime_type: 'text/markdown', created_at: '', updated_at: '' },
        ],
      },
    }),
    uploadMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
  };
});

describe('MaterialSelector media assets', () => {
  it('renders non-image material cards and accepts media uploads', async () => {
    const { container } = render(<MaterialSelector isOpen onClose={() => {}} onSelect={() => {}} mediaKindFilter={['audio', 'transcript']} />);

    expect(await screen.findByText('音频素材')).toBeInTheDocument();
    expect(screen.getByText('文本素材')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('bg-black/60');
    expect(container.innerHTML).not.toContain('bg-[color:var(--app-surface)]/85 p-1 text-xs text-white');
    expect(document.querySelector('input[type="file"]')).toHaveAttribute('accept', 'image/*,audio/*,video/*,.txt,.md,.srt,.vtt,.json');
    expect(listMaterials).toHaveBeenCalledWith('all', { mediaKind: ['audio', 'transcript'] });
  });
});
