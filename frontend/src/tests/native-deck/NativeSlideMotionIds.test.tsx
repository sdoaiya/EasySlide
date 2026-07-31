import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeSlideRenderer } from '@/components/native-deck/NativeSlideRenderer'

describe('NativeSlideRenderer motion ids', () => {
  it('annotates rendered native content from stable prop paths', async () => {
    render(<NativeSlideRenderer slide={{
      pageId: 'page-1',
      layout: 'core01_cover',
      props: { title: '稳定标题', subtitle: '稳定副标题' },
    }} />)

    await waitFor(() => expect(screen.getByText('稳定标题')).toHaveAttribute('data-motion-id', 'title'))
    expect(screen.getByText('稳定副标题')).toHaveAttribute('data-motion-id', 'subtitle')
  })
})
