# 原生可编辑模式体验与质量升级计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 按“先修当前体验断点，再做质量提升”的顺序，完成原生可编辑模式的图片生成、导出任务、模板逻辑、编辑页 UI、生成流畅度、稳定性和逐元素还原质量升级。

**架构：** P0 先修可感知断点：批量生成、导出任务一致、隐藏导出帧按需挂载；P1/P2 收敛模板逻辑和 UI；P3 处理流式生成、项目阶段恢复和图片默认填充；P4/P5 再做导出稳定性和逐元素还原质量提升。

**技术栈：** React、TypeScript、Tailwind CSS、Vitest、Testing Library、Flask/Python 仅用于必要的后端任务验证。

---

## 总体升级路线

### P0：当前必须先修的体验断点

| 模块 | 问题 | 目标方案 | 对应任务 |
|---|---|---|---|
| 图片生成 | 进入可编辑页面就自动弹窗/自动生成 | 先配置图片生成设置，用户点击“批量生成”后才开始 | 任务 2 |
| 图片设置 | 入口太靠下、不明显 | 工具栏保留“配图设置”，右侧属性栏把“图片内容”提前到文字字段前面 | 任务 1 |
| 批量生成 | 缺少明确按钮 | 顶部增加“批量生成 N 张图片”，只生成空图片槽，不覆盖已上传/已生成图片 | 任务 2 |
| 导出逻辑 | 原生导出和图片模式体验不一致 | 参考图片模式：导出任务面板、进度、下载、质量报告、失败重试统一 | 任务 5 |
| 导出卡顿 | 隐藏导出画布常驻渲染所有页面 | 仅在真正导出时挂载导出帧，编辑时不渲染隐藏 deck | 任务 2 |
| 任务状态 | 导出中按钮、下载、任务面板不够一致 | 用图片模式同一套 ExportTasksPanel 展示“导出中 / 下载 / 查看质量报告” | 任务 5 |

**P0 验收标准：**

- 进入可编辑页面不会自动开始图片生成。
- 点击“保存图片设置”只保存，不生成。
- 点击“批量生成”才并发生成，最大并发 4。
- 导出任务和图片模式一样能看到进度、下载、失败原因、质量报告。
- 编辑 10 页以上不再因隐藏导出帧明显卡顿。

### P1：创建项目页模板逻辑梳理

| 模块 | 当前判断 | 目标方案 | 对应任务 |
|---|---|---|---|
| 我的模板 | 不适合原生模式 | 原生可编辑模式下隐藏 | 任务 6 |
| 预设模板 | 不适合原生模式 | 原生可编辑模式下隐藏 | 任务 6 |
| 文字描述风格 | 可适配原生模式 | 保留，并作为 native prompt 的风格提示 | 任务 6 |
| 12 个 DashiAI 主题 | 原生模式主入口 | 作为硬约束，决定主题、布局、CSS、视觉骨架 | 任务 6 |
| 文字风格与主题关系 | 可能冲突 | UI 文案说明：主题为主，文字风格用于微调 | 任务 6 |

**P1 目标交互：**

- 图片生成模式：显示“我的模板 / 预设模板 / 文字描述风格”。
- 原生可编辑模式：显示“12 个主题 + 文字描述风格”。
- 不再让用户误以为图片模板会影响原生可编辑页面。

### P2：原生编辑页 UI/UX 优化

| 区域 | 问题 | 优化 | 对应任务 |
|---|---|---|---|
| 右侧属性栏 | 内容过多、图片内容太靠下 | 分组折叠；图片内容前置，并加轻量视觉强调 | 任务 1 |
| 输入框 | 选中时蓝框 + 黄框双重高亮难看 | 输入类控件取消全局 outline，只保留单一边框反馈 | 任务 3 |
| 顶部工具栏 | 按钮拥挤 | 导出、任务、配图设置、批量生成分组 | 任务 5 |
| 导出按钮 | 和图片模式不一致 | 复用图片模式渐变按钮、任务入口、下载体验 | 任务 5 |
| 页面导航 | 缩略图多时卡 | 缩略图降级/懒渲染，优先保证主画布流畅 | 任务 2 |

### P3：生成流程体验升级

| 问题 | 目标 | 对应任务 |
|---|---|---|
| 创建后等待时间长 | 先进入编辑页，再流式生成页面 | 任务 4 |
| 生成页白屏 | 增加 skeleton / 页面逐张出现 | 任务 4 |
| 返回项目列表后再打开不是最后页面 | 记录项目当前阶段，原生项目直接回到原生编辑页 | 任务 7 |
| 主题切换后内容不相关 | 主题切换只迁移字段，不重新生成无关内容 | 任务 7 |
| 图片需要人工补充 | 默认可用图像模型生成主体图，但不覆盖用户已有图片 | 任务 2 |

### P4：导出质量与稳定性

| 模块 | 目标 | 对应任务 |
|---|---|---|
| 原生 PPTX 导出 | 任务化、可暂停、可继续、可下载、可查看质量报告 | 任务 5 |
| 讲解视频导出 | 静默执行，不闪 CMD；和图片模式同一任务面板 | 任务 5 |
| ElevenLabs | 声音 ID 失效时自动拉取可用 voice，避免直接失败 | 后续独立任务 |
| 网络/VPN | Codex、MinerU、背景修复分别支持代理配置，不互相影响 | 后续独立任务 |
| 失败提示 | 从“网络中断”升级为具体组件失败：Codex / MinerU / 背景修复 / TTS | 后续独立任务 |

### P5：逐元素还原路线质量提升

| 阶段 | 内容 | 对应任务 |
|---|---|---|
| 第一阶段 | 逐区域回退、防重影、真实质量报告 | 后续独立计划 |
| 第二阶段 | TextHint：用 MinerU/Paddle bbox、glyph 高度、字号组校准字体 | 后续独立计划 |
| 第二阶段 | 同级文字统一字号，避免标题/正文忽大忽小 | 后续独立计划 |
| 第二阶段 | 公式继续现有回退，但进入 `formula_inventory` | 后续独立计划 |
| 第三阶段 | 增加“高保真可编辑导出”模式 | 后续独立计划 |
| 第三阶段 | asset-sheet 分离复杂图标、徽章、装饰物 | 后续独立计划 |
| 第三阶段 | 外部图像编辑模型作为高级开关，不默认启用 | 后续独立计划 |

### P6：整体 UI 精致化重构

| 区域 | 当前问题 | 目标方案 | 对应任务 |
|---|---|---|---|
| 整体观感 | 页面像普通网页后台，缺少桌面创作工具质感 | 收敛为“桌面工作台”视觉：紧凑工具栏、低饱和面板、清晰分隔线、统一状态栏 | 任务 8 |
| 组件风格 | 按钮、卡片、输入框、弹窗、任务面板风格不一致 | 建立轻量 design tokens，统一圆角、阴影、边框、颜色、字体层级和动效 | 任务 8 |
| 页面密度 | 大卡片、大留白导致一屏信息量低 | 压缩表单密度，减少网页式卡片堆叠，让核心操作一屏可见 | 任务 8 |
| 导航与工具栏 | 顶部、侧栏、右侧栏之间缺少统一壳层 | 统一 `WorkspaceShell` / 顶栏 / 侧栏 / 右栏 / 任务入口结构 | 任务 8 |
| 反馈状态 | loading、toast、导出任务、空状态各自为政 | 统一状态反馈语言：轻提示 2 秒消失、任务进度驻留、错误可展开查看 | 任务 8 |
| 暗色与主题 | 部分页面明暗、边框、阴影不协调 | 先保证核心工作区浅色精致化，再为暗色主题预留 token | 任务 8 |

**推荐执行顺序：**

1. 先完成 P0：批量生成、导出任务一致、卡顿修复。
2. 再做 P1/P2：模板逻辑和原生编辑页 UI。
3. 再做 P3：流式生成和项目状态恢复。
4. 并行推进 P6 的视觉收敛，但优先落在原生编辑页、创建页、大纲页、详情页四个高频页面。
5. 最后做 P4/P5：稳定性和高保真导出质量。

---

## 文件职责

- `frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`：原生可编辑页右侧属性栏重排、分组、折叠和图片模块前置。
- `frontend/src/components/native-deck/NativeDeckWorkspace.tsx`：原生编辑页生成/导出期间的渲染控制、任务按钮和隐藏导出帧挂载时机。
- `frontend/src/components/native-deck/NativeDeckPageRail.tsx`：页面缩略图列表的轻量化渲染，减少生成中卡顿。
- `frontend/src/components/native-deck/NativeDeckCanvas.tsx`：主画布只渲染当前页，避免无关页面重绘。
- `frontend/src/components/shared/MarkdownTextarea.tsx`：统一富文本输入框焦点样式。
- `frontend/src/components/shared/Textarea.tsx`、`frontend/src/components/shared/Input.tsx`：统一基础输入框焦点样式。
- `frontend/src/pages/OutlineEditor.tsx`：检查并收敛大纲生成页设置输入框焦点样式。
- `frontend/src/pages/DetailEditor.tsx`：检查并收敛详情生成页设置输入框焦点样式。
- `frontend/src/index.css`：全局 `:focus-visible` 不再作用于输入类控件，只保留按钮/链接等可交互控件可见焦点。
- `frontend/src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx`：验证属性栏信息层级和图片模块前置。
- `frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`：验证生成页不常驻隐藏导出帧、不自动批量生成。
- `frontend/src/tests/native-deck/nativeDeckFormats.test.tsx`：验证原生导出任务接入图片模式任务面板。
- `frontend/src/tests/components/Home.render-mode.test.tsx`：验证原生模式隐藏图片模板、保留文字描述风格。
- `frontend/src/tests/pages/OutlineEditor.compact-layout.test.tsx`：验证大纲页焦点样式不出现双重高亮。
- `frontend/src/tests/pages/DetailEditor.compact-layout.test.tsx`：验证详情页焦点样式不出现双重高亮。
- `frontend/src/components/workspace/WorkspaceShell.tsx`：统一桌面工作台壳层、顶部工具栏、侧栏和主内容区密度。
- `frontend/src/components/shared/Button.tsx`、`frontend/src/components/shared/Card.tsx`、`frontend/src/components/shared/Input.tsx`、`frontend/src/components/shared/Select.tsx`：统一基础组件的圆角、边框、阴影、hover、active 和 focus 反馈。
- `frontend/src/components/shared/SegmentedControl.tsx`：统一“图片生成 / 原生可编辑”等模式选择的高亮和切换体验。
- `frontend/src/components/shared/ExportTasksPanel.tsx`：统一导出任务、下载、质量报告和错误展开的视觉语言。
- `frontend/src/pages/Home.tsx`：创建项目页主题预览、模式卡、模板逻辑和整体视觉精致化。
- `frontend/src/pages/History.tsx`：项目列表桌面应用化，减少网页卡片感。

---

## 任务 1：右侧属性栏重新排版

**目标：** 让属性栏从“长表单堆叠”变成“核心信息优先 + 分组折叠”的结构，减少滚动。

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 测试：`frontend/src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx`

- [x] **步骤 1：写失败测试**

在 `NativeDeckPropertyPanel.dashi.test.tsx` 增加断言：

```tsx
expect(screen.getByRole('button', { name: '图片内容' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '页面文字' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '视觉控制' })).toBeInTheDocument()
```

并验证图片模块在文字字段前：

```tsx
const media = screen.getByRole('button', { name: '图片内容' })
const title = screen.getByLabelText('title')
expect(media.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

- [x] **步骤 2：运行测试确认失败**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

预期：找不到“页面文字”或“图片内容”按钮。

- [x] **步骤 3：最小实现**

在 `NativeDeckPropertyPanel.tsx` 内做三个分组：

1. `页面设置`：页面主题、页面布局。
2. `图片内容`：所有 media slot，默认展开，放在前面。
3. `页面文字`：非 media 的 string / string[] / object 字段。
4. `视觉控制`：controls，默认折叠。

不新增复杂状态管理，只用本组件 `useState<Record<string, boolean>>` 保存展开状态。

- [x] **步骤 4：验证通过**

运行同上 Vitest 命令，预期通过。

---

## 任务 2：生成流程卡顿治理

**目标：** 生成过程中编辑页可进入、可滚动、可点击；避免隐藏导出帧、缩略图、全量页面同时重渲染。

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckPageRail.tsx`
- 测试：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`

- [x] **步骤 1：写失败测试**

在 `NativeDeckWorkspace.test.tsx` 验证编辑状态不挂载导出面：

```tsx
renderWorkspace()
expect(document.getElementById('deck')).not.toBeInTheDocument()
```

验证批量生成不会自动开始：

```tsx
renderWorkspace([{ ...slides[1], props: { ...slides[1].props, image: '' } }])
expect(screen.queryByRole('dialog', { name: '图片生成设置' })).not.toBeInTheDocument()
expect(screen.getByRole('button', { name: '批量生成 1 张图片' })).toBeInTheDocument()
expect(nativeApiMocks.generateMaterialImage).not.toHaveBeenCalled()
```

- [x] **步骤 2：运行测试确认失败**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx -t "batch action|hidden export frames" --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

预期：当前旧逻辑会自动弹出设置或常驻 `#deck`。

- [x] **步骤 3：最小实现**

在 `NativeDeckWorkspace.tsx`：

- 增加 `exportSurfaceVisible`。
- 只在 PPTX / PDF / HTML / 视频导出前挂载 `<NativeDeckExportSurface />`。
- 导出完成或失败后卸载。
- 批量生成按钮只调用 `media.start`。

在 `NativeDeckPageRail.tsx`：

- 先不引入虚拟列表。
- 使用 CSS `content-visibility: auto` 和 `contain-intrinsic-size` 给每个缩略图容器减轻离屏渲染成本。
- 仅当页面数量超过 20 时，非选中缩略图允许显示轻量占位；如果 10 页以内不做复杂优化。

- [x] **步骤 4：验证通过**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

预期：相关测试通过。

---

## 任务 3：大纲页、详情页、创建页、原生页焦点样式统一

**目标：** 输入框不再出现蓝色外框 + 黄色内框的双重高亮；保留按钮、链接的键盘可见焦点。

**文件：**
- 修改：`frontend/src/index.css`
- 修改：`frontend/src/components/shared/MarkdownTextarea.tsx`
- 修改：`frontend/src/components/shared/Textarea.tsx`
- 修改：`frontend/src/components/shared/Input.tsx`
- 修改：`frontend/src/pages/OutlineEditor.tsx`
- 修改：`frontend/src/pages/DetailEditor.tsx`
- 测试：`frontend/src/tests/components/Home.render-mode.test.tsx`
- 测试：`frontend/src/tests/pages/OutlineEditor.compact-layout.test.tsx`
- 测试：`frontend/src/tests/pages/DetailEditor.compact-layout.test.tsx`

- [x] **步骤 1：写失败测试**

在对应测试里断言输入容器不包含黄色 ring：

```tsx
expect(frame).not.toHaveClass('focus-within:ring-banana-500')
expect(frame).not.toHaveClass('border-2')
```

并断言保留单一边框反馈：

```tsx
expect(frame).toHaveClass('focus-within:border-cyan-500')
```

- [x] **步骤 2：运行测试确认失败**

运行：

```powershell
cd frontend
npx vitest run src/tests/components/Home.render-mode.test.tsx src/tests/pages/OutlineEditor.compact-layout.test.tsx src/tests/pages/DetailEditor.compact-layout.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

预期：旧组件仍含 `ring-banana` 或全局 `:focus-visible` 作用到输入框。

- [x] **步骤 3：最小实现**

在 `frontend/src/index.css`：

```css
:focus-visible:not(input):not(textarea):not(select):not([contenteditable="true"]) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

在共享输入组件中：

- `MarkdownTextarea`：`focus-within:ring-2 focus-within:ring-banana-500` 改成 `focus-within:border-cyan-500`。
- `Textarea`：`focus:ring-2 focus:ring-banana-500` 改成 `focus:border-cyan-500`。
- `Input`：同样改成单边框反馈。

在 `OutlineEditor.tsx`、`DetailEditor.tsx`：

- 移除调用处覆盖的 `ring-inset`、`focus:ring-*`。
- 保留 `focus:outline-none`，不要删除按钮的可见 focus。

- [x] **步骤 4：验证通过**

运行同上 Vitest 命令，预期通过。

---

## 任务 4：生成过程可感知进度，避免“白屏/卡死感”

**目标：** 用户进入生成页面后看到流式进度，而不是等待或白屏。

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspaceLoader.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 测试：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`

- [x] **步骤 1：写失败测试**

验证生成任务存在时，页面顶部显示进度：

```tsx
expect(screen.getByRole('status')).toHaveTextContent('正在生成页面')
```

- [x] **步骤 2：最小实现**

- `NativeDeckWorkspaceLoader` 继续轮询生成任务。
- 把 `progress.completed / progress.total / current_step` 传给 `NativeDeckWorkspace`。
- `WorkspaceStatusBar` 显示“正在生成页面 6/10”，不弹窗、不阻塞编辑。

- [x] **步骤 3：验证**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

---

## 任务 5：原生导出逻辑对齐图片模式

**目标：** 原生 PPTX / PDF / HTML / 讲解视频导出全部使用图片模式同一套任务体验：任务面板、进度、下载、失败展示、质量报告。

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 修改：`frontend/src/store/useExportTasksStore.ts`
- 测试：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`
- 测试：`frontend/src/tests/native-deck/nativeDeckFormats.test.tsx`

- [x] **步骤 1：写失败测试**

在 `NativeDeckWorkspace.test.tsx` 验证点击导出后先出现任务：

```tsx
fireEvent.click(screen.getByRole('button', { name: '导出PPTX' }))
await waitFor(() => expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
  type: 'native-pptx',
  status: 'PROCESSING',
})))
```

验证视频导出也走任务面板：

```tsx
fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: '讲解视频' } })
fireEvent.click(screen.getByRole('button', { name: '导出讲解视频' }))
await waitFor(() => expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
  type: 'video',
  status: expect.stringMatching(/PROCESSING|PENDING/),
})))
```

- [x] **步骤 2：运行测试确认失败**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx -t "export|video" --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

- [x] **步骤 3：最小实现**

在 `NativeDeckWorkspace.tsx`：

- 导出时先生成本地 `id = export-${Date.now()}`，与图片模式一致。
- `addTask({ id, taskId: '', projectId, type: 'native-pptx', status: 'PROCESSING' })`。
- 后端返回真实 `taskId` 后，再 `addTask({ id, taskId, ... })` 更新同一条任务。
- `updateTask` 和 `pollTask` 均使用本地 `id`，不要混用后端 `taskId` 当任务列表 id。
- PPTX / PDF / HTML 完成后把 `downloadUrl`、`filename`、`quality_report` 写入同一任务。
- 视频导出先显示“正在截取页面帧”，然后进入后端视频任务轮询。

- [x] **步骤 4：验证通过**

运行：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx src/tests/native-deck/nativeDeckFormats.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

---

## 任务 6：创建项目页模板逻辑融合

**目标：** 原生可编辑模式下隐藏不生效的图片模板，仅保留 12 个主题和文字描述风格；文字描述风格进入 native prompt。

**文件：**
- 修改：`frontend/src/pages/Home.tsx`
- 修改：`backend/services/prompts.py`
- 修改：`backend/services/task_manager.py`
- 测试：`frontend/src/tests/components/Home.render-mode.test.tsx`
- 测试：`backend/tests/unit/test_native_deck_api.py`

- [x] **步骤 1：写失败测试**

在 `Home.render-mode.test.tsx`：

```tsx
expect(screen.getByTestId('template-selector')).toBeInTheDocument()
await user.click(screen.getByRole('radio', { name: '原生可编辑' }))
expect(screen.queryByTestId('template-selector')).not.toBeInTheDocument()
expect(screen.getByText('文字描述风格')).toBeInTheDocument()
```

在 `test_native_deck_api.py`：

```python
def test_generation_passes_text_style_hint_to_native_prompt(client):
    prompts = []

    class PromptCapturingAI:
        def generate_json(self, prompt):
            prompts.append(prompt)
            return {'layout': 'core01_cover', 'props': {'title': '生成标题'}}

    with client.application.app_context():
        project = _native_project()
        project.template_style = '科技蓝、少量霓虹线条'
        task = Task(project=project, task_type='GENERATE_NATIVE_DECK')
        db.session.add(task)
        db.session.commit()
        task_id, project_id = task.id, project.id

    generate_native_deck_task(task_id, project_id, PromptCapturingAI(), app=client.application)

    assert '科技蓝、少量霓虹线条' in prompts[0]
```

- [x] **步骤 2：运行测试确认失败**

运行：

```powershell
cd frontend
npx vitest run src/tests/components/Home.render-mode.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

后端如果本机 Python 环境缺依赖，先用项目虚拟环境：

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/unit/test_native_deck_api.py -k "text_style_hint" -q
```

- [x] **步骤 3：最小实现**

- `Home.tsx`：`renderMode === 'image'` 时显示 `TemplateSelector`；`renderMode === 'native'` 时显示 `TextStyleSelector`。
- `prompts.py`：`get_native_slide_prompt(outline, layout_candidates, style_hint=None)`，有 `style_hint` 时加入“文字描述风格”段落。
- `task_manager.py`：调用 `get_native_slide_prompt(..., project.template_style)`。

- [x] **步骤 4：验证通过**

运行前端和后端对应测试。

---

## 任务 7：项目阶段恢复与主题切换内容保护

**目标：** 项目列表打开原生项目时回到原生编辑页；主题切换只迁移已有内容，不生成无关内容，不白屏。

**文件：**
- 修改：`frontend/src/utils/projectUtils.ts`
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 修改：`frontend/src/native-deck/nativeLayoutMigration.ts`
- 测试：`frontend/src/tests/utils.projectUtils.test.ts`
- 测试：`frontend/src/tests/native-deck/nativeLayoutMigration.test.ts`

- [x] **步骤 1：写失败测试**

在 `projectUtils.test.ts`：

```ts
expect(getProjectRoute({
  id: 'p1',
  render_mode: 'native',
  status: 'NATIVE_DECK_GENERATED',
} as any)).toBe('/project/p1/preview')
```

在 `nativeLayoutMigration.test.ts` 验证旧字段进入 `__unmapped_content`：

```ts
const migrated = migrateNativeProps(oldContract, nextContract, { title: '旧标题', rareField: '保留我' })
expect(migrated.__unmapped_content).toEqual(expect.objectContaining({ rareField: '保留我' }))
```

- [x] **步骤 2：最小实现**

- `projectUtils.ts`：原生项目状态达到 `NATIVE_DECK_GENERATED` 或页面已有 `native_layout` 时，进入 preview/native workspace。
- `nativeLayoutMigration.ts`：无法映射字段写入 `__unmapped_content`，后续切回兼容布局可恢复。
- `NativeDeckWorkspace.tsx`：主题切换时只调用字段迁移，不触发整页重新生成。

- [x] **步骤 3：验证**

运行：

```powershell
cd frontend
npx vitest run src/tests/utils.projectUtils.test.ts src/tests/native-deck/nativeLayoutMigration.test.ts --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

---

## 任务 8：整体 UI 精致化与桌面应用感重构

**目标：** 把产品从“网页后台表单感”收敛成“桌面端 PPT 创作工具感”：更紧凑、更精致、更有层次，同时不重写业务逻辑。

**设计原则：**

- **桌面工作台优先**：顶部是操作工具栏，左侧是页面/项目导航，中间是画布，右侧是属性检查器，底部/浮层承载任务状态。
- **少用大网页卡片**：减少大圆角、大阴影、大留白；使用细边框、低饱和背景、轻阴影和分隔线表达层级。
- **高频操作显眼**：创建、批量生成、导出、下载、任务进度等操作必须在视觉上比普通设置更突出。
- **输入区安静**：输入框聚焦只允许单一边框反馈，不出现蓝框、黄框、外层阴影多重叠加。
- **动效克制**：只使用 150-220ms 的 opacity/transform 过渡，不动画宽高，避免生成期间卡顿。

**文件：**
- 修改：`frontend/src/index.css`
- 修改：`frontend/src/components/workspace/WorkspaceShell.tsx`
- 修改：`frontend/src/components/shared/Button.tsx`
- 修改：`frontend/src/components/shared/Card.tsx`
- 修改：`frontend/src/components/shared/Input.tsx`
- 修改：`frontend/src/components/shared/Select.tsx`
- 修改：`frontend/src/components/shared/SegmentedControl.tsx`
- 修改：`frontend/src/components/shared/ExportTasksPanel.tsx`
- 修改：`frontend/src/pages/Home.tsx`
- 修改：`frontend/src/pages/History.tsx`
- 修改：`frontend/src/pages/OutlineEditor.tsx`
- 修改：`frontend/src/pages/DetailEditor.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 测试：现有页面测试按需补充 class / 状态断言，不为纯视觉建立脆弱快照。

- [x] **步骤 1：建立轻量 design tokens**

在现有 Tailwind 和 `index.css` 基础上收敛变量，不引入新 UI 框架：

```css
:root {
  --app-bg: #f5f7fb;
  --app-surface: #ffffff;
  --app-surface-muted: #f8fafc;
  --app-border: rgba(15, 23, 42, 0.10);
  --app-shadow-soft: 0 10px 30px rgba(15, 23, 42, 0.08);
  --app-radius-panel: 14px;
  --app-radius-control: 10px;
}
```

要求：

- token 只服务现有页面，不做完整主题系统。
- 主色保留当前 cyan/teal 品牌感，但降低大面积纯色使用。
- 全局背景从纯白网页感改成浅灰蓝工作台底色。

- [x] **步骤 2：统一基础组件外观**

将按钮、输入框、下拉框、卡片、分段选择器统一为三层视觉：

| 层级 | 用途 | 视觉要求 |
|---|---|---|
| Primary | 创建、批量生成、导出、下载 | 更醒目的渐变/实色按钮，但只用于核心动作 |
| Secondary | 配图设置、任务、查看报告 | 白底细边框、轻 hover，不抢主按钮 |
| Ghost | 返回、展开、收起、图标按钮 | 无背景或极浅背景，hover 才显示 |

验收：

- 同一页面不再出现 3 种以上按钮圆角/阴影风格。
- 输入框、textarea、select 的聚焦样式一致。
- 模式选择卡片选中态明显，但不使用刺眼双框。

- [x] **步骤 3：重构工作区壳层观感**

统一原生编辑、大纲、详情等工作区结构：

```text
┌──────────────────────────────────────────────┐
│ App title / Breadcrumb      Primary actions  │
├──────────┬──────────────────────┬────────────┤
│ Page rail│ Canvas / Editor body │ Inspector  │
│          │                      │            │
└──────────┴──────────────────────┴────────────┘
```

要求：

- 顶部工具栏固定高度，按钮分组明确。
- 左侧导航和右侧属性栏使用同一面板背景、边框和滚动条样式。
- 中间画布区用低饱和工作台背景承托，不直接贴白底网页。
- 任务面板不挤占画布，采用右下角浮层或可折叠侧面板。

- [x] **步骤 4：创建项目页精致化**

重点处理用户已反馈的位置：

- “图片生成 / 原生可编辑”模式选择更显眼，选中态有明确品牌色和图标。
- 原生可编辑模式下，12 个主题卡片展示预览图、风格说明、适用场景。
- 原生模式隐藏“我的模板 / 预设模板”，保留“文字描述风格”，并说明“主题决定版式，文字风格用于微调表达”。
- 表单区不再是大网页表单堆叠，改为左侧配置、右侧预览/说明的布局。

- [x] **步骤 5：原生编辑页精致化**

重点处理：

- 顶部：导出、批量生成、配图设置、任务入口按操作频率分组。
- 左侧：页面缩略图更紧凑，选中态清晰，复制/上下移/删除按钮弱化到 hover 或底部小工具条。
- 中间：画布居中、缩放稳定、生成中显示轻量状态条，不白屏。
- 右侧：属性栏改成“图片内容 / 页面文字 / 视觉控制 / 高级字段”分组，默认只展开最常用分组。
- 图片内容模块前置，保留人工上传、打开文件夹、删除、单张生成/重试入口。

- [x] **步骤 6：大纲页和详情页精致化**

- 顶部说明区压缩高度，减少“网页落地页”式大标题。
- 设置区改成紧凑侧栏或抽屉，不占据主编辑区。
- 自动生成大纲必须由用户点击触发，生成进度以流式状态显示。
- 大纲/详情输入框取消双重高亮，只保留统一单边框。

- [x] **步骤 7：项目列表和设置页统一**

- 项目列表从“网页卡片流”改成更像桌面文件管理器：紧凑卡片/列表切换、状态标签、最近编辑、继续编辑主按钮。
- 设置页按模型、导出、代理、语音、图片生成分组，避免长表单无层级。
- 通知 toast 默认 2 秒关闭，错误详情可从任务面板展开。

- [x] **步骤 8：验证与视觉巡检**

运行：

```powershell
cd frontend
npx vitest run src/tests/components/Home.render-mode.test.tsx src/tests/native-deck/NativeDeckWorkspace.test.tsx src/tests/pages/OutlineEditor.compact-layout.test.tsx src/tests/pages/DetailEditor.compact-layout.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
npm run build
```

人工巡检：

- 创建项目页：不像网页表单，模式选择和主题预览清楚。
- 原生编辑页：一屏能看到左侧页面、中间画布、右侧图片内容和核心字段。
- 大纲页/详情页：焦点没有蓝框 + 黄框叠加。
- 导出任务：视觉和图片模式一致，下载和质量报告入口清晰。
- 生成中：页面可操作区域不卡死，状态条能解释当前进度。

---

## 最终验证

- [x] 聚焦前端测试：

```powershell
cd frontend
npx vitest run src/tests/native-deck/NativeDeckWorkspace.test.tsx src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx src/tests/components/Home.render-mode.test.tsx src/tests/pages/OutlineEditor.compact-layout.test.tsx src/tests/pages/DetailEditor.compact-layout.test.tsx --reporter=verbose --pool=forks --poolOptions.forks.singleFork=true
```

- [x] 前端生产构建：

```powershell
cd frontend
npm run build
```

- [x] 桌面打包：

```powershell
.\scripts\build-desktop.ps1
```

- [x] 计算安装包哈希：

```powershell
Get-FileHash .\desktop\dist\EasySlide-0.3.0-Setup.exe -Algorithm SHA256
```

---

## 不做的事

- 暂不引入虚拟列表库；页数超过 30 并仍卡顿时再加。
- 暂不重构整套属性编辑器 schema；先在现有组件里分组。
- 暂不删除按钮/链接 focus ring；只取消输入框双重高亮，保留键盘可访问性。
- 暂不引入新的 UI 组件库；先在现有 Tailwind 和共享组件上收敛。
- 暂不一次性重写全部页面路由；先改创建页、原生编辑页、大纲页、详情页和项目列表。
- 暂不做完整多主题系统；先建立轻量 token，满足浅色桌面工作台质感。
