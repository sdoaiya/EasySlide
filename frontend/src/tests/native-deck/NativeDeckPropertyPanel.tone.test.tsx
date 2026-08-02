import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeDeckPropertyPanel, type NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NarrationPreferences } from '@/types'

const contract: NativeLayoutContract = {
  layout: 'theme01_page040',
  theme: 'theme01',
  label: '阶段性策略路线图',
  roles: ['process'],
  copyKeys: ['title'],
  copyBudgets: {},
  propShapes: { title: 'string' },
  arrayMeta: [],
  mediaSlots: [],
}

const slide = {
  pageId: 'page-1',
  layout: contract.layout,
  props: { title: '路线图' },
}

describe('NativeDeckPropertyPanel 逐页语气覆盖', () => {
  it('renders the tone override section only when the callback is provided', () => {
    render(
      <NativeDeckPropertyPanel
        slide={slide}
        contract={contract}
        contracts={[contract]}
        errors={{}}
        onChange={vi.fn()}
        onLayoutChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('语气覆盖')).not.toBeInTheDocument()
  })

  it('edits per-page tone overrides with follow-global defaults', () => {
    function Harness() {
      const [overrides, setOverrides] = useState<Partial<NarrationPreferences['emotion_director']>>({ pace: 'slow' })
      return (
        <NativeDeckPropertyPanel
          slide={slide}
          contract={contract}
          contracts={[contract]}
          errors={{}}
          onChange={vi.fn()}
          onLayoutChange={vi.fn()}
          pageNarrationOverrides={overrides}
          onPageNarrationOverridesChange={setOverrides}
        />
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByText('语气覆盖'))
    expect(screen.getByLabelText('语气覆盖语速')).toHaveValue('slow')
    expect(screen.getByLabelText('语气覆盖强度')).toHaveValue('')

    // 修改强度：写入部分覆盖
    fireEvent.change(screen.getByLabelText('语气覆盖强度'), { target: { value: 'strong' } })
    expect(screen.getByLabelText('语气覆盖强度')).toHaveValue('strong')

    // 语速回到跟随全局：删除该字段
    fireEvent.change(screen.getByLabelText('语气覆盖语速'), { target: { value: '' } })
    expect(screen.getByLabelText('语气覆盖语速')).toHaveValue('')

    // 情绪下拉可用
    fireEvent.change(screen.getByLabelText('语气覆盖情绪'), { target: { value: 'warm' } })
    expect(screen.getByLabelText('语气覆盖情绪')).toHaveValue('warm')
  })
})
