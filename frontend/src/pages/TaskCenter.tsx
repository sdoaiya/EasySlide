import { ClipboardList } from 'lucide-react';
import { ExportTasksPanel } from '@/components/shared';

export function TaskCenter() {
  return (
    <main className="min-h-screen bg-[var(--app-background)] px-6 py-8 lg:ml-[216px]">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3 border-b border-[var(--app-border)] pb-4">
          <ClipboardList size={20} aria-hidden="true" />
          <h1 className="text-xl font-semibold">任务中心</h1>
        </div>
        <ExportTasksPanel className="mt-6" />
      </div>
    </main>
  );
}
