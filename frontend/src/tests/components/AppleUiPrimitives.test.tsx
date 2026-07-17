import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { Textarea } from '@/components/shared/Textarea';

describe('Apple-inspired UI primitives', () => {
  it('uses one focus treatment for text inputs', () => {
    render(<Input aria-label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' });

    expect(input).toHaveClass('focus-visible:ring-2');
    expect(input).not.toHaveClass('focus:ring-2');
    expect(input).not.toHaveClass('focus:border-transparent');
  });

  it('uses the same single focus treatment for textareas', () => {
    render(<Textarea aria-label="Summary" />);
    const textarea = screen.getByRole('textbox', { name: 'Summary' });

    expect(textarea).toHaveClass('focus-visible:ring-2');
    expect(textarea).not.toHaveClass('focus:border-cyan-500');
  });

  it('keeps cards quiet without hover lift', () => {
    render(<Card hoverable>Project</Card>);
    const card = screen.getByText('Project');

    expect(card).toHaveClass('rounded-[var(--app-radius-card)]');
    expect(card).not.toHaveClass('hover:-translate-y-1');
  });
});
