import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiClient } from '@/api/client';
import { listMaterials } from '@/api/endpoints';

describe('material endpoints', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('appends media kind and purpose filters to global material lists', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: { materials: [], count: 0 } } });

    await listMaterials('all', { mediaKind: ['audio', 'transcript'], purpose: 'voice' });

    expect(get).toHaveBeenCalledWith('/api/materials?project_id=all&media_kind=audio%2Ctranscript&purpose=voice');
  });
});
