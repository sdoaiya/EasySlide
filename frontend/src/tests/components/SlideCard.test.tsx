import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlideCard } from '@/components/preview/SlideCard';
import type { Page } from '@/types';

const pages = Array.from({ length: 20 }, (_, index) => ({
  id: `ppt-page-${index + 1}`,
  page_id: `ppt-page-${index + 1}`,
  order_index: index,
  status: 'COMPLETED',
  generated_image_path: `/files/ppt-page-${index + 1}.png`,
  outline_content: { title: `第 ${index + 1} 页` },
})) as Page[];

function TwentyPageRail({ selectedIndex }: { selectedIndex: number }) {
  return <div>{pages.map((page, index) => (
    <SlideCard
      key={page.id}
      page={page}
      index={index}
      isSelected={selectedIndex === index}
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      aspectRatio="16:9"
    />
  ))}</div>;
}

describe('SlideCard', () => {
  it('keeps 20-page rail selection local instead of rerendering every slide card', () => {
    const { rerender } = render(<TwentyPageRail selectedIndex={0} />);

    const untouched = screen.getByTestId('ppt-slide-card-ppt-page-10');
    expect(untouched).toHaveAttribute('data-render-count', '1');

    rerender(<TwentyPageRail selectedIndex={19} />);

    expect(screen.getByTestId('ppt-slide-card-ppt-page-1')).toHaveAttribute('data-render-count', '2');
    expect(screen.getByTestId('ppt-slide-card-ppt-page-20')).toHaveAttribute('data-render-count', '2');
    expect(untouched).toHaveAttribute('data-render-count', '1');
  });

  it('shows a paused badge instead of a generating skeleton for a paused batch page', () => {
    const page = {
      ...pages[0],
      status: 'GENERATING',
      generated_image_path: undefined,
    } as Page;

    render(
      <SlideCard
        page={page}
        index={0}
        isSelected
        isGenerating
        isPaused
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('已暂停')).toBeInTheDocument();
    expect(screen.getByText('未生成')).toBeInTheDocument();
  });
});
