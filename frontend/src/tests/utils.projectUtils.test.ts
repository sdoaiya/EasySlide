import { beforeEach, describe, expect, test } from 'vitest';
import { getProjectRoute, getStatusColor, getStatusText, parseMarkdownPages } from '@/utils/projectUtils';

describe('getProjectRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const nativeProject = (overrides: Record<string, unknown> = {}) => ({
    project_id: 'native-1',
    render_mode: 'native',
    status: 'DESCRIPTIONS_GENERATED',
    pages: [{
      page_id: 'page-1',
      order_index: 0,
      outline_content: { title: 'Title', points: [] },
      description_content: { text: 'Description' },
      status: 'DESCRIPTION_GENERATED',
    }],
    ...overrides,
  } as any);

  test('restores a native project with generated layouts to preview', () => {
    const project = nativeProject({
      pages: [{
        page_id: 'page-1',
        native_layout: 'PulseCover',
        native_props: {},
        status: 'NATIVE_GENERATED',
      }],
    });

    expect(getProjectRoute(project)).toBe('/project/native-1/ppt/editor');
  });

  test('restores generated or generating native projects to preview', () => {
    expect(getProjectRoute(nativeProject({ status: 'NATIVE_DECK_GENERATED' }))).toBe('/project/native-1/ppt/editor');
    expect(getProjectRoute(nativeProject({
      pages: [{ page_id: 'page-1', order_index: 0, status: 'GENERATING' }],
    }))).toBe('/project/native-1/ppt/editor');
  });

  test('keeps a native project with descriptions in detail before generation starts', () => {
    expect(getProjectRoute(nativeProject())).toBe('/project/native-1/ppt/detail');
  });

  test('restores a native project with a persisted generation task to preview before layouts land', () => {
    localStorage.setItem('nativeDeckGenerationTask:native-1', 'task-1');

    expect(getProjectRoute(nativeProject())).toBe('/project/native-1/ppt/editor');
  });

  test('restores renovation source pages to detail until image generation starts', () => {
    const project = {
      project_id: 'renovation-1',
      creation_type: 'ppt_renovation',
      status: 'COMPLETED',
      pages: [{
        page_id: 'page-1',
        description_content: { text: 'Description' },
        generated_image_path: '/files/renovation-1/pages/source.png',
        status: 'DESCRIPTION_GENERATED',
      }],
    } as any;

    expect(getProjectRoute(project)).toBe('/project/renovation-1/ppt/detail');
    project.pages[0].status = 'COMPLETED';
    expect(getProjectRoute(project)).toBe('/project/renovation-1/ppt/editor');
  });
});

describe('getStatusColor', () => {
  test('uses semantic UI variables instead of direct Tailwind palette colors', () => {
    const classes = getStatusColor({ pages: [] } as any);

    expect(classes).toContain('var(--app-');
    expect(classes).not.toMatch(/\b(?:text|bg)-(?:green|yellow|blue|gray)-\d+\b/);
  });
});

describe('media workspace status', () => {
  const projectWithWorkspace = (workspace: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
    project_id: 'media-1',
    status: 'DRAFT',
    pages: [],
    workspaces: [{
      id: 'workspace-1',
      project_id: 'media-1',
      kind: 'video',
      state: 'draft',
      revision: 1,
      source_kind: 'manual',
      settings: {},
      ...workspace,
    }],
    ...overrides,
  } as any);

  test('maps ready and completed media workspaces to completed', () => {
    expect(getStatusText(projectWithWorkspace({ state: 'ready' }))).toBe('已完成');
    expect(getStatusText(projectWithWorkspace({ state: 'draft', stage: 'COMPLETED' }))).toBe('已完成');
  });

  test('maps draft media workspaces to in progress', () => {
    expect(getStatusText(projectWithWorkspace({ state: 'draft' }))).toBe('进行中');
  });

  test('maps image generation stage to pending images', () => {
    expect(getStatusText(projectWithWorkspace({ state: 'draft', stage: 'GENERATING_IMAGES' }))).toBe('待生成图片');
  });

  test('falls back to legacy PPT pages when no media workspace is initialized', () => {
    const project = projectWithWorkspace({ state: 'uninitialized' }, {
      workspaces: [{
        id: 'ppt-1',
        project_id: 'media-1',
        kind: 'ppt',
        state: 'ready',
        revision: 1,
        source_kind: 'migration',
        settings: {},
      }],
      pages: [{ page_id: 'page-1', description_content: { text: 'desc' } }],
    });

    expect(getStatusText(project)).toBe('待生成图片');
  });

  test('treats URL-only and native-completed PPT pages as completed', () => {
    expect(getStatusText({ project_id: 'ppt-url', pages: [{ generated_image_url: '/files/page.png' }] } as any)).toBe('已完成');
    expect(getProjectRoute({ project_id: 'ppt-native', pages: [{ status: 'NATIVE_GENERATED' }] } as any)).toBe('/project/ppt-native/ppt/editor');
  });
});

describe('parseMarkdownPages', () => {
  test('imports sentence-style outline and required page text markers', () => {
    const pages = parseMarkdownPages(`
## 第 1 页: 市场机会

> 章节: 行业分析

这一页说明市场规模增长、竞争格局分散，以及企业级机会正在放大。

**页面描述：**
--- 页面文字 ---

### 市场机会正在快速放大

- 企业级场景增速高于消费级场景

--- 页面文字结束 ---

视觉元素：增长曲线、对比数据卡片
视觉焦点：企业级增速
`);

    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('市场机会');
    expect(pages[0].part).toBe('行业分析');
    expect(pages[0].points).toEqual(['这一页说明市场规模增长、竞争格局分散，以及企业级机会正在放大。']);
    expect(pages[0].text).toContain('--- 页面文字 ---');
    expect(pages[0].text).toContain('--- 页面文字结束 ---');
    expect(pages[0].extra_fields).toEqual({
      '视觉元素': '增长曲线、对比数据卡片',
      '视觉焦点': '企业级增速',
    });
  });

  test('imports outline content with or without markdown bullet prefixes', () => {
    const pages = parseMarkdownPages(`
## 第 1 页: 英伟达发家史

**大纲要点：**

用一句话点明全篇主线。
* 英伟达把GPU一步步变成AI时代的基础设施。
+ CUDA建立软件生态壁垒。
- 数据中心成为第二增长曲线。

**页面描述：**
--- 页面文字 ---
英伟达发家史
--- 页面文字结束 ---
`);

    expect(pages[0].points).toEqual([
      '用一句话点明全篇主线。',
      '英伟达把GPU一步步变成AI时代的基础设施。',
      'CUDA建立软件生态壁垒。',
      '数据中心成为第二增长曲线。',
    ]);
  });
});
