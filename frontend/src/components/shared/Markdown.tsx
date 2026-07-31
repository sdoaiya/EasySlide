import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { getImageUrl } from '@/api/client';

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Preprocess LaTeX delimiters that remark-math doesn't support natively.
 * Converts \[...\] to $$...$$ and \(...\) to $...$
 */
function preprocessMarkdown(content: string): string {
  // Convert \[...\] block math to $$...$$
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`);
  // Convert \(...\) inline math to $...$
  content = content.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
  // 表格前必须有空行才能被解析，自动补空行
  content = content.replace(/([^\n])\n(\|[^\n]+\|\s*\n\|[\s:|-]+\|\s*\n)/g, '$1\n\n$2');
  return content;
}

export const Markdown: React.FC<MarkdownProps> = ({ children, className = '' }) => {
  const processedContent = useMemo(() => preprocessMarkdown(children), [children]);

  // Create sanitize schema that allows KaTeX classes and spans
  const sanitizeSchema = useMemo(() => ({
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      span: [...(defaultSchema.attributes?.span || []), 'className', 'style'],
      div: [...(defaultSchema.attributes?.div || []), 'className'],
    },
    tagNames: [...(defaultSchema.tagNames || []), 'math', 'semantics', 'mrow', 'msup', 'mi', 'mn', 'mo'],
  }), []);

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
        // 自定义渲染规则
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--app-link)] underline hover:text-[var(--app-accent-hover)]">
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <img
            src={getImageUrl(src)}
            alt={alt || ''}
            className="my-2 h-auto max-h-36 w-auto max-w-48 rounded-[var(--app-radius-card)]"
            loading="lazy"
          />
        ),
        h1: ({ children }) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold mb-2">{children}</h3>,
        code: ({ className, children }) => {
          const isInline = !className;
          return isInline ? (
            <code className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-1 py-0.5 font-mono text-sm">{children}</code>
          ) : (
            <code className={`${className} block overflow-x-auto rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] p-2 font-mono text-sm`}>
              {children}
            </code>
          );
        },
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        br: () => <br />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-[var(--app-border)]">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[var(--app-surface-muted)]">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-[var(--app-border)]">{children}</tr>,
        th: ({ children }) => (
          <th className="border border-[var(--app-border)] px-4 py-2 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--app-border)] px-4 py-2">
            {children}
          </td>
        ),
      }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
