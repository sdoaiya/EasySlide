import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeImageSettingsDialog } from '@/components/native-deck/NativeImageSettingsDialog'

describe('NativeImageSettingsDialog', () => {
  it('saves density, style, custom prompt, and per-page counts', () => {
    const onSave = vi.fn()
    render(
      <NativeImageSettingsDialog
        open
        settings={{ density: 'standard', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: {} }}
        pages={[
          { pageId: 'page-1', title: '封面', maxImages: 2 },
          { pageId: 'page-2', title: '方案', maxImages: 3 },
        ]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('图片生成密度'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('图片风格'), { target: { value: '3d' } })
    fireEvent.change(screen.getByLabelText('图片主体构图'), { target: { value: 'text-left' } })
    fireEvent.change(screen.getByLabelText('补充生成要求'), { target: { value: '主体靠右，左侧留白' } })
    fireEvent.change(screen.getByLabelText('封面图片数量'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('方案图片数量'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存图片生成设置' }))

    expect(onSave).toHaveBeenCalledWith({
      density: 'custom',
      style: '3d',
      composition: 'text-left',
      custom_prompt: '主体靠右，左侧留白',
      custom_counts: { 'page-1': 2, 'page-2': 1 },
    })
  })
})
