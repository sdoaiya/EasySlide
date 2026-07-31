# EasySlide 全项目 Apple-inspired / 编辑部工作桌 UI 升级实现计划

> **面向实施者：** 按本计划的任务顺序和聚焦门禁实施。行为变更使用测试驱动开发；每个阶段完成后执行对应验证，不允许把局部截图作为全项目完成证据。

**目标：** 将 EasySlide 全部用户界面升级为统一、稳定、高效的桌面生产力体验，并将 `docs/UI_RULES.md` 固化为后续功能的项目 UI 规则。

**架构：** 保留现有 React 路由、Zustand 状态和业务流程，优先统一语义变量、共享组件与 `WorkspaceShell`，再逐页面迁移。Content Spine、PPT、视频和播客共用项目壳层、任务中心和设置语言；PPT 的图片模式与原生可编辑模式继续共享编辑器交互结构。中央画布或播放器始终是唯一弹性区域。

**技术栈：** React 18、TypeScript、Tailwind CSS、Zustand、Lucide React、Vitest、Testing Library、Playwright、Electron。

**权威规范：** `docs/UI_RULES.md`

**视觉基线推导：** `docs/superpowers/specs/2026-07-26-editorial-workbench-ui-baseline.md`。2026-07-26 起，“编辑部工作桌”覆盖本计划中旧的系统蓝主按钮、营销式首页和 PPT 单一作品对象描述；Apple-inspired 原则继续负责反馈、空间连续性、无障碍与动效质量。

---

## 一、成功标准

1. 项目中心、创建、大纲、详情、图片编辑、原生编辑、设置、素材和导出任务全部使用统一语义变量和共享控件。
2. `1280×720`、`1440×900`、`1920×1080` 下无不合理遮挡、整页滚动或文字溢出。
3. 原生和图片工作区的中央画布不因右侧属性内容变化而改变尺寸。
4. 进入生成页不自动批量生成；用户点击“批量生成”后才开始，已有图片不覆盖。
5. 导出统一进入任务中心，具备暂停、继续、下载、失败详情和质量报告。
6. 输入焦点只有单一高亮；双击编辑可按 `Escape` 退出，相关画布操作不被透明编辑层阻挡。
7. 20 页项目的常规输入、切页和属性栏滚动无明显卡顿；隐藏导出帧不在编辑状态常驻。
8. 前端单测、关键 E2E、生产构建和桌面打包全部通过，桌面产物实际可启动。
9. 首页以四列内容项目作品墙为主体，PPT、视频、播客均有真实或确定性封面表达；第一视口不出现营销 Hero。
10. 任一视口最多只有一条 `216px` 左侧工具架；墨黑主操作与系统蓝焦点职责分离。

## 二、文件职责

### 设计底座

- `frontend/src/index.css`：语义颜色、排版、尺寸、滚动条、焦点、动效和无障碍媒体查询。
- `frontend/tailwind.config.js`：将现有 Tailwind 语义名映射到新的 CSS 变量，保留业务类名兼容。
- `frontend/src/components/shared/Button.tsx`：统一主、次、幽灵、危险按钮与按下反馈。
- `frontend/src/components/shared/Card.tsx`：限制卡片用途、圆角和层级。
- `frontend/src/components/shared/Input.tsx`、`Textarea.tsx`、`MarkdownTextarea.tsx`：统一单层焦点、错误和固定高度行为。
- `frontend/src/components/shared/Modal.tsx`：中性遮罩、12px 圆角、固定头尾和可访问焦点管理。
- `frontend/src/components/shared/Toast.tsx`：统一通知时长、错误持久化和可访问状态。
- `frontend/src/components/shared/SegmentedControl.tsx`：统一互斥选项的键盘与视觉状态。

### 应用与流程页面

- `frontend/src/components/shared/DesktopTitleBar.tsx`：统一桌面标题栏。
- `frontend/src/pages/History.tsx`、`components/history/ProjectCard.tsx`：项目中心。
- `frontend/src/pages/Home.tsx`、`components/native-deck/NativeThemePicker.tsx`：创建项目与真实主题预览。
- `frontend/src/components/content-project/*`：统一项目壳层、Content Spine、工作区入口、版本历史和同步审查。
- `frontend/src/components/video/*`：视频场景栏、播放器与属性检查器。
- `frontend/src/components/podcast/*`：播客片段栏、脚本/播放器与属性检查器。
- `frontend/src/pages/OutlineEditor.tsx`：大纲流程。
- `frontend/src/pages/DetailEditor.tsx`：详情与页面策划流程。
- `frontend/src/pages/SlidePreview.tsx`：图片模式编辑与两种工作区入口。
- `frontend/src/pages/Settings.tsx`、`components/shared/ProjectSettingsModal.tsx`：全局和项目设置。
- `frontend/src/components/shared/MaterialCenterModal.tsx`、`MaterialGeneratorModal.tsx`：图片素材中心；视频/播客音频素材不进入该全局界面。
- `frontend/src/components/shared/ExportTasksPanel.tsx`、`components/export/ExportQualityReport.tsx`：统一任务中心。

### 工作区

- `frontend/src/components/workspace/WorkspaceShell.tsx`：稳定三栏网格、面板折叠与窄屏抽屉。
- `frontend/src/components/workspace/WorkspaceStatusBar.tsx`：保存、页码、缩放和任务入口。
- `frontend/src/components/native-deck/NativeDeckWorkspace.tsx`：原生工作区组合层。
- `frontend/src/components/native-deck/NativeDeckPageRail.tsx`：页面栏。
- `frontend/src/components/native-deck/NativeDeckCanvas.tsx`：中央画布和就地编辑。
- `frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`：内容、设计和图片属性。
- `frontend/src/native-deck/native-deck.css`：原生主题外的编辑器专属样式。

## 三、实施任务

### 任务 1：记录基线并建立设计底座测试

**测试：**
- `frontend/src/tests/components/Button.test.tsx`
- `frontend/src/tests/components/SegmentedControl.test.tsx`
- `frontend/src/tests/components/Toast.test.tsx`
- 新建 `frontend/src/tests/components/AppleUiPrimitives.test.tsx`

- [ ] 增加测试，断言主按钮为墨黑实色且无渐变/悬浮位移、系统蓝只承担 focus/link/强选择、输入只有单层 focus、错误 Toast 默认不自动关闭、成功 Toast 2 秒关闭。
- [ ] 运行测试并确认新增断言因旧实现失败。
- [ ] 在 `index.css` 建立 `--app-*` 语义变量，保留旧 token 映射避免一次性破坏业务类名。
- [ ] 升级 Button、Input、Textarea、Modal、Toast、SegmentedControl 的最小公共样式。
- [ ] 运行相关测试和 `npm run build:check`。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/AppleUiPrimitives.test.tsx src/tests/components/Button.test.tsx src/tests/components/SegmentedControl.test.tsx src/tests/components/Toast.test.tsx
npm run build:check
```

### 任务 2：稳定统一工作区壳层

**测试：**
- `frontend/src/tests/components/WorkspaceShell.test.tsx`
- `frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`

- [ ] 增加测试，模拟右侧超长内容并断言画布轨道仍为 `minmax(0, 1fr)`。
- [ ] 增加 `1280px` 以下属性抽屉、`Escape` 关闭、左右栏折叠和演示模式测试。
- [ ] 将工作区尺寸迁移至 `--app-*`/`--workspace-*` 变量，中央画布为唯一弹性轨道。
- [ ] 保证全局导航与项目内容索引复用同一 `216px` 左栏外壳，进入编辑器不得叠加第二条完整侧栏。
- [ ] 左栏默认宽度固定为 `216px`，只允许用户显式收起为 `44px`；禁止路由切换或响应式规则自动改变其宽度。
- [ ] Anime.js 只编排右侧路由内容；验证快速反向切换、卸载清理、左栏像素稳定和 reduced-motion 降级。
- [ ] 统一图片模式与原生模式的画布背景、工具栏和状态栏层级。
- [ ] 验证属性栏内部滚动不传播到页面根节点。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/WorkspaceShell.test.tsx src/tests/native-deck/NativeDeckWorkspace.test.tsx
```

### 任务 3：升级项目中心与创建项目

**测试：**
- `frontend/src/tests/components/History.cozyslide.test.tsx`
- `frontend/src/tests/components/Home.workspace.test.tsx`
- `frontend/src/tests/components/Home.render-mode.test.tsx`
- `frontend/src/tests/components/NativeThemePicker.test.tsx`

- [ ] 用测试固定项目恢复路由、模式状态和最近阶段。
- [ ] 重排项目中心为紧凑品牌/创建条、四列内容项目作品墙和后置灵感墙；移除营销 Hero、统计卡片堆叠和 PPT 单一封面假设。
- [ ] 项目卡片支持 PPT 首屏、视频关键帧、播客封面和确定性占位；操作在 Hover、focus-within、选中及无 Hover“更多”中可用。
- [ ] 创建页按“首次工作区、内容/资料、模式专属主题/风格/角色、创建”排序；PPT 图片/原生为二级设置。
- [ ] PPT 原生模式隐藏不适用模板；文字风格作为 PPT 主题微调，不覆盖 12 个主题硬约束，该约束不扩散到视频或播客。
- [ ] 用真实主题渲染结果更新预览，确保预览能表达排版、颜色和素材风格。
- [ ] 创建操作提供即时 Pressed、Loading 和错误状态。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/History.cozyslide.test.tsx src/tests/components/Home.workspace.test.tsx src/tests/components/Home.render-mode.test.tsx src/tests/components/NativeThemePicker.test.tsx
```

### 任务 4：升级大纲与详情生成流程

**测试：**
- `frontend/src/tests/pages/OutlineEditor.compact-layout.test.tsx`
- `frontend/src/tests/pages/DetailEditor.compact-layout.test.tsx`
- `frontend/src/tests/components/InternalWorkflow.cozyslide.test.tsx`

- [ ] 固定进入大纲页不自动生成，只有“自动生成大纲”触发请求。
- [ ] 将输入区域在生成后折叠为可展开摘要，释放垂直空间。
- [x] 页面导航使用紧凑列表，主内容独立滚动，底部操作固定。
- [ ] 详情生成逐页流式出现，失败页可单独重试，不显示阻塞式白屏。
- [ ] 清理所有文本框双重 focus、固定高度溢出和操作区随内容漂移的问题。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/pages/OutlineEditor.compact-layout.test.tsx src/tests/pages/DetailEditor.compact-layout.test.tsx src/tests/components/InternalWorkflow.cozyslide.test.tsx
```

**本次执行记录（2026-07-22）：** 大纲与详情页底部导航改为工作区内悬浮操作条；`MarkdownTextarea` 兼容历史 HTML 图片块；定向测试 13/13、TypeScript、ESLint 和生产构建通过。

### 任务 5：升级图片模式编辑器

**测试：**
- `frontend/e2e/ui-full-flow-mocked.spec.ts`
- `frontend/src/tests/components/DescriptionCard.test.tsx`
- `frontend/src/tests/store/useProjectStore.image-generation.test.ts`

- [ ] 将图片模式接入统一工作区尺寸、画布背景和底部状态栏。
- [ ] 进入页面不自动打开图片设置、不自动批量生成。
- [ ] “保存图片设置”只保存；“批量生成”只处理空图片槽，并发上限 4。
- [ ] 支持暂停、继续、单页重试、上传替换，已存在图片永不覆盖。
- [ ] 缩略图按视口懒渲染，非当前页降低渲染成本。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/DescriptionCard.test.tsx src/tests/store/useProjectStore.image-generation.test.ts
npx playwright test e2e/ui-full-flow-mocked.spec.ts
```

### 任务 6：升级原生可编辑工作区

**测试：**
- `frontend/src/tests/native-deck/NativeDeckCanvas.test.tsx`
- `frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`
- `frontend/src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx`
- `frontend/e2e/native-deck-workspace.spec.ts`

- [ ] 固定左栏 216px、右栏 320px、中央画布独立缩放，不因属性内容变化跳动。
- [ ] 右栏重组为内容、设计、图片三组，只展开当前高频部分。
- [ ] 长文本字段固定高度并支持展开查看，避免属性栏被单字段占满。
- [ ] 双击文字编辑框与画布坐标精确对齐；`Escape` 退出编辑。
- [ ] 编辑结束后透明层不得拦截批量生成、导出等工具栏按钮。
- [ ] 主题切换只迁移字段，不用模板示例或模型输出覆盖现有内容。
- [ ] 图片生成由“批量生成”显式触发，沿用图片模式的设置、暂停和重试逻辑。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/native-deck/NativeDeckCanvas.test.tsx src/tests/native-deck/NativeDeckWorkspace.test.tsx src/tests/native-deck/NativeDeckPropertyPanel.dashi.test.tsx
npx playwright test e2e/native-deck-workspace.spec.ts
```

### 任务 7：统一设置、模型选择和图片素材中心

**测试：**
- `frontend/src/tests/components/Settings.openai-entry.test.tsx`
- `frontend/src/tests/components/ProjectSettingsModal.render-mode.test.tsx`
- `frontend/src/tests/components/ProjectSettingsModal.export.test.tsx`
- `frontend/src/tests/components/MaterialCenterModal.test.tsx`
- `frontend/src/tests/components/MaterialGeneratorModal.test.tsx`

- [ ] 设置页使用左侧分类、右侧表单结构，标题与保存操作保持可见。
- [ ] 模型引用按钮按当前提供商和当前凭据读取模型；切换或恢复默认时清除旧列表和旧错误。
- [ ] 项目下载目录作为图片与原生模式共享配置。
- [ ] 图片素材中心和素材生成使用统一 Modal、筛选、空状态与生成任务反馈，并显式过滤音频素材。
- [ ] 删除长段技术说明，将必要解释放在 tooltip 或帮助区域。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/Settings.openai-entry.test.tsx src/tests/components/ProjectSettingsModal.render-mode.test.tsx src/tests/components/ProjectSettingsModal.export.test.tsx src/tests/components/MaterialCenterModal.test.tsx src/tests/components/MaterialGeneratorModal.test.tsx
```

### 任务 8：统一导出任务中心

**测试：**
- `frontend/src/tests/components/ExportTasksPanel.pause.test.tsx`
- `frontend/src/tests/components/ExportTasksPanel.download.test.ts`
- `frontend/src/tests/components/ExportQualityReport.test.tsx`
- `frontend/e2e/video-export-narration-config.spec.ts`

- [ ] PPT 图片/原生、视频和播客使用同一导出入口语言与任务面板。
- [ ] PPTX、PDF、HTML、MP4、MP3/WAV、逐字稿和封面包任务显示阶段、进度、暂停、继续和取消。
- [ ] 下载使用项目设置目录，并以项目主题生成安全文件名。
- [ ] 质量报告将摘要、页面问题和详细日志分层，不让大量警告撑满界面。
- [ ] ElevenLabs 声音无效、外部解析失败和网络代理问题显示具体服务与恢复动作。
- [ ] Electron 子进程全程静默运行，不闪现 CMD 窗口。

**验证命令：**

```powershell
cd frontend
npm test -- --run src/tests/components/ExportTasksPanel.pause.test.tsx src/tests/components/ExportTasksPanel.download.test.ts src/tests/components/ExportQualityReport.test.tsx
npx playwright test e2e/video-export-narration-config.spec.ts
```

### 任务 9：第二轮细节、性能和无障碍优化

**测试：**
- 新建 `frontend/e2e/apple-ui-responsive.spec.ts`
- 新建 `frontend/e2e/apple-ui-keyboard.spec.ts`
- 修改相关组件测试补齐状态断言。

- [ ] 扫描业务页面中的直接色值、渐变按钮、大圆角、彩色滚动条和双重 focus。
- [ ] 扫描纸纹、纸张错层和胶片覆盖，确保只出现在项目封面、模板预览和作品型空状态，且没有随机旋转或卡片嵌套。
- [ ] 审核 Hover、Pressed、Selected、Focus、Disabled、Loading、Error、Saved 状态。
- [ ] 验证 Hover 隐藏操作在键盘 Focus、选中和无 Hover 环境仍可发现、可执行。
- [ ] 为 reduced motion、reduced transparency 和高对比度补充 CSS 与视觉检查。
- [ ] 对缩略图、隐藏导出帧、属性输入和任务轮询做渲染隔离。
- [ ] 验证 20 页、长中文标题、大量导出警告和 125% 显示缩放。
- [ ] 逐屏比较第一轮截图，修正对齐、密度、文字截断和视觉层级。

**验证命令：**

```powershell
cd frontend
npx playwright test e2e/apple-ui-responsive.spec.ts e2e/apple-ui-keyboard.spec.ts
npm run lint:strict
```

### 任务 10：全量验证、生产打包与规则收尾

- [ ] 执行前端全部单测，记录通过数。
- [ ] 执行后端与导出相关测试，确认 UI 改造未改变业务协议。
- [ ] 执行关键 Playwright 流程和三尺寸截图。
- [ ] 执行前端生产构建和桌面打包。
- [ ] 实际启动桌面产物，检查项目创建、打开编辑器、任务中心和设置。
- [ ] 抽样导出 PPTX、MP4、MP3/WAV 与逐字稿/封面包，并验证产物可打开。
- [ ] 对照本计划成功标准和 `docs/UI_RULES.md` 逐项完成审计。
- [ ] 运行代码审查，修复高、中风险问题后再交付。

**验证命令：**

```powershell
npm run test:frontend
uv run pytest backend/tests/ -v
cd frontend
npm run build:check
npx playwright test
cd ..
npm run build:desktop
```

## 四、视觉验收矩阵

| 页面 | 1280×720 | 1440×900 | 1920×1080 | 深色 | 键盘 | 长内容 |
|---|---:|---:|---:|---:|---:|---:|
| 项目中心 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| 创建项目 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| Content Spine | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| 视频工作区 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| 播客工作区 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| 大纲 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| 详情 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| 图片编辑 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| 原生编辑 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| 设置 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| 图片素材中心 | 必测 | 必测 | 抽测 | 必测 | 必测 | 必测 |
| 导出任务 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |

每张基准截图必须检查：首页第一视口的作品优先级、左栏像素稳定、画布/播放器尺寸、三栏边界、标题截断、按钮命令、焦点、无 Hover 操作入口、滚动区域、弹窗边界、任务进度和空/错/加载状态。

## 五、执行纪律

- 当前工作树存在用户未提交改动；不得还原、覆盖或格式化无关文件。
- 每次只修改当前任务的文件集合；发现范围外问题记录而不顺手重构。
- 行为变更必须先出现失败测试；纯 CSS 变量迁移必须由组件测试或 Playwright 截图覆盖。
- 每完成一个任务更新本计划复选框和执行记录。
- 生产打包成功不等于完成；必须实际启动产物并完成最终验收矩阵。
- 本计划不作为统一工作区完成后的独立“换皮”阶段；任务随 CP3-CP9 对应功能同步落地，任务 10 只做跨页面一致性与发布收尾，不再改变信息架构。
