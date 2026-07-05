import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('EasySlide index SEO shell', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('matches the current ezppt-style SEO metadata and no-script fallback', () => {
    expect(html).toContain('EasySlide is an AI presentation workspace for generating, editing, refining, and exporting polished slide decks');
    expect(html).toContain('AI presentation maker, AI slide generator, AI PPT generator');
    expect(html).toContain('name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"');
    expect(html).toContain('property="og:title" content="EasySlide | AI Presentation Generator and Workspace"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('id="easyslide-structured-data"');
    expect(html).toContain('"@type": "SoftwareApplication"');
    expect(html).toContain('Prompt to slides');
    expect(html).toContain('<noscript>');
    expect(html).toContain('Start from a prompt, an outline, a description, or an existing PDF / PPTX');
  });
});
