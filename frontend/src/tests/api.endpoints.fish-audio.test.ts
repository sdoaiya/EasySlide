import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { createFishAudioVoice, exportNativeVideo, exportVideo, getFishAudioVoices, preflightExportVideo, previewFishNarration } from '@/api/endpoints';

describe('Fish Audio video export endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Fish Audio options for image video export and preflight', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });
    const speakers = [
      { id: 'host', name: '主持人', voice: 'voice-host' },
      { id: 'guest', name: '嘉宾', voice: 'voice-guest' },
    ];
    const pronunciationLexicon = [{ term: 'API', pronunciation: 'A P I' }];
    const narrationPreferences = {
      quality_check: true,
      strict_quality_check: false,
      subtitle_timing: 'asr' as const,
      emotion_director: { intensity: 'standard' as const, pace: 'normal' as const, pause: 'normal' as const, relationship: 'neutral' as const },
      page_overrides: {},
    };

    await preflightExportVideo('project-1', {
      ttsProvider: 'fish_audio',
      narrationMode: 'dialogue',
      speakers,
    });
    await exportVideo('project-1', {
      ttsProvider: 'fish_audio',
      narrationMode: 'dialogue',
      speakers,
      autoEmotion: false,
      pronunciationLexicon,
      narrationPreferences,
    });

    expect(post).toHaveBeenNthCalledWith(1, '/api/projects/project-1/export/video/preflight', expect.objectContaining({
      tts_provider: 'fish_audio',
      narration_mode: 'dialogue',
      speakers,
    }));
    expect(post).toHaveBeenNthCalledWith(2, '/api/projects/project-1/export/video', expect.objectContaining({
      tts_provider: 'fish_audio',
      narration_mode: 'dialogue',
      speakers,
      auto_emotion: false,
      pronunciation_lexicon: pronunciationLexicon,
      narration_preferences: narrationPreferences,
    }));
  });

  it('serializes Fish Audio options for native video export', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });
    const speakers = [
      { id: 'host', name: '主持人', voice: 'voice-host' },
      { id: 'guest', name: '嘉宾', voice: 'voice-guest' },
    ];
    const pronunciationLexicon = [{ term: 'SaaS', pronunciation: '萨斯' }];

    await exportNativeVideo(
      'project-1',
      [new Blob(['frame'], { type: 'image/png' })],
      ['page-1'],
      'demo.mp4',
      undefined,
      {
        ttsProvider: 'fish_audio',
        voice: 'voice-host',
        narrationMode: 'dialogue',
        speakers,
        autoEmotion: false,
        pronunciationLexicon,
      },
    );

    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('tts_provider')).toBe('fish_audio');
    expect(form.get('voice')).toBe('voice-host');
    expect(form.get('narration_mode')).toBe('dialogue');
    expect(form.get('speakers')).toBe(JSON.stringify(speakers));
    expect(form.get('auto_emotion')).toBe('false');
    expect(form.get('pronunciation_lexicon')).toBe(JSON.stringify(pronunciationLexicon));
  });

  it('requests an audio blob for short preview', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: blob });

    await expect(previewFishNarration('project-1', {
      text: '欢迎使用 API。', voice: 'voice-host', pronunciationLexicon: [{ term: 'API', pronunciation: 'A P I' }],
    })).resolves.toBe(blob);

    expect(post).toHaveBeenCalledWith('/api/projects/project-1/narration/preview', expect.objectContaining({
      text: '欢迎使用 API。', voice: 'voice-host',
    }), { responseType: 'blob' });
  });

  it('serializes Fish Audio voice list scope', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: { voices: [] } } });

    await getFishAudioVoices({ scope: 'public', sortBy: 'task_count', pageSize: 20 });

    expect(get).toHaveBeenCalledWith('/api/settings/fish-audio/voices', {
      params: { scope: 'public', sort_by: 'task_count', page_size: 20 },
    });
  });

  it('serializes up to three Fish Audio clone samples', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } });
    const files = [
      new File(['one'], 'one.mp3', { type: 'audio/mpeg' }),
      new File(['two'], 'two.mp3', { type: 'audio/mpeg' }),
      new File(['three'], 'three.mp3', { type: 'audio/mpeg' }),
    ];

    await createFishAudioVoice({
      title: 'clone',
      files,
      transcripts: ['一', '二', '三'],
      consentConfirmed: true,
    });

    const form = post.mock.calls[0][1] as FormData;
    expect(form.getAll('voices')).toEqual(files);
    expect(form.getAll('texts')).toEqual(['一', '二', '三']);
  });
});
