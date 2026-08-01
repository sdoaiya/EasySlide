import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NarrationInspector } from '@/components/narration/NarrationInspector';

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
});
