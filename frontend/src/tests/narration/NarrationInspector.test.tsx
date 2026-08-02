import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NarrationInspector } from '@/components/narration/NarrationInspector';

vi.mock('@/api/client', () => ({
  getStaticAssetUrl: (path: string) => path,
  getImageUrl: (path: string) => path,
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: {
          voices: [
            { voice_id: 'edge:zh-CN-XiaoxiaoNeural', provider: 'edge', upstream_id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（中文女声）' },
            { voice_id: 'edge:zh-CN-YunxiNeural', provider: 'edge', upstream_id: 'zh-CN-YunxiNeural', name: '云希（中文男声）' },
          ],
        },
      },
    }),
  },
}));

describe('NarrationInspector', () => {
  it('generates from page content when the page has no confirmed narration', () => {
    const onGenerate = vi.fn();
    render(
      <NarrationInspector
        versions={[]}
        onGenerate={onGenerate}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    // 候选为一级标签；AI 优化在独立标签内
    fireEvent.click(screen.getByRole('radio', { name: 'AI 优化' }));
    expect(screen.getByLabelText('AI 处理方式')).toHaveValue('generate');
    fireEvent.click(screen.getByRole('button', { name: '生成候选' }));
    expect(onGenerate).toHaveBeenCalledWith('generate', '');
  });

  it('shows candidates first with stable IDs', () => {
    render(
      <NarrationInspector
        versions={[{
          id: 'candidate-1',
          page_id: 'page-1',
          version_number: 2,
          mode: 'single',
          language: 'zh-CN',
          text: '候选正文',
          segments: [],
          source_type: 'ai_polished',
          status: 'candidate',
          ai_operation: 'polish',
          ai_config: {
            generation_config: {
              style_profile_id: 'script.conversational.v1',
              expressiveness_id: 'expression.warm.v1',
              voice_profile_id: 'fish:voice-dd43b30d',
            },
            provider: 'openai',
            model_id: 'gpt-5',
            prompt_version: 'narration-candidate-v2',
          },
          content_hash: 'hash',
          created_by: 'ai',
        }]}
        onGenerate={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByText('自然润色')).toBeInTheDocument();
    expect(screen.getByText('候选正文')).toBeInTheDocument();
    expect(screen.getByText('script.conversational.v1')).toBeInTheDocument();
    expect(screen.getByText('fish:voice-dd43b30d')).toBeInTheDocument();
    expect(screen.getByTitle('openai · gpt-5')).toBeInTheDocument();
  });

  it('falls back to legacy.unknown for missing IDs', () => {
    render(
      <NarrationInspector
        versions={[{
          id: 'legacy-candidate',
          page_id: 'page-1',
          version_number: 1,
          mode: 'single',
          language: 'zh-CN',
          text: '旧候选',
          segments: [],
          source_type: 'ai_generated',
          status: 'candidate',
          ai_operation: 'generate',
          content_hash: 'hash',
          created_by: 'ai',
        }]}
        onGenerate={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getAllByText('legacy.unknown').length).toBeGreaterThanOrEqual(3);
  });

  it('selects a catalog voice instead of accepting a hand-written ID', async () => {
    const onPreview = vi.fn();
    render(
      <NarrationInspector
        versions={[]}
        language="zh-CN"
        onGenerate={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onPreview={onPreview}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '试听' }));
    await screen.findByText('晓晓（中文女声）');
    fireEvent.click(screen.getByRole('button', { name: '音色' }));
    fireEvent.click(screen.getByText('云希（中文男声）'));
    fireEvent.click(screen.getByRole('button', { name: '试听当前草稿' }));

    await waitFor(() => expect(onPreview).toHaveBeenCalledWith('edge', 'zh-CN-YunxiNeural'));
    expect(screen.queryByLabelText('试听音色')).not.toBeInTheDocument();
  });
});
