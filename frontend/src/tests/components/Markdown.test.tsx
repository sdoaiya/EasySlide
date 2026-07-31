/**
 * Markdown 组件测试 - 验证 LaTeX 公式渲染
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '@/components/shared/Markdown'

describe('Markdown Component', () => {
  it('renders plain text', () => {
    render(<Markdown>Hello World</Markdown>)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders markdown bold text', () => {
    render(<Markdown>**bold text**</Markdown>)
    const bold = screen.getByText('bold text')
    expect(bold.tagName).toBe('STRONG')
  })

  it('renders markdown links', () => {
    render(<Markdown>[link](https://example.com)</Markdown>)
    const link = screen.getByText('link')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveClass('text-[var(--app-link)]')
    expect(link).not.toHaveClass('text-blue-600')
  })

  it('renders markdown images', () => {
    render(<Markdown>![alt text](https://example.com/img.png)</Markdown>)
    const img = screen.getByAltText('alt text')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/img.png')
  })

  it('resolves local PDF images through the desktop backend', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} })
    vi.resetModules()

    try {
      const { getImageUrl } = await import('@/api/client')
      expect(getImageUrl('/files/mineru/extract123/images/chart.png')).toBe(
        'http://127.0.0.1:5011/files/mineru/extract123/images/chart.png'
      )
    } finally {
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined })
      vi.resetModules()
    }
  })
  it('renders inline LaTeX formula with $ delimiters', () => {
    const { container } = render(<Markdown>The formula $E = mc^2$ is famous</Markdown>)
    // KaTeX renders math into spans with class "katex"
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThan(0)
  })

  it('renders block LaTeX formula with $$ delimiters', () => {
    const { container } = render(
      <Markdown>{`Before

$$x^2 + y^2 = z^2$$

After`}</Markdown>
    )
    // Block math should render with katex class (katex-display wraps it)
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThan(0)
  })

  it('renders multiple LaTeX formulas in same text', () => {
    const { container } = render(
      <Markdown>Given $a^2 + b^2 = c^2$ and $E = mc^2$, we can derive</Markdown>
    )
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBe(2)
  })

  it('renders GFM tables', () => {
    const tableMarkdown = `| Header | Value |
| --- | --- |
| Row 1 | Data 1 |`

    render(<Markdown>{tableMarkdown}</Markdown>)
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Data 1')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Markdown className="custom-class">text</Markdown>)
    expect(container.firstChild).toHaveClass('markdown-content')
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders mixed markdown and LaTeX', () => {
    const { container } = render(
      <Markdown>{`**Bold** and $x^2$ together`}</Markdown>
    )
    expect(screen.getByText('Bold')).toBeInTheDocument()
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThan(0)
  })

  it('renders inline LaTeX with \\(...\\) delimiters', () => {
    const { container } = render(
      <Markdown>{`The formula \\(E = mc^2\\) is famous`}</Markdown>
    )
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThan(0)
  })

  it('renders block LaTeX with \\[...\\] delimiters', () => {
    const { container } = render(
      <Markdown>{`Before

\\[x^2 + y^2 = z^2\\]

After`}</Markdown>
    )
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThan(0)
  })

  it('renders mixed delimiter formats', () => {
    const { container } = render(
      <Markdown>{`Inline $a^2$ and \\(b^2\\) with block:

$$c^2$$

and

\\[d^2\\]`}</Markdown>
    )
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBe(4)
  })
})
