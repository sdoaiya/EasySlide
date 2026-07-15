import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeDeckCanvas } from '@/components/native-deck/NativeDeckCanvas'
import type { NativeSlideSpec } from '@/native-deck/types'

const slide: NativeSlideSpec = {
  pageId: 'page-1',
  layout: 'core01-cover',
  props: {
    title: '演示测试',
    __animation: { elementEnter: 'fade', elementTrigger: 'click', advanceAfter: 1 },
  },
}

describe('NativeDeckCanvas', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for the click-triggered animation before starting auto advance', () => {
    vi.useFakeTimers()
    const onNext = vi.fn()
    const { container } = render(
      <NativeDeckCanvas slide={slide} pageIndex={0} pageCount={2} presenting onNext={onNext} />,
    )

    act(() => { vi.advanceTimersByTime(1000) })
    expect(onNext).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.native-slide')!)
    act(() => { vi.advanceTimersByTime(999) })
    expect(onNext).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
