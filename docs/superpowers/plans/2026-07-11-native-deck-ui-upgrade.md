# 原生可编辑 PPT UI/UX 全量升级计划

> **面向 AI 代理的工作者：** 按任务顺序实施；每个任务先补测试，再做最小实现，完成后执行该任务的验证命令。此计划与 `2026-07-11-native-editable-ppt-upgrade.md` 配套，不单独改变后端能力边界。

**目标：** 在不破坏现有图片生成路线的前提下，为 `image` 与 `native` 两种项目提供统一、紧凑、可连续操作的桌面工作区，使新建、生成、编辑、导出和质量检查都能在 `1200×760` 的最小窗口内完成主要操作，不依赖整页滚动。

**设计方向：** 使用安静、工具化的三栏工作区。左侧管理页面，中间呈现画布，右侧编辑当前页面属性；顶部只保留当前步骤和主要命令，底部承载保存状态、页码、缩放和导出任务。图片项目复用同一外壳但不显示原生属性面板。导出任务统一进入右侧任务中心，完成后展示可核对的质量报告。

**技术栈：** React 18、TypeScript、Tailwind CSS、Zustand、Lucide React、Vitest、Testing Library、Playwright、Electron

---

## 一、关键决策

### 采用方案：固定工作区 + 可收起侧栏

- 顶部命令栏：40-48px，仅放返回、项目名、步骤状态和主要操作。
- 左侧页面栏：默认 224px，可收起到 48px；页面行高控制在 72-88px。
- 中央画布：占用剩余空间，按可用区域自动缩放，不产生页面级滚动。
- 右侧属性栏：原生项目默认 320px，可收起；`1200-1279px` 时改为覆盖式抽屉。
- 底部状态栏：32px，显示保存状态、当前页、缩放、离线状态和任务入口。

### 不采用的方案

- **全部使用弹窗：** 开发改动较小，但编辑时需要反复开关弹窗，无法支撑逐元素调整。
- **画布优先、所有面板隐藏：** 视觉更干净，但属性和导出质量不可发现，不适合高频生产工具。
- **为两种项目维护两套页面：** 会造成导航、任务和导出体验分叉；只在画布与属性能力层区分模式。

### 产品边界

- 项目创建后不可在 `image` 与 `native` 间直接切换，只显示当前模式标签。
- `image` 模式继续提供当前幻灯片预览、图片重生成和可编辑 PPT 重建。
- `native` 模式提供结构化内容、布局和素材编辑，以及 PPTX/PDF/HTML 导出。
- 首期不提供自由拖拽、任意图层、任意 CSS 和类似 PowerPoint 的完整设计器。
- 高保真回退、asset-sheet 和公式清单属于导出质量能力，在质量报告中呈现，不混入常规编辑控件。

---

## 二、界面信息架构

### 创建流程

1. 输入主题和基础要求。
2. 使用紧凑分段控件选择“图片生成”或“原生可编辑”。
3. 在控件下方只显示一行模式说明和可用导出格式。
4. 创建后进入大纲页，不自动生成；用户点击“自动生成大纲”。

### 大纲与详情流程

- 顶部区域合并为一条命令栏，减少标题和操作的重复占高。
- “PPT 构想”和“生成要求”在已有大纲后自动收成摘要，可手动展开编辑。
- 页面导航使用紧凑行项目，不再使用大面积卡片。
- 中间内容区域独立滚动，底部“上一步/下一步”固定可见。

### 原生编辑流程

- 左栏：页面缩略图、标题、状态、添加/复制/删除/排序。
- 中栏：真实 HTML 页面画布；选择内容区域后与右侧字段联动。
- 右栏：`内容 / 版式 / 素材` 三个标签页，仅展示布局契约允许的字段。
- 底栏：自动保存状态、当前页、缩放、适应画布、任务中心。

### 导出与质量流程

- 导出格式使用分段控件，不使用多张大卡片。
- 提交后关闭导出面板，任务中心持续显示阶段、进度和最新消息。
- 成功任务提供“下载”和“查看质量报告”；失败任务提供“重试”和错误详情。
- 质量报告分为“概览 / 页面 / 警告”，默认展示业务可读结论，原始日志折叠。

---

## 三、视觉与交互规范

### 颜色与层级

- 主操作保留 EasySlide 青色，但改为纯色，不使用青绿渐变。
- 蓝色表示选中；绿色只表示成功；琥珀色表示警告；红色表示失败。
- 页面背景、面板和分隔线使用中性灰阶，避免整页被单一色系覆盖。
- 浅色和深色模式使用相同语义 token，不在组件中散落颜色常量。

### 尺寸

| 项目 | 标准 |
|---|---:|
| 桌面标题栏 | 40px |
| 工作区命令栏 | 44px |
| 状态栏 | 32px |
| 左侧页面栏 | 224px / 收起 48px |
| 右侧属性栏 | 320px |
| 任务中心 | 380px |
| 图标按钮视觉尺寸 | 36px，点击区域至少 44px |
| 圆角 | 6-8px |
| 正文字号 | 14px |
| 辅助文字 | 12px |
| 面板标题 | 16px |

### 行为

- 成功通知 2 秒后自动关闭；错误通知保持显示并提供重试或详情。
- 自动保存使用“保存中 / 已保存 / 保存失败”三态，不重复弹成功通知。
- 抽屉和弹窗支持 `Escape` 关闭，图标按钮必须有 tooltip 和可访问名称。
- 动画限制在 150-250ms 的透明度和位移；尊重 `prefers-reduced-motion`。
- 主工作区不允许整页滚动，只允许页面栏、属性栏和任务日志各自滚动。

---

## 四、目标文件结构

### 新建

- `frontend/src/components/workspace/WorkspaceShell.tsx` — 固定命令栏、三栏内容和状态栏插槽
- `frontend/src/components/workspace/WorkspaceStatusBar.tsx` — 保存、页码、缩放和任务入口
- `frontend/src/components/shared/SegmentedControl.tsx` — 模式、属性标签和导出格式共用控件
- `frontend/src/components/native-deck/NativeDeckPageRail.tsx` — 原生页面列表和页级命令
- `frontend/src/components/native-deck/NativeDeckCanvas.tsx` — 画布缩放、选择和空状态
- `frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx` — 内容、版式和素材字段
- `frontend/src/components/export/ExportQualityReport.tsx` — 导出质量概览、逐页结果和警告
- `frontend/src/tests/components/WorkspaceShell.test.tsx`
- `frontend/src/tests/components/SegmentedControl.test.tsx`
- `frontend/src/tests/components/NativeDeckWorkspace.test.tsx`
- `frontend/src/tests/components/ExportQualityReport.test.tsx`
- `frontend/e2e/native-deck-workspace.spec.ts`
- `frontend/e2e/workspace-responsive.spec.ts`

### 修改

- `frontend/src/index.css` — 语义颜色、工作区尺寸、焦点和 reduced-motion token
- `frontend/src/App.tsx` — 使用统一桌面标题栏高度，避免 `h-screen` 与顶部 padding 叠加
- `frontend/src/components/shared/index.ts` — 导出分段控件和工作区组件
- `frontend/src/components/shared/DesktopTitleBar.tsx` — 固定 40px 高度并压缩非必要留白
- `frontend/src/pages/Home.tsx` — 增加项目模式选择和模式说明
- `frontend/src/pages/OutlineEditor.tsx` — 紧凑输入区、固定底部操作和页面行导航
- `frontend/src/pages/DetailEditor.tsx` — 使用剩余高度布局，压缩页面卡片与间距
- `frontend/src/pages/SlidePreview.tsx` — 按 `render_mode` 装配图片预览或原生工作区
- `frontend/src/components/native-deck/NativeDeckWorkspace.tsx` — 组合页面栏、画布和属性栏
- `frontend/src/components/ExportTasksPanel.tsx` — 升级为任务中心并接入质量报告
- `frontend/src/components/ProjectSettingsModal.tsx` — 按模式显示导出能力，隐藏不适用配置

---

## 五、实施任务

### 任务 1：建立可测试的工作区设计基线

**文件：**
- 修改：`frontend/src/index.css`
- 新建：`frontend/src/components/workspace/WorkspaceShell.tsx`
- 新建：`frontend/src/components/workspace/WorkspaceStatusBar.tsx`
- 新建：`frontend/src/tests/components/WorkspaceShell.test.tsx`

- [ ] 写失败测试：工作区包含命令栏、左栏、画布、可选右栏和状态栏，并能独立收起左右栏。
- [ ] 在 `index.css` 增加语义颜色与尺寸变量，不改现有业务 token 名称的兼容行为。
- [ ] 实现 `WorkspaceShell`，用 CSS Grid 保证中央画布只占剩余空间。
- [ ] 限制工作区高度为 `100dvh - desktop titlebar`，禁止 body 级滚动。
- [ ] 验证浅色、深色和 `prefers-reduced-motion` 状态。

**验证：**

```powershell
npm run test:run -- src/tests/components/WorkspaceShell.test.tsx
```

### 任务 2：压缩全局桌面框架和基础控件

**文件：**
- 修改：`frontend/src/App.tsx`
- 修改：`frontend/src/components/shared/DesktopTitleBar.tsx`
- 新建：`frontend/src/components/shared/SegmentedControl.tsx`
- 新建：`frontend/src/tests/components/SegmentedControl.test.tsx`

- [ ] 写失败测试：分段控件支持键盘方向键、禁用项、选中态和可访问名称。
- [ ] 将桌面标题栏稳定为 40px，移除页面重复预留的 3rem 空间。
- [ ] 实现只用于三处以上选项切换的 `SegmentedControl`，避免另造完整控件系统。
- [ ] 统一图标按钮点击区域、focus ring 和 tooltip 行为。
- [ ] 检查所有标题、按钮和状态文字在 1200px 宽度下不截断主要命令。

**验证：**

```powershell
npm run test:run -- src/tests/components/SegmentedControl.test.tsx
npm run build
```

### 任务 3：升级项目创建模式选择

**文件：**
- 修改：`frontend/src/pages/Home.tsx`
- 修改：`frontend/src/api/project.ts`
- 修改：`frontend/src/types/project.ts`
- 新建：`frontend/src/tests/pages/Home.render-mode.test.tsx`

- [ ] 写失败测试：默认显示推荐模式，切换后创建请求携带正确 `render_mode`。
- [ ] 在主题输入附近加入“图片生成 / 原生可编辑”分段控件，不使用两张大卡片。
- [ ] 每种模式只显示一句稳定说明、导出格式和是否依赖外部解析服务。
- [ ] 创建期间锁定控件；创建成功后项目详情只显示模式标签，不提供直接切换。
- [ ] 对旧项目缺失 `render_mode` 时显示为图片模式。

**验证：**

```powershell
npm run test:run -- src/tests/pages/Home.render-mode.test.tsx
```

### 任务 4：重排大纲页和详情页，消除首屏浪费

**文件：**
- 修改：`frontend/src/pages/OutlineEditor.tsx`
- 修改：`frontend/src/pages/DetailEditor.tsx`
- 新建：`frontend/src/tests/pages/OutlineEditor.compact-layout.test.tsx`
- 新建：`frontend/src/tests/pages/DetailEditor.compact-layout.test.tsx`

- [ ] 写失败测试：进入大纲页不自动生成，只有点击“自动生成大纲”才发起请求。
- [ ] 合并标题、状态与主要操作为紧凑命令栏；生成后将构想和要求收成可展开摘要。
- [ ] 将页面导航从大卡片改为 72-88px 的紧凑行，保留排序、选中和错误状态。
- [ ] 将“上一步/下一步”固定在工作区底部，内容区独立滚动。
- [ ] 详情页使用同一垂直尺寸规则，保证首屏出现页面内容和下一步操作。

**验证：**

```powershell
npm run test:run -- src/tests/pages/OutlineEditor.compact-layout.test.tsx src/tests/pages/DetailEditor.compact-layout.test.tsx
```

### 任务 5：接入图片与原生模式共用的预览工作区

**文件：**
- 修改：`frontend/src/pages/SlidePreview.tsx`
- 修改：`frontend/src/components/SlideThumbnailSidebar.tsx`
- 新建：`frontend/src/tests/pages/SlidePreview.workspace.test.tsx`

- [ ] 写失败测试：`image` 项目不加载属性栏，`native` 项目装配原生工作区。
- [ ] 将当前左侧按钮、缩略图和底部导航放入统一工作区插槽。
- [ ] 图片模式缩略图栏固定 224px，按钮区压缩为图标加短标签的命令组。
- [ ] 中央图片按可用宽高缩放，顶部和底部不保留大块无效留白。
- [ ] 将页码、前后翻页和缩放移入状态栏，避免独立大 footer。

**验证：**

```powershell
npm run test:run -- src/tests/pages/SlidePreview.workspace.test.tsx
```

### 任务 6：实现原生三栏编辑工作区

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 新建：`frontend/src/components/native-deck/NativeDeckPageRail.tsx`
- 新建：`frontend/src/components/native-deck/NativeDeckCanvas.tsx`
- 新建：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 新建：`frontend/src/tests/components/NativeDeckWorkspace.test.tsx`

- [ ] 写失败测试：页面切换、字段编辑、布局切换、素材替换和自动保存状态能够联动。
- [ ] 页面栏实现选择、添加、复制、删除和上下移动；删除最后一页时禁用。
- [ ] 画布实现适应窗口、50%-200% 缩放和内容区域选择，不引入自由拖拽。
- [ ] 属性栏按布局契约生成 `内容 / 版式 / 素材` 控件，未声明字段不得出现。
- [ ] 字段修改先更新本地预览，防抖保存；失败时保留本地值并显示可重试状态。

**验证：**

```powershell
npm run test:run -- src/tests/components/NativeDeckWorkspace.test.tsx
```

### 任务 7：补齐编辑器可用性和无障碍交互

**文件：**
- 修改：`frontend/src/components/native-deck/NativeDeckPageRail.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckCanvas.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 修改：`frontend/src/components/workspace/WorkspaceStatusBar.tsx`

- [ ] 为页面切换、字段编辑和缩放定义稳定焦点顺序。
- [ ] 为图标按钮添加 Lucide 图标、tooltip、`aria-label` 和禁用原因。
- [ ] 支持 `Ctrl+S` 立即保存、`PageUp/PageDown` 切页、`Escape` 关闭覆盖式属性栏。
- [ ] 选择画布区域后将焦点同步到对应属性组，不抢走正在输入的焦点。
- [ ] 对保存错误、导出状态使用 `aria-live`，避免每次自动保存都播报成功。

**验证：**

```powershell
npm run test:run -- src/tests/components/NativeDeckWorkspace.test.tsx src/tests/components/WorkspaceShell.test.tsx
```

### 任务 8：统一导出入口、任务中心和质量报告

**文件：**
- 修改：`frontend/src/components/ExportTasksPanel.tsx`
- 修改：`frontend/src/pages/SlidePreview.tsx`
- 新建：`frontend/src/components/export/ExportQualityReport.tsx`
- 新建：`frontend/src/tests/components/ExportQualityReport.test.tsx`
- 修改：`frontend/src/tests/components/ExportTasksPanel.pause.test.tsx`

- [ ] 写失败测试：按项目模式显示可用格式，任务可暂停/继续，完成后可打开质量报告。
- [ ] 将任务面板调整为 380px 右侧抽屉；任务行只展示名称、阶段、进度和最新消息。
- [ ] 原始日志和详细错误折叠展示，避免 200 条警告撑满主界面。
- [ ] 质量报告提供概览、逐页和警告三个视图，并展示可编辑元素、局部回退、公式和失败数量。
- [ ] 成功通知 2 秒关闭；错误通知保持；退出应用时活动任务显示为已暂停而非失败。

**验证：**

```powershell
npm run test:run -- src/tests/components/ExportQualityReport.test.tsx src/tests/components/ExportTasksPanel.pause.test.tsx src/tests/components/Toast.test.tsx
```

### 任务 9：按项目模式清理设置项和错误提示

**文件：**
- 修改：`frontend/src/components/ProjectSettingsModal.tsx`
- 修改：`frontend/src/pages/Settings.tsx`
- 新建：`frontend/src/tests/components/ProjectSettingsModal.render-mode.test.tsx`

- [ ] 写失败测试：原生项目不显示 MinerU、背景修复、文本样式提取等图片路线设置。
- [ ] 图片项目保留现有解析设置，并把代理/VPN相关错误指向具体服务与重试动作。
- [ ] 原生项目只显示主题、默认导出格式、字体替换和回退质量设置。
- [ ] 删除重复说明和长段功能介绍，把技术细节放入帮助 tooltip。
- [ ] 保证设置弹窗在 760px 高度下标题和底部保存按钮始终可见。

**验证：**

```powershell
npm run test:run -- src/tests/components/ProjectSettingsModal.render-mode.test.tsx
```

### 任务 10：响应式、视觉回归和桌面验收

**文件：**
- 新建：`frontend/e2e/native-deck-workspace.spec.ts`
- 新建：`frontend/e2e/workspace-responsive.spec.ts`
- 修改：`frontend/playwright.config.ts`

- [ ] 建立 `1200×760`、`1440×900`、`1920×1080` 三组桌面截图基线。
- [ ] 在 1200px 宽度下将右侧属性栏改为覆盖式抽屉；左侧页面栏保持可操作。
- [ ] 验证浅色/深色、100%/125% Windows 缩放、长标题、20页项目和大量警告。
- [ ] 检查页面无整页滚动、画布非空、文字不重叠、任务按钮不截断、焦点可见。
- [ ] 执行完整前端测试、生产构建和桌面打包烟测。

**验证：**

```powershell
npm run test:run
npm run build
npx playwright test frontend/e2e/native-deck-workspace.spec.ts frontend/e2e/workspace-responsive.spec.ts
npm run build:desktop
```

---

## 六、里程碑与排期

| 里程碑 | 交付内容 | 建议耗时 |
|---|---|---:|
| UI-M0 | 工作区基线、token、标题栏和模式选择 | 2-3 天 |
| UI-M1 | 大纲/详情压缩、图片预览迁移 | 3-4 天 |
| UI-M2 | 原生三栏编辑器和自动保存交互 | 5-8 天 |
| UI-M3 | 导出任务中心、质量报告、模式化设置 | 3-5 天 |
| UI-M4 | 响应式、无障碍、视觉回归和桌面验收 | 2-4 天 |

建议与后端计划交叉推进：UI-M0 对应原生数据模型之前完成；UI-M2 在布局契约稳定后开始；UI-M3 与统一导出报告接口同步；UI-M4 在 M4/M5 打包阶段执行。

---

## 七、发布验收清单

- [ ] 新建项目能明确选择模式，且不会把原生模式误解为“图片转可编辑”。
- [ ] 大纲页只有用户点击“自动生成大纲”才开始生成。
- [ ] `1200×760` 下创建、大纲、详情、预览和编辑页的主要操作无需整页滚动。
- [ ] 图片项目不出现空属性栏，原生项目能在画布和属性面板间双向定位。
- [ ] 页面栏、属性栏和任务中心可独立滚动且互不挤压。
- [ ] 所有图标按钮有 tooltip、可访问名称、清晰禁用态和键盘焦点。
- [ ] 导出任务能暂停、继续，并在应用退出后显示为暂停。
- [ ] 成功通知 2 秒关闭；错误通知不会自动消失。
- [ ] 质量报告能解释每页可编辑元素、局部回退、公式和失败项。
- [ ] 深色模式无低对比度文字，Windows 125% 缩放无文字重叠。
- [ ] 前端测试、Playwright 视觉检查、生产构建和桌面打包全部通过。

---

## 八、实施顺序约束

1. 先完成工作区外壳和尺寸 token，再改页面，避免每页各自修补高度。
2. 先完成后端 `render_mode` 与布局契约，再开放原生属性编辑。
3. 原生画布能保存后，再接 PPTX/PDF/HTML 导出入口。
4. 统一质量报告接口稳定后，再实现质量报告 UI，不解析日志文本拼报告。
5. 每个里程碑只保留一个新工作流入口；未完成的原生能力使用明确的禁用态，不用假按钮。

