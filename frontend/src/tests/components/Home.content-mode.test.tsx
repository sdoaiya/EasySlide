import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from '@/pages/Home';

const initializeProject = vi.fn();

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: () => ({ initializeProject, isGlobalLoading: false }),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return {
    ...actual,
    listUserTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  };
});

describe('Home content workspace mode', () => {
  beforeEach(() => {
    initializeProject.mockReset();
    localStorage.clear();
  });

  it('chooses the first workspace before workspace-specific settings', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);

    const modes = screen.getByRole('radiogroup', { name: '首次工作区' });
    expect(modes).toHaveTextContent('PPT');
    expect(modes).toHaveTextContent('视频');
    expect(modes).toHaveTextContent('播客');
    expect(screen.getByRole('radiogroup', { name: '生成模式' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '视频' }));
    expect(screen.queryByRole('radiogroup', { name: '生成模式' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'PPT 翻新' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '播客' }));
    expect(screen.getByText('节目片段')).toBeInTheDocument();
  });
});
