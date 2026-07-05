import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('ExportTasksPanel downloads', () => {
  it('uses the desktop save API instead of only opening a browser link', () => {
    const panel = source('src/components/shared/ExportTasksPanel.tsx');

    expect(panel).toContain('electronAPI?.saveDownload');
  });
});
