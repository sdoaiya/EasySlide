import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import {
  applyNarrationVersion,
  cancelNarrationAiJob,
  createNarrationAiCandidate,
  createNarrationAiJob,
  createPageNarrationVersion,
  discardNarrationCandidate,
  exportNativeVideo,
  exportVideo,
  getPageNarrationVersions,
  getProjectNarrations,
  getNarrationAiJobResult,
  pauseNarrationAiJob,
  preflightExportVideo,
  previewPageNarration,
  resumeNarrationAiJob,
  setPageNarrationLock,
} from '@/api/endpoints';

describe('narration workbench endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes narration version, candidate, apply, discard, and lock requests', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: {} } });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { data: {} } });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { data: {} } });

    await getProjectNarrations('project-1');
    await getPageNarrationVersions('project-1', 'page-1');
    await createPageNarrationVersion('project-1', 'page-1', {
      baseRevision: 3,
      mode: 'dialogue',
      language: 'zh-CN',
      text: '主持人与专家讨论关键结论。',
      segments: [{ segment_id: 'segment-1', order: 1, speaker_id: 'host', text: '先看结论。' }],
    });
    await createNarrationAiCandidate('project-1', 'page-1', {
      operation: 'polish',
      baseVersionId: 'version-3',
      baseRevision: 3,
      selection: { start: 0, end: 4 },
      instruction: '更自然',
      generationConfig: { target_seconds: 30 },
    });
    await applyNarrationVersion('project-1', 'page-1', 'candidate-1', 3);
    await discardNarrationCandidate('project-1', 'page-1', 'candidate-1');
    await setPageNarrationLock('project-1', 'page-1', true, 4);

    expect(get).toHaveBeenNthCalledWith(1, '/api/projects/project-1/narrations');
    expect(get).toHaveBeenNthCalledWith(2, '/api/projects/project-1/pages/page-1/narration/versions');
    expect(post).toHaveBeenNthCalledWith(1, '/api/projects/project-1/pages/page-1/narration/versions', {
      base_revision: 3,
      mode: 'dialogue',
      language: 'zh-CN',
      text: '主持人与专家讨论关键结论。',
      segments: [{ segment_id: 'segment-1', order: 1, speaker_id: 'host', text: '先看结论。' }],
    });
    expect(post).toHaveBeenNthCalledWith(2, '/api/projects/project-1/pages/page-1/narration/ai-candidates', {
      operation: 'polish',
      base_version_id: 'version-3',
      base_revision: 3,
      selection: { start: 0, end: 4 },
      instruction: '更自然',
      generation_config: { target_seconds: 30 },
    });
    expect(post).toHaveBeenNthCalledWith(3, '/api/projects/project-1/pages/page-1/narration/versions/candidate-1/apply', {
      base_revision: 3,
    });
    expect(remove).toHaveBeenCalledWith('/api/projects/project-1/pages/page-1/narration/candidates/candidate-1');
    expect(put).toHaveBeenCalledWith('/api/projects/project-1/pages/page-1/narration/lock', {
      locked: true,
      base_revision: 4,
    });
  });

  it('serializes provider-neutral page and segment preview requests', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:narration-preview') });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: new Blob(['audio'], { type: 'audio/mpeg' }),
      headers: {
        'x-tts-provider': 'fish_audio',
        'x-timing-quality': 'estimated',
        'x-cache-hit': 'true',
      },
    });

    const result = await previewPageNarration('project-1', 'page-1', {
      versionId: 'version-3',
      segmentId: 'segment-1',
      ttsProvider: 'fish_audio',
      voice: 'voice-host',
      speakers: [{ id: 'host', name: '主持人', voice: 'voice-host' }],
      autoEmotion: false,
    });

    expect(post).toHaveBeenCalledWith(
      '/api/projects/project-1/pages/page-1/narration/preview',
      {
        version_id: 'version-3',
        draft: undefined,
        segment_id: 'segment-1',
        tts_provider: 'fish_audio',
        voice: 'voice-host',
        speakers: [{ id: 'host', name: '主持人', voice: 'voice-host' }],
        auto_emotion: false,
      },
      { responseType: 'blob' },
    );
    expect(result.data).toEqual({
      audio_url: 'blob:narration-preview',
      provider: 'fish_audio',
      timing_quality: 'estimated',
      cache_hit: true,
    });
  });

  it('surfaces JSON errors from blob narration preview responses', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue({
      response: {
        data: new Blob([
          JSON.stringify({ error: { message: 'Reference not found' } }),
        ], { type: 'application/json' }),
      },
      message: 'Request failed with status code 502',
    });

    await expect(previewPageNarration('project-1', 'page-1', {
      draft: { mode: 'single', language: 'zh-CN', text: '试听' },
      ttsProvider: 'fish_audio',
      voice: 'missing-fish-voice',
    })).rejects.toThrow('Reference not found');

    expect(post).toHaveBeenCalledWith(
      '/api/projects/project-1/pages/page-1/narration/preview',
      expect.any(Object),
      { responseType: 'blob' },
    );
  });

  it('serializes batch AI candidate job requests and controls', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: {} } });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });

    await createNarrationAiJob('project-1', {
      scope: 'missing',
      pageIds: ['page-1'],
      operation: 'generate',
      instruction: '更自然',
      selection: { start: 0, end: 4 },
      generationConfig: { target_seconds: 30 },
    });
    await getNarrationAiJobResult('project-1', 'task-1');
    await pauseNarrationAiJob('project-1', 'task-1');
    await resumeNarrationAiJob('project-1', 'task-1');
    await cancelNarrationAiJob('project-1', 'task-1');

    expect(post).toHaveBeenNthCalledWith(1, '/api/projects/project-1/narrations/ai-jobs', {
      scope: 'missing',
      page_ids: ['page-1'],
      operation: 'generate',
      instruction: '更自然',
      selection: { start: 0, end: 4 },
      generation_config: { target_seconds: 30 },
    });
    expect(get).toHaveBeenCalledWith('/api/projects/project-1/narrations/ai-jobs/task-1/result');
    expect(post).toHaveBeenNthCalledWith(2, '/api/projects/project-1/narrations/ai-jobs/task-1/pause');
    expect(post).toHaveBeenNthCalledWith(3, '/api/projects/project-1/narrations/ai-jobs/task-1/resume');
    expect(post).toHaveBeenNthCalledWith(4, '/api/projects/project-1/narrations/ai-jobs/task-1/cancel');
  });

  it('serializes narration policy and version map for image, native, and preflight export', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });
    const narrationVersionMap = { 'page-1': 'version-3' };

    await exportVideo('project-1', {
      narrationPolicy: 'confirmed_only',
      narrationVersionMap,
    });
    await preflightExportVideo('project-1', {
      narrationPolicy: 'confirmed_only',
      narrationVersionMap,
    });
    await exportNativeVideo(
      'project-1',
      [new Blob(['frame'], { type: 'image/png' })],
      ['page-1'],
      'demo.mp4',
      undefined,
      { narrationPolicy: 'confirmed_only', narrationVersionMap },
    );

    expect(post).toHaveBeenNthCalledWith(1, '/api/projects/project-1/export/video', expect.objectContaining({
      narration_policy: 'confirmed_only',
      narration_version_map: narrationVersionMap,
    }));
    expect(post).toHaveBeenNthCalledWith(2, '/api/projects/project-1/export/video/preflight', expect.objectContaining({
      narration_policy: 'confirmed_only',
      narration_version_map: narrationVersionMap,
    }));
    const nativeForm = post.mock.calls[2][1] as FormData;
    expect(nativeForm.get('narration_policy')).toBe('confirmed_only');
    expect(nativeForm.get('narration_version_map')).toBe(JSON.stringify(narrationVersionMap));
  });
});
