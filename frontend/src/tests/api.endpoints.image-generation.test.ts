import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { generatePageImage, recoverPageImageScene } from '@/api/endpoints';

describe('image generation endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends quality issues with a single-page regeneration request', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });

    await generatePageImage(
      'project-1',
      'page-2',
      true,
      { qualityIssues: ['resolution_mismatch'] },
      'zh',
    );

    expect(post).toHaveBeenCalledWith(
      '/api/projects/project-1/pages/page-2/generate/image',
      expect.objectContaining({
        force_regenerate: true,
        quality_issues: ['resolution_mismatch'],
      }),
    );
  });

  it('starts a forced historical scene recovery for one image version', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: { task_id: 'task-1', status: 'PENDING' } },
    });

    await recoverPageImageScene('project-1', 'page-2', 'version-3', true);

    expect(post).toHaveBeenCalledWith(
      '/api/projects/project-1/pages/page-2/image-versions/version-3/recover-scene',
      { force: true },
    );
  });
});
