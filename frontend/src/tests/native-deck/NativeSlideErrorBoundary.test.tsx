import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeSlideErrorBoundary } from '@/components/native-deck/NativeSlideRenderer'

function BrokenTheme(): JSX.Element {
  throw new Error('theme exploded')
}

function WorkingTheme() {
  return <div>主题已恢复</div>
}

describe('NativeSlideErrorBoundary', () => {
  it('contains a theme crash inside the slide', () => {
    render(
      <NativeSlideErrorBoundary layout="theme02_page007">
        <BrokenTheme />
      </NativeSlideErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('页面渲染失败')
    expect(screen.getByRole('alert')).toHaveTextContent('theme02_page007')
  })

  it('retries the same layout after its props change', () => {
    const { rerender } = render(
      <NativeSlideErrorBoundary layout="theme02_page007" resetKey="bad">
        <BrokenTheme />
      </NativeSlideErrorBoundary>,
    )

    rerender(
      <NativeSlideErrorBoundary layout="theme02_page007" resetKey="fixed">
        <WorkingTheme />
      </NativeSlideErrorBoundary>,
    )

    expect(screen.getByText('主题已恢复')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
