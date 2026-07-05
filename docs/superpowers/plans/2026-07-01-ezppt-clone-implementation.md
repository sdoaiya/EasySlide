# EZPPT / EasySlide 二开复刻实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 基于现有项目，完成面向 `ezppt.cn / EasySlide` 首页风格的品牌与入口复刻，重组设置页，并强化 OpenAI 前端接入展示。

**架构：** 以前端页面重构为主，尽量复用现有创建流程、设置接口与 OpenAI OAuth 后端能力。通过 `Landing`、`Home`、`Settings` 三个页面完成产品层复刻，通过最小 API 与文案调整提升 OpenAI 的主路径可见性。

**技术栈：** React 18、TypeScript、Vite、Tailwind、Vitest、现有 Flask API

---

## 文件结构

- 修改：`frontend/src/pages/Landing.tsx` — 复刻目标站营销页结构与品牌表达
- 修改：`frontend/src/pages/Home.tsx` — 将当前创建首页改造成更像 AI workspace 的入口页
- 修改：`frontend/src/pages/Settings.tsx` — 重组设置分区，前置 OpenAI 连接与默认 provider 配置
- 修改：`frontend/src/App.tsx` — 如有必要，调整默认首页/落地页入口策略
- 修改：`frontend/src/api/endpoints.ts` — 仅在 OpenAI 相关字段/接口映射缺失时做最小补充
- 新增：`frontend/src/tests/components/Landing.easyslide.test.tsx` — 约束 Landing 关键区块
- 新增：`frontend/src/tests/components/Home.workspace.test.tsx` — 约束 Home 的 workspace 文案与入口结构
- 新增：`frontend/src/tests/components/Settings.openai-entry.test.tsx` — 约束 Settings 中 OpenAI 核心入口可见

### 任务 1：为目标站复刻页面建立失败测试

**文件：**
- 创建：`frontend/src/tests/components/Landing.easyslide.test.tsx`
- 创建：`frontend/src/tests/components/Home.workspace.test.tsx`
- 创建：`frontend/src/tests/components/Settings.openai-entry.test.tsx`

- [ ] **步骤 1：编写 Landing 失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from '@/pages/Landing';

test('renders EasySlide-style landing sections', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );

  expect(screen.getByText(/AI Presentation Workspace/i)).toBeInTheDocument();
  expect(screen.getByText(/Capability Overview/i)).toBeInTheDocument();
  expect(screen.getByText(/User Voices/i)).toBeInTheDocument();
  expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument();
});
```

- [ ] **步骤 2：编写 Home 失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '@/pages/Home';

test('renders workspace-oriented creation entry copy', () => {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );

  expect(screen.getByText(/AI presentation workspace/i)).toBeInTheDocument();
  expect(screen.getByText(/Create Project/i)).toBeInTheDocument();
  expect(screen.getByText(/Prompt/i)).toBeInTheDocument();
  expect(screen.getByText(/Outline/i)).toBeInTheDocument();
  expect(screen.getByText(/PDF/i)).toBeInTheDocument();
});
```

- [ ] **步骤 3：编写 Settings 失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '@/pages/Settings';

test('surfaces OpenAI connection as a first-class settings section', () => {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );

  expect(screen.getByText(/OpenAI Account|OpenAI 账号连接/i)).toBeInTheDocument();
  expect(screen.getByText(/Default AI Provider|默认 AI 提供商/i)).toBeInTheDocument();
});
```

- [ ] **步骤 4：运行测试验证失败**

运行：`cd frontend && npm run test:run -- src/tests/components/Landing.easyslide.test.tsx src/tests/components/Home.workspace.test.tsx src/tests/components/Settings.openai-entry.test.tsx`

预期：FAIL，因当前页面文案与结构尚未对齐目标站。

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/tests/components/Landing.easyslide.test.tsx frontend/src/tests/components/Home.workspace.test.tsx frontend/src/tests/components/Settings.openai-entry.test.tsx
git commit -m "test: add ezppt clone page expectations (task 1/4)"
```

### 任务 2：重构 Landing 为 EasySlide 风格营销页

**文件：**
- 修改：`frontend/src/pages/Landing.tsx`
- 测试：`frontend/src/tests/components/Landing.easyslide.test.tsx`

- [ ] **步骤 1：重写 Landing 的文案结构**

```tsx
const sections = {
  capability: [
    { title: 'Multiple entry points for project creation', body: 'Prompts, long-form briefs, and structured outlines can enter the same generation workflow without format conversion.' },
    { title: 'Source parsing and content extraction', body: 'EasySlide can parse documents, webpages, PDFs, and reference material before building clearer slide structure.' },
    { title: 'Ongoing editing and style alignment', body: 'Continue refining titles, tone, layout, and visual direction after generation.' },
    { title: 'Smooth handoff into export and delivery', body: 'From online editing to file export, the workflow remains continuous and delivery-ready.' },
  ],
  voices: [
    { name: 'Lena · Consulting', quote: 'Getting to a workable deck structure quickly is the biggest time saver for me.' },
    { name: 'Ethan · Product', quote: 'It works best for me as a strong first-draft system.' },
    { name: 'Owen · Research', quote: 'Turning longer source material into presentation-ready structure saves a lot of manual cleanup.' },
  ],
};
```

- [ ] **步骤 2：实现 Landing 版式**

```tsx
<section>
  <p>AI Presentation Workspace</p>
  <h1>Use AI to support the full presentation workflow from concept to final deck.</h1>
  <Button onClick={() => navigate('/')}>Create Project</Button>
</section>
<section>
  <h2>Capability Overview</h2>
</section>
<section>
  <h2>User Voices</h2>
</section>
<section>
  <h2>Frequently Asked Questions</h2>
</section>
```

- [ ] **步骤 3：运行 Landing 测试验证通过**

运行：`cd frontend && npm run test:run -- src/tests/components/Landing.easyslide.test.tsx`

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/tests/components/Landing.easyslide.test.tsx
git commit -m "feat: rebuild landing page for easyslide clone (task 2/4)"
```

### 任务 3：重构 Home 为 workspace 风格入口页

**文件：**
- 修改：`frontend/src/pages/Home.tsx`
- 测试：`frontend/src/tests/components/Home.workspace.test.tsx`

- [ ] **步骤 1：最小调整 Home 顶部品牌与文案**

```tsx
const workspaceHero = {
  badge: 'AI presentation workspace',
  title: 'Create, refine, and export presentation decks from prompts, outlines, descriptions, and files.',
  description: 'Start from a theme, an outline, a description, or an existing PDF / PPTX, then keep refining content, layout, and visual direction.',
};
```

- [ ] **步骤 2：把创建入口区改为更清晰的 workspace 结构**

```tsx
<section>
  <h2>Create Project</h2>
  <p>{workspaceHero.description}</p>
  <div>
    <button>Prompt</button>
    <button>Outline</button>
    <button>Description</button>
    <button>PDF / PPTX</button>
  </div>
</section>
```

- [ ] **步骤 3：补一个辅助能力区但保留现有业务入口**

```tsx
const capabilityHighlights = [
  'Source parsing and content extraction',
  'Reusable assets and templates',
  'Ongoing editing and style alignment',
  'Export and delivery ready workflow',
];
```

- [ ] **步骤 4：运行 Home 测试验证通过**

运行：`cd frontend && npm run test:run -- src/tests/components/Home.workspace.test.tsx`

预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/pages/Home.tsx frontend/src/tests/components/Home.workspace.test.tsx
git commit -m "feat: reshape home into workspace entry (task 3/4)"
```

### 任务 4：重组 Settings 并前置 OpenAI 能力

**文件：**
- 修改：`frontend/src/pages/Settings.tsx`
- 如有必要修改：`frontend/src/api/endpoints.ts`
- 测试：`frontend/src/tests/components/Settings.openai-entry.test.tsx`

- [ ] **步骤 1：把分区标题重构为产品化结构**

```tsx
const sectionOrder = [
  'appearance',
  'apiConfig',
  'modelConfig',
  'openaiConnection',
  'importParsing',
  'imageExport',
  'performance',
  'about',
];
```

- [ ] **步骤 2：将 OpenAI OAuth 区块提升到主设置流中**

```tsx
<div>
  <h2>{t('settings.openaiOAuth.title')}</h2>
  <p>{t('settings.openaiOAuth.description')}</p>
</div>
```

- [ ] **步骤 3：如缺少显式文案，则为默认 provider 增加更明确标题**

```tsx
sections: {
  apiConfig: 'Default AI Provider',
}
```

- [ ] **步骤 4：运行 Settings 测试验证通过**

运行：`cd frontend && npm run test:run -- src/tests/components/Settings.openai-entry.test.tsx`

预期：PASS

- [ ] **步骤 5：运行聚焦构建验证**

运行：`cd frontend && npm run build:check`

预期：exit 0

- [ ] **步骤 6：Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/api/endpoints.ts frontend/src/tests/components/Settings.openai-entry.test.tsx
git commit -m "feat: reorganize settings and surface openai entry (task 4/4)"
```

## 自检

- 规格要求的三大页面（Landing / Home / Settings）均有对应任务。
- OpenAI 支持前台化在任务 4 中被覆盖。
- 没有 “TODO / 待定 / 后续实现” 占位步骤。
- 验证条件具体，均给出可执行命令。

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-07-01-ezppt-clone-implementation.md`。两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点
