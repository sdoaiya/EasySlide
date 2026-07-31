import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncReviewSheet } from '@/components/content-project/SyncReviewSheet';

const endpointMocks = vi.hoisted(() => ({
  listContentSyncProposals: vi.fn(),
  applyContentSyncProposal: vi.fn(),
  rejectContentSyncProposal: vi.fn(),
}));

vi.mock('@/api/endpoints', () => endpointMocks);

const proposal = {
  id: 'proposal-1',
  project_id: 'project-1',
  source_kind: 'spine',
  target_kind: 'video',
  source_revision: 2,
  target_base_revision: 3,
  diff: {
    schema_version: 1,
    items: [
      {
        item_id: 'title',
        path: '/title',
        operation: 'replace',
        change_type: 'content',
        before: '旧标题',
        after: '新标题',
      },
      {
        item_id: 'ratio',
        path: '/aspect_ratio',
        operation: 'replace',
        change_type: 'content',
        before: '16:9',
        after: '9:16',
      },
    ],
  },
  resolution: {
    applied_item_ids: [],
    rejected_item_ids: [],
    target_revision: 3,
    applications: [],
  },
  status: 'pending',
} as const;

describe('SyncReviewSheet', () => {
  beforeEach(() => {
    endpointMocks.listContentSyncProposals
      .mockReset()
      .mockResolvedValue({ data: { proposals: [proposal] } });
    endpointMocks.applyContentSyncProposal.mockReset().mockResolvedValue({
      data: { proposal: { ...proposal, status: 'partially_applied' } },
    });
    endpointMocks.rejectContentSyncProposal.mockReset();
  });

  it('shows before and after values but applies only explicitly selected items', async () => {
    const user = userEvent.setup();
    render(
      <SyncReviewSheet
        projectId="project-1"
        open
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('旧标题')).toBeInTheDocument();
    expect(screen.getByText('新标题')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: '应用所选' });
    expect(apply).toBeDisabled();
    expect(endpointMocks.applyContentSyncProposal).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: '选择差异 /title' }));
    await user.click(apply);

    await waitFor(() => expect(endpointMocks.applyContentSyncProposal).toHaveBeenCalledWith(
      'project-1',
      'proposal-1',
      3,
      ['title'],
    ));
    expect(endpointMocks.applyContentSyncProposal).not.toHaveBeenCalledWith(
      'project-1',
      'proposal-1',
      3,
      expect.arrayContaining(['ratio']),
    );
  });
});
