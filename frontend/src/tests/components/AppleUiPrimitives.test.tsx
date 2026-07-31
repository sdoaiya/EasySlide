import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { Pagination } from '@/components/shared/Pagination';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Textarea } from '@/components/shared/Textarea';

describe('Apple-inspired UI primitives', () => {
  it('uses one focus treatment for text inputs', () => {
    render(<Input aria-label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' });

    expect(input).toHaveClass('focus-visible:border-[var(--app-accent)]');
    expect(input).not.toHaveClass('focus-visible:ring-2');
    expect(input).not.toHaveClass('focus:ring-2');
    expect(input).not.toHaveClass('focus:border-transparent');
    expect(input).not.toHaveClass('shadow-sm');
  });

  it('uses the same single focus treatment for textareas', () => {
    render(<Textarea aria-label="Summary" />);
    const textarea = screen.getByRole('textbox', { name: 'Summary' });

    expect(textarea).toHaveClass('focus-visible:border-[var(--app-accent)]');
    expect(textarea).not.toHaveClass('focus-visible:ring-2');
    expect(textarea).not.toHaveClass('focus:border-cyan-500');
    expect(textarea).not.toHaveClass('shadow-sm');
  });

  it('keeps cards quiet without hover lift', () => {
    render(<Card hoverable>Project</Card>);
    const card = screen.getByText('Project');

    expect(card).toHaveClass('rounded-[var(--app-radius-card)]');
    expect(card).not.toHaveClass('hover:-translate-y-1');
  });

  it('uses editorial tokens for shared status badges', () => {
    render(<StatusBadge status="COMPLETED" />);
    const badge = screen.getByTestId('status-badge');

    expect(badge).toHaveClass('text-[var(--app-index-green)]');
    expect(badge).not.toHaveClass('text-green-600');
  });

  it('uses the primary action token for pagination selection', () => {
    render(<Pagination currentPage={2} totalPages={3} onPageChange={() => {}} />);
    const currentPage = screen.getByRole('button', { name: '2' });

    expect(currentPage).toHaveClass('bg-[var(--app-primary-action)]');
    expect(currentPage).not.toHaveClass('bg-blue-600');
  });
});
