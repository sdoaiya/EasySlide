import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceVersionHistory } from '@/components/content-project/WorkspaceVersionHistory';

const endpointMocks = vi.hoisted(() => ({
  listWorkspaceVersions: vi.fn(),
  restoreWorkspaceVersion: vi.fn(),
}));

vi.mock('@/api/endpoints', () => endpointMocks);

beforeEach(() => {
  endpointMocks.listWorkspaceVersions.mockReset().mockResolvedValue({
    data: {
      workspace: {},
      versions: [
        { id: 'v2', revision: 2, source_type: 'manual', document: {}, settings: {} },
        { id: 'v1', revision: 1, source_type: 'sync', document: {}, settings: {} },
      ],
    },
  });
  endpointMocks.restoreWorkspaceVersion.mockReset().mockResolvedValue({ data: {} });
});

it('restores a historical workspace version using the current base revision', async () => {
  const user = userEvent.setup();
  render(
    <WorkspaceVersionHistory
      projectId="project-1"
      kind="podcast"
      revision={2}
    />,
  );

  await user.click(screen.getByText('版本历史'));
  await user.click(await screen.findByRole('button', { name: '恢复为新版本' }));

  await waitFor(() => expect(endpointMocks.restoreWorkspaceVersion).toHaveBeenCalledWith(
    'project-1',
    'podcast',
    'v1',
    2,
  ));
});
