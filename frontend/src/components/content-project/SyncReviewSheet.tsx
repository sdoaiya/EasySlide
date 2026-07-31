import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/shared';
import {
  applyContentSyncProposal,
  listContentSyncProposals,
  rejectContentSyncProposal,
} from '@/api/endpoints';
import type { ContentSyncProposal } from '@/types';

const formatValue = (value: unknown) => (
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)
);

export function SyncReviewSheet({
  projectId,
  open,
  onClose,
  onChanged,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [proposals, setProposals] = useState<ContentSyncProposal[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setProposals([]);
    try {
      const response = await listContentSyncProposals(projectId);
      setProposals((response.data?.proposals || []).filter(
        (item) => item.status === 'pending' || item.status === 'partially_applied',
      ));
    } catch (cause: any) {
      setError(cause?.response?.data?.error?.message || cause.message);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  const toggle = (proposalId: string, itemId: string) => {
    setSelected((current) => {
      const values = current[proposalId] || [];
      return {
        ...current,
        [proposalId]: values.includes(itemId)
          ? values.filter((value) => value !== itemId)
          : [...values, itemId],
      };
    });
  };

  const resolve = async (proposal: ContentSyncProposal, action: 'apply' | 'reject') => {
    const itemIds = selected[proposal.id] || [];
    if (!itemIds.length) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'apply') {
        await applyContentSyncProposal(
          projectId,
          proposal.id,
          proposal.resolution.target_revision,
          itemIds,
        );
      } else {
        await rejectContentSyncProposal(projectId, proposal.id, itemIds);
      }
      setSelected((current) => ({ ...current, [proposal.id]: [] }));
      await load();
      onChanged?.();
    } catch (cause: any) {
      setError(cause?.response?.data?.error?.message || cause.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="同步候选审查" size="xl">
      <p className="mb-5 text-sm text-[var(--app-text-secondary)]">
        只会应用明确勾选的差异，未选择内容保持不变。
      </p>
      {error && <p role="alert" className="mb-4 text-sm text-[var(--app-error)]">{error}</p>}
      {!proposals.length ? (
        <p className="border-y border-[var(--app-border)] py-8 text-center text-sm text-[var(--app-text-secondary)]">
          暂无待审查同步候选
        </p>
      ) : (
        <div className="space-y-6">
          {proposals.map((proposal) => {
            const resolved = new Set([
              ...proposal.resolution.applied_item_ids,
              ...proposal.resolution.rejected_item_ids,
            ]);
            const items = proposal.diff.items.filter((item) => !resolved.has(item.item_id));
            const selection = selected[proposal.id] || [];
            return (
              <section key={proposal.id} className="border-t border-[var(--app-border)] pt-4">
                <header className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {proposal.source_kind} → {proposal.target_kind}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--app-text-tertiary)]">
                      来源 R{proposal.source_revision} · 目标 R{proposal.resolution.target_revision}
                    </p>
                  </div>
                  {proposal.reason && (
                    <span className="text-xs text-[var(--app-text-secondary)]">{proposal.reason}</span>
                  )}
                </header>
                <div className="divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
                  {items.map((item) => (
                    <label key={item.item_id} className="grid cursor-pointer grid-cols-[20px_1fr_1fr] gap-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selection.includes(item.item_id)}
                        onChange={() => toggle(proposal.id, item.item_id)}
                        aria-label={`选择差异 ${item.path}`}
                      />
                      <span>
                        <span className="block text-xs text-[var(--app-text-tertiary)]">{item.path} · 修改前</span>
                        <span className="mt-1 block whitespace-pre-wrap break-words">{formatValue(item.before)}</span>
                      </span>
                      <span>
                        <span className="block text-xs text-[var(--app-text-tertiary)]">修改后</span>
                        <span className="mt-1 block whitespace-pre-wrap break-words">{formatValue(item.after)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!selection.length || busy}
                    onClick={() => void resolve(proposal, 'reject')}
                  >
                    拒绝所选
                  </Button>
                  <Button
                    size="sm"
                    loading={busy}
                    disabled={!selection.length}
                    onClick={() => void resolve(proposal, 'apply')}
                  >
                    应用所选
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
