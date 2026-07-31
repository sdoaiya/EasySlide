import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '@/pages/Settings';

const endpointMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  verifyFishAudio: vi.fn(),
  getFishAudioVoices: vi.fn(),
  createFishAudioVoice: vi.fn(),
  deleteFishAudioVoice: vi.fn(),
}));

vi.mock('@/api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('@/api/endpoints')>('@/api/endpoints');
  return { ...actual, ...endpointMocks };
});

const settings = {
  id: 1,
  ai_provider_format: 'gemini',
  api_key_length: 0,
  fish_audio_api_key_length: 12,
  fish_audio_model: 's2.1-pro-free',
  image_resolution: '2K',
  image_aspect_ratio: '16:9',
  max_description_workers: 5,
  max_image_workers: 4,
  mineru_token_length: 0,
  baidu_api_key_length: 0,
  output_language: 'zh',
  description_generation_mode: 'streaming',
  enable_text_reasoning: false,
  text_thinking_budget: 1024,
  enable_image_reasoning: false,
  image_thinking_budget: 1024,
  enable_image_quality_control: false,
  text_api_key_length: 0,
  image_api_key_length: 0,
  image_caption_api_key_length: 0,
  openai_oauth_connected: false,
};

describe('Settings Fish Audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    endpointMocks.getSettings.mockResolvedValue({ data: settings });
    endpointMocks.getFishAudioVoices.mockResolvedValue({
      data: {
        voices: [{
          id: 'voice-host-001',
          title: '品牌主讲人',
          state: 'created',
          languages: ['zh'],
          visibility: 'private',
        }],
      },
    });
    endpointMocks.verifyFishAudio.mockResolvedValue({
      data: { connected: true, model: 's2.1-pro-free', voice_count_sampled: 1 },
    });
    endpointMocks.createFishAudioVoice.mockResolvedValue({
      data: {
        id: 'voice-new-002',
        title: '产品专家',
        state: 'created',
        languages: ['zh'],
        visibility: 'private',
      },
    });
  });

  it('tests an unsaved key and loads saved voices', async () => {
    render(<MemoryRouter><Settings embedded /></MemoryRouter>);

    expect(await screen.findByText('品牌主讲人', undefined, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText('s2.1-pro-free')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fish Audio API Key'), { target: { value: 'fish-new-key' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(endpointMocks.verifyFishAudio).toHaveBeenCalledWith('fish-new-key'));
    expect(endpointMocks.getFishAudioVoices).toHaveBeenCalledWith({ scope: 'public', sortBy: 'task_count' });
  }, 15_000);

  it('shows public community voices as reusable role assets', async () => {
    endpointMocks.getFishAudioVoices.mockResolvedValueOnce({
      data: {
        voices: [{
          id: 'public-narrator',
          title: '社区旁白',
          state: 'created',
          languages: ['zh'],
          visibility: 'public',
          author: 'Fish Audio',
          task_count: 99,
        }],
      },
    });
    endpointMocks.updateSettings.mockImplementation(async (payload) => ({ data: { ...settings, ...payload } }));

    render(<MemoryRouter><Settings embedded /></MemoryRouter>);

    expect(await screen.findByText('社区旁白')).toBeInTheDocument();
    expect(screen.getAllByText('官方社区').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /删除声音 社区旁白/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存为角色' }));

    await waitFor(() => expect(endpointMocks.updateSettings).toHaveBeenCalledWith({
      fish_audio_voice_assets: [expect.objectContaining({ name: '社区旁白', voice: 'public-narrator' })],
    }));
  });

  it('creates an authorized private clone from three audio samples', async () => {
    endpointMocks.getFishAudioVoices
      .mockResolvedValueOnce({ data: { voices: [{ id: 'voice-host-001', title: '品牌主讲人', state: 'created', languages: ['zh'], visibility: 'private' }] } })
      .mockResolvedValue({ data: { voices: [{ id: 'voice-new-002', title: '产品专家', state: 'created', languages: ['zh'], visibility: 'private' }] } });
    render(<MemoryRouter><Settings embedded /></MemoryRouter>);
    await screen.findByText('品牌主讲人');
    fireEvent.click(screen.getByRole('button', { name: '克隆声音' }));

    fireEvent.change(screen.getByLabelText('声音名称'), { target: { value: '产品专家' } });
    const samples = [
      new File(['one'], 'sample-1.mp3', { type: 'audio/mpeg' }),
      new File(['two'], 'sample-2.mp3', { type: 'audio/mpeg' }),
      new File(['three'], 'sample-3.mp3', { type: 'audio/mpeg' }),
    ];
    fireEvent.change(screen.getByLabelText('声音样本'), { target: { files: samples } });
    fireEvent.click(screen.getByLabelText('我确认已获得该声音的使用授权'));
    fireEvent.click(screen.getByRole('button', { name: '创建私有声音' }));

    await waitFor(() => expect(endpointMocks.createFishAudioVoice).toHaveBeenCalled());
    expect(endpointMocks.createFishAudioVoice.mock.calls[0][0]).toMatchObject({
      title: '产品专家',
      files: samples,
      consentConfirmed: true,
    });
    expect(await screen.findByText('产品专家')).toBeInTheDocument();
  }, 15_000);

  it('edits and saves reusable voice asset metadata', async () => {
    endpointMocks.getSettings.mockResolvedValueOnce({ data: {
      ...settings,
      fish_audio_voice_assets: [{
        id: 'asset-host', name: '品牌主讲人', voice: 'voice-host-001', avatar: '', rate: '+0%',
        language: 'zh', default_emotion: 'warm', use_case: '通用旁白', synthetic: false,
      }],
    } });
    endpointMocks.updateSettings.mockImplementation(async (payload) => ({ data: { ...settings, ...payload } }));
    render(<MemoryRouter><Settings embedded /></MemoryRouter>);

    fireEvent.change(await screen.findByLabelText('角色头像 asset-host'), { target: { value: '🎙️' } });
    fireEvent.change(screen.getByLabelText('默认语速 asset-host'), { target: { value: '+10%' } });
    fireEvent.change(screen.getByLabelText('默认语气 asset-host'), { target: { value: 'confident' } });
    const assetSection = screen.getByText('人物声线资产库').parentElement!;
    fireEvent.click(within(assetSection).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(endpointMocks.updateSettings).toHaveBeenCalledWith({
      fish_audio_voice_assets: [expect.objectContaining({
        id: 'asset-host', avatar: '🎙️', rate: '+10%', default_emotion: 'confident',
      })],
    }));
  });
});
