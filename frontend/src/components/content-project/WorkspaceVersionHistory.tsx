import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { listWorkspaceVersions, restoreWorkspaceVersion } from '@/api/endpoints';
import type { ContentWorkspaceKind, WorkspaceVersion } from '@/types';

export function WorkspaceVersionHistory({
  projectId,
  kind,
  revision,
  onRestored,
}: {
  projectId: string;
  kind: ContentWorkspaceKind;
  revision: number;
  onRestored?: () => void;
}) {
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const response = await listWorkspaceVersions(projectId, kind);
      setVersions(response.data?.versions || []);
    } catch (cause: any) {
      setError(cause?.response?.data?.error?.message || cause.message);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, kind, revision]);

  const restore = async (version: WorkspaceVersion) => {
    setBusy(version.id);
    try {
      await restoreWorkspaceVersion(projectId, kind, version.id, revision);
      await load();
      onRestored?.();
    } catch (cause: any) {
      setError(cause?.response?.data?.error?.message || cause.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="mt-6 border-t border-[var(--app-border)] pt-4 text-left">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <History size={16} aria-hidden="true" />
        版本历史
      </summary>
      {error && <p role="alert" className="mt-3 text-xs text-[var(--app-error)]">{error}</p>}
      <ol className="mt-3 divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span>
              R{version.revision}
              <span className="ml-2 text-xs text-[var(--app-text-tertiary)]">{version.source_type}</span>
            </span>
            {version.revision === revision ? (
              <span className="text-xs text-[var(--app-text-tertiary)]">当前版本</span>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void restore(version)}
                className="text-xs text-[var(--app-accent)] disabled:opacity-50"
              >
                {busy === version.id ? '恢复中…' : '恢复为新版本'}
              </button>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
