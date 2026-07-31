import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('ExportTasksPanel downloads', () => {
  it('uses the desktop save API instead of only opening a browser link', () => {
    const panel = source('src/components/shared/ExportTasksPanel.tsx');

    expect(panel).toContain('electronAPI?.saveDownload');
  });

  it('keeps podcast transcript and cover sidecars downloadable from the task center', () => {
    const panel = source('src/components/shared/ExportTasksPanel.tsx');

    expect(panel).toContain('task.progress?.sidecars');
    expect(panel).toContain("kind === 'transcript'");
    expect(panel).toContain("kind === 'cover_manifest'");
  });

  it('saves desktop downloads to the configured export directory', () => {
    const main = source('../desktop/main.js');
    const builder = source('../desktop/electron-builder.yml');

    expect(main).toContain("ipcMain.handle('get-export-dir'");
    expect(main).toContain("ipcMain.handle('choose-export-dir'");
    expect(main).toContain('getConfiguredExportDir()');
    expect(main).not.toContain('dialog.showSaveDialog');
    expect(builder).toContain('  - download.js');
  });

  it('shows export directory controls in settings', () => {
    const settings = source('src/pages/Settings.tsx');

    expect(settings).toContain('chooseExportDir');
    expect(settings).toContain('openExportDir');
    expect(settings).toContain('导出路径');
  });
});
