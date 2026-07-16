import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFromUrl } from '@/utils';

describe('downloadFromUrl', () => {
  afterEach(() => {
    delete (window as any).electronAPI;
    vi.restoreAllMocks();
  });

  it('uses desktop saveDownload when available', async () => {
    const saveDownload = vi.fn().mockResolvedValue('D:/exports/demo.pptx');
    (window as any).electronAPI = { saveDownload };

    await downloadFromUrl('/files/project/exports/demo.pptx', 'demo.pptx');

    expect(saveDownload).toHaveBeenCalledWith('/files/project/exports/demo.pptx', 'demo.pptx');
  });

  it('falls back to browser anchor download', async () => {
    const link = document.createElement('a');
    const click = vi.spyOn(link, 'click').mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');
    vi.spyOn(document, 'createElement').mockReturnValue(link);

    await downloadFromUrl('/files/project/exports/demo.pdf', 'demo.pdf');

    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
  });
});
