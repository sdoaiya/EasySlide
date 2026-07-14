# 原生可编辑 PPT 全量升级实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在保留现有“AI 图片生成 + MinerU/视觉识别重建”能力的同时，新增“结构化模板 + HTML 编辑 + 浏览器内逐节点导出”的原生可编辑 PPT 生产链路，并统一导出任务、质量报告、下载和桌面打包体验。

**架构：** 项目增加 `image` 与 `native` 两种渲染模式。`image` 模式继续使用现有 Python 导出器并先补齐逐区域回退和真实质量报告；`native` 模式以 `layout + props + media` 为唯一源数据，在 React 中渲染真实 HTML，并使用 DashiAI 的 MIT 浏览器导出核心生成 PPTX Blob。Blob 和质量报告上传回 Flask，由现有导出目录、任务模型和下载接口统一管理。

**技术栈：** Flask、SQLAlchemy/Alembic、React 18、TypeScript、Zustand、Vite、Electron、Vitest、Playwright、PptxGenJS、html-to-image、pdf-lib、python-pptx

---

## 范围与硬边界

- 旧项目迁移后固定为 `image`，不自动把历史图片转换为 HTML。
- `native` 项目不调用 MinerU、背景修复或 Codex/OpenAI 样式提取；导出应可离线完成。
- 两种模式共用大纲、描述、旁白、素材中心、任务面板、导出目录和历史记录。
- 首次上线使用自有或已获授权的布局。只有获得兼容许可证或书面授权后，才导入 DashiAI 主题组件与素材。
- 仅 vendoring `html-deck-to-pptx` 的 MIT 浏览器核心及 LICENSE；不复制服务端 Playwright 入口。
- 暂停发生在页面边界。应用退出后任务标记为 `PAUSED`；恢复时从结构化页面重新执行导出，不保存浏览器截图中间态。
- 不支持项目创建后在 `image` 与 `native` 间直接切换。跨模式复制另立产品需求。

## 成功标准

1. 新建 `native` 项目能够完成：生成大纲 → 生成结构化页面 → 编辑文字/数据/媒体 → 导出 PPTX、PDF 和单文件离线 HTML。
2. `native` 导出不访问 MinerU、背景修复服务、图片识别模型或 VPN 网络。
3. 原生文字、基础形状和图片可在 PowerPoint/WPS 中编辑；复杂视觉按局部图片回退，不允许整页截图兜底。
4. 导出报告逐页给出文字、形状、图片、局部回退和警告数量，并在任务面板中展示。
5. 同一段文字不得同时存在于局部截图和可编辑文本框中。
6. 旧 `image` 项目行为、API 和数据库内容保持兼容。
7. Windows 安装包可离线导出 `native` PPTX，安装包不增加 Playwright Chromium。

## 里程碑

| 里程碑 | 交付结果 | 建议耗时 |
|---|---|---:|
| M0 | 授权结论、导出核心技术样例、基准样本 | 2-3 天 |
| M1 | 图片路线逐区域回退和真实质量报告 | 3-5 天 |
| M2 | 双模式数据模型、布局契约和 API | 5-8 天 |
| M3 | 原生页面生成器和 HTML 编辑工作区 | 7-12 天 |
| M4 | 浏览器内 PPTX 导出、任务恢复和统一报告 | 5-8 天 |
| M5 | 主题扩充、桌面打包、兼容性和灰度发布 | 5-10 天 |
| M6 | 原生 PDF、单文件 HTML 和格式一致性验证 | 3-5 天 |

---

## 文件结构

### 后端

- 创建：`backend/migrations/versions/020_add_native_deck_fields.py` — 添加双模式和原生页面字段
- 修改：`backend/models/project.py` — 保存 `render_mode`、`native_theme`
- 修改：`backend/models/page.py` — 保存 `native_layout`、`native_props`
- 创建：`backend/services/native_deck_service.py` — 布局检索、Props 校验、AI 结构化生成
- 创建：`backend/controllers/native_deck_controller.py` — 布局清单、页面保存、生成和浏览器导出回传接口
- 修改：`backend/app.py` — 注册原生页面控制器
- 修改：`backend/controllers/project_controller.py` — 创建/更新项目时处理渲染模式
- 修改：`backend/controllers/export_controller.py` — 创建原生导出任务并接收 PPTX 结果
- 修改：`backend/services/task_manager.py` — 将 `EXPORT_NATIVE_PPTX` 纳入暂停和退出恢复
- 修改：`backend/services/export_service.py` — 图片路线逐区域回退与统一质量报告
- 创建：`backend/tests/unit/test_native_deck_model.py`
- 创建：`backend/tests/unit/test_native_deck_service.py`
- 创建：`backend/tests/unit/test_native_deck_api.py`
- 创建：`backend/tests/unit/test_native_export_result.py`
- 修改：`backend/tests/unit/test_editable_pptx_style_extraction.py`

### 共享布局契约

- 创建：`shared/native-deck/layout-manifest.json` — 布局 ID、角色、文案预算、数组、媒体槽和控件契约
- 创建：`shared/native-deck/LICENSES.md` — 每套主题、字体、图片和导出核心的授权来源
- 创建：`scripts/validate-native-layout-manifest.mjs` — 校验布局唯一性、字段形状和媒体槽

### 前端

- 修改：`frontend/package.json` — 增加 `pptxgenjs`、`html-to-image`
- 创建：`frontend/src/vendor/html-deck-to-pptx/LICENSE`
- 创建：`frontend/src/vendor/html-deck-to-pptx/UPSTREAM.md`
- 创建：`frontend/src/vendor/html-deck-to-pptx/collector-functions.mjs`
- 创建：`frontend/src/vendor/html-deck-to-pptx/editable-core.mjs`
- 创建：`frontend/src/vendor/html-deck-to-pptx/editable-browser.mjs`
- 创建：`frontend/src/types/html-deck-to-pptx.d.ts`
- 创建：`frontend/src/native-deck/types.ts`
- 创建：`frontend/src/native-deck/layoutRegistry.tsx`
- 创建：`frontend/src/native-deck/layouts/core01.tsx`
- 创建：`frontend/src/native-deck/native-deck.css`
- 创建：`frontend/src/native-deck/exportNativeDeck.ts`
- 创建：`frontend/src/native-deck/exportNativePdf.ts`
- 创建：`frontend/src/native-deck/exportNativeHtml.ts`
- 创建：`frontend/src/native-deck/useNativeExportRuntime.ts`
- 创建：`frontend/src/components/native-deck/NativeSlideRenderer.tsx`
- 创建：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 创建：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 创建：`frontend/src/components/native-deck/NativeDeckExportSurface.tsx`
- 创建：`frontend/src/store/useNativeDeckStore.ts`
- 修改：`frontend/src/types/index.ts`
- 修改：`frontend/src/api/endpoints.ts`
- 修改：`frontend/src/pages/Home.tsx`
- 修改：`frontend/src/pages/SlidePreview.tsx`
- 修改：`frontend/src/components/shared/ExportTasksPanel.tsx`
- 创建：`frontend/src/tests/native-deck/layoutRegistry.test.tsx`
- 创建：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`
- 创建：`frontend/src/tests/native-deck/exportNativeDeck.test.ts`
- 创建：`frontend/e2e/native-deck-export.spec.ts`
- 创建：`frontend/e2e/native-deck-format-export.spec.ts`

### 桌面与发布

- 修改：`desktop/main.js` — 退出时暂停 `EXPORT_NATIVE_PPTX`
- 修改：`scripts/build-desktop.ps1` — 校验原生导出依赖已进入前端产物
- 修改：`backend/desktop.spec` — 打包共享布局清单
- 创建：`backend/tests/unit/test_native_layout_packaging.py`

---

### 任务 1：建立授权清单和最小导出技术样例

**文件：**
- 创建：`shared/native-deck/LICENSES.md`
- 创建：`frontend/src/vendor/html-deck-to-pptx/UPSTREAM.md`
- 创建：`frontend/e2e/native-deck-export.spec.ts`

- [ ] **步骤 1：记录可直接使用的边界**

`LICENSES.md` 必须明确记录：`html-deck-to-pptx` 版本 `0.1.0`、MIT、上游目录和同步日期；DashiAI 主题组件与主题素材标记为“未取得授权，不进入发行包”。

- [ ] **步骤 2：只复制浏览器导出核心及 LICENSE**

复制 `collector-functions.mjs`、`editable-core.mjs`、`editable-browser.mjs` 和包内 LICENSE。`UPSTREAM.md` 写入上游版本、源路径、未修改文件哈希和本地补丁清单。

- [ ] **步骤 3：编写真实浏览器失败测试**

```ts
test('exports a two-slide DOM deck with editable text', async ({ page }) => {
  await page.goto('/native-export-fixture.html');
  const result = await page.evaluate(() => window.testExportNativeDeck());
  expect(result.slideCount).toBe(2);
  expect(result.textObjects).toBeGreaterThanOrEqual(2);
  expect(result.fullSlideFallbacks).toBe(0);
});
```

- [ ] **步骤 4：运行并确认失败**

运行：`npm --prefix frontend run test:e2e -- e2e/native-deck-export.spec.ts`

预期：FAIL，因 fixture 和浏览器导出适配器尚不存在。

- [ ] **步骤 5：Commit**

```bash
git add shared/native-deck/LICENSES.md frontend/src/vendor/html-deck-to-pptx frontend/e2e/native-deck-export.spec.ts
git commit -m "chore: establish native deck exporter provenance"
```

### 任务 2：先完成图片路线的逐区域回退和真实质量报告

**文件：**
- 修改：`backend/services/export_service.py`
- 修改：`backend/utils/pptx_builder.py`
- 修改：`backend/tests/unit/test_editable_pptx_style_extraction.py`
- 修改：`frontend/src/components/shared/ExportTasksPanel.tsx`

- [ ] **步骤 1：增加重影复现测试**

构造一个同时含识别文字和复杂装饰区域的页面，断言渲染决策只能是下列两种之一：

```python
assert decision in {'editable_text_over_clean_region', 'raster_region_with_text'}
assert not (decision == 'raster_region_with_text' and item['editable_text_added'])
```

- [ ] **步骤 2：增加逐区域渲染决策**

manifest 中每个元素写入：

```python
{
    'id': element_id,
    'z_order': z_order,
    'editable': editable,
    'confidence': confidence,
    'render_decision': render_decision,
    'fallback_reason': fallback_reason,
}
```

- [ ] **步骤 3：禁止整页栅格前景和重复文字**

扩展 `_validate_page_rebuild_manifest()`：当局部栅格区域包含文字时，验证对应文本元素未再次加入；当图片覆盖面积达到页面 90% 时继续判定失败。

- [ ] **步骤 4：让质量检查字段产生真实布尔值**

`font_size_calibrated`、`visual_inventory_matched`、`background_strategy_checked`、`shape_corner_geometry_checked` 必须来自实际渲染结果，不再写 `None`。

- [ ] **步骤 5：运行测试并提交**

运行：`uv run pytest backend/tests/unit/test_editable_pptx_style_extraction.py -q`

预期：PASS。

```bash
git add backend/services/export_service.py backend/utils/pptx_builder.py backend/tests/unit/test_editable_pptx_style_extraction.py frontend/src/components/shared/ExportTasksPanel.tsx
git commit -m "feat: add regional fallback quality decisions"
```

### 任务 3：增加双模式数据库模型

**文件：**
- 创建：`backend/migrations/versions/020_add_native_deck_fields.py`
- 修改：`backend/models/project.py`
- 修改：`backend/models/page.py`
- 创建：`backend/tests/unit/test_native_deck_model.py`

- [ ] **步骤 1：编写模型失败测试**

```python
def test_native_project_and_page_round_trip(app):
    project = Project(idea_prompt='demo', render_mode='native', native_theme='core01')
    page = Page(project=project, order_index=0, native_layout='core01_cover')
    page.set_native_props({'title': '原生标题', 'subtitle': '可编辑'})
    db.session.add(project)
    db.session.commit()
    data = project.to_dict(include_pages=True)
    assert data['render_mode'] == 'native'
    assert data['pages'][0]['native_props']['title'] == '原生标题'
```

- [ ] **步骤 2：创建迁移**

`projects` 增加非空 `render_mode`，默认 `image`；增加可空 `native_theme`。`pages` 增加可空 `native_layout` 和 `native_props` 文本列。

- [ ] **步骤 3：实现模型序列化**

`Page.set_native_props()` 使用 `json.dumps(data, ensure_ascii=False)`；解析失败返回空对象并记录警告，不能影响旧项目打开。

- [ ] **步骤 4：运行测试与迁移检查**

运行：`uv run pytest backend/tests/unit/test_native_deck_model.py backend/tests/unit/test_api_project.py -q`

预期：PASS，旧项目响应包含 `render_mode: image`。

- [ ] **步骤 5：Commit**

```bash
git add backend/migrations/versions/020_add_native_deck_fields.py backend/models/project.py backend/models/page.py backend/tests/unit/test_native_deck_model.py
git commit -m "feat: add native deck persistence model"
```

### 任务 4：建立布局契约、检索和校验服务

**文件：**
- 创建：`shared/native-deck/layout-manifest.json`
- 创建：`scripts/validate-native-layout-manifest.mjs`
- 创建：`backend/services/native_deck_service.py`
- 创建：`backend/tests/unit/test_native_deck_service.py`

- [ ] **步骤 1：定义首批契约**

首批只包含一套自有主题和 8 个布局：封面、目录、指标、对比、流程、案例、结论、结束页。每个布局必须声明：

```json
{
  "layout": "core01_cover",
  "theme": "core01",
  "roles": ["cover"],
  "copyKeys": ["kicker", "title", "subtitle"],
  "copyBudgets": {"title": {"maxChars": 24}, "subtitle": {"maxChars": 48}},
  "propShapes": {"kicker": "string", "title": "string", "subtitle": "string"},
  "mediaSlots": []
}
```

- [ ] **步骤 2：编写契约失败测试**

测试未知字段、超长文案、错误数组数量、无效媒体路径和重复布局 ID 均被拒绝。

- [ ] **步骤 3：实现 `NativeDeckService`**

服务只提供三个公开方法：`list_layouts(role, needs_media)`、`validate_props(layout, props)`、`normalize_slide(layout, props)`。禁止接受任意 HTML、CSS 或 className。

- [ ] **步骤 4：运行校验**

运行：`node scripts/validate-native-layout-manifest.mjs`，随后运行：`uv run pytest backend/tests/unit/test_native_deck_service.py -q`

预期：两个命令均退出 0。

- [ ] **步骤 5：Commit**

```bash
git add shared/native-deck/layout-manifest.json scripts/validate-native-layout-manifest.mjs backend/services/native_deck_service.py backend/tests/unit/test_native_deck_service.py
git commit -m "feat: add native layout contracts"
```

### 任务 5：增加原生页面 API 和结构化 AI 生成

**文件：**
- 创建：`backend/controllers/native_deck_controller.py`
- 修改：`backend/app.py`
- 修改：`backend/services/prompts.py`
- 修改：`backend/services/task_manager.py`
- 创建：`backend/tests/unit/test_native_deck_api.py`

- [ ] **步骤 1：编写 API 失败测试**

覆盖 `GET /api/native-deck/layouts`、`PUT /api/projects/{project}/pages/{page}/native`、`POST /api/projects/{project}/generate/native-deck`。

- [ ] **步骤 2：实现页面保存边界**

保存接口只接受：

```json
{"layout": "core01_cover", "props": {"title": "标题", "subtitle": "副标题"}}
```

后端必须通过 `NativeDeckService.validate_props()` 后才写数据库。

- [ ] **步骤 3：实现结构化生成任务**

对每页根据大纲角色查询最多 8 个候选布局，将契约和页面内容交给现有文本模型，解析 JSON 后再次校验。单页失败时遵循项目的 `export_allow_partial` 语义：关闭时任务失败，开启时保留该页旧 props 并记录警告。

- [ ] **步骤 4：运行测试**

运行：`uv run pytest backend/tests/unit/test_native_deck_api.py backend/tests/unit/test_task_manager_recursive_editable_pptx.py -q`

预期：PASS，图片生成任务行为不变。

- [ ] **步骤 5：Commit**

```bash
git add backend/controllers/native_deck_controller.py backend/app.py backend/services/prompts.py backend/services/task_manager.py backend/tests/unit/test_native_deck_api.py
git commit -m "feat: generate validated native deck pages"
```

### 任务 6：实现原生布局注册表和渲染器

**文件：**
- 创建：`frontend/src/native-deck/types.ts`
- 创建：`frontend/src/native-deck/layoutRegistry.tsx`
- 创建：`frontend/src/native-deck/layouts/core01.tsx`
- 创建：`frontend/src/native-deck/native-deck.css`
- 创建：`frontend/src/components/native-deck/NativeSlideRenderer.tsx`
- 创建：`frontend/src/tests/native-deck/layoutRegistry.test.tsx`

- [ ] **步骤 1：定义稳定类型**

```ts
export type RenderMode = 'image' | 'native';
export interface NativeSlideSpec {
  pageId: string;
  layout: string;
  props: Record<string, unknown>;
}
export interface NativeLayoutComponentProps {
  props: Record<string, unknown>;
}
```

- [ ] **步骤 2：编写注册表失败测试**

读取后端布局清单 fixture，断言每个已启用 layout 在 `layoutRegistry` 中恰好有一个组件，并且未知 layout 渲染明确错误态。

- [ ] **步骤 3：实现 8 个自有布局组件**

组件固定为 `1920 × 1080` 设计坐标，所有可编辑值只来自 `props`。组件不得发送请求、读取全局 store 或在渲染时生成随机值。

- [ ] **步骤 4：运行测试**

运行：`npm --prefix frontend run test:run -- src/tests/native-deck/layoutRegistry.test.tsx`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/native-deck frontend/src/components/native-deck/NativeSlideRenderer.tsx frontend/src/tests/native-deck/layoutRegistry.test.tsx
git commit -m "feat: render contracted native deck layouts"
```

### 任务 7：实现 HTML 原生编辑工作区

**文件：**
- 创建：`frontend/src/store/useNativeDeckStore.ts`
- 创建：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 创建：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 创建：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`
- 修改：`frontend/src/pages/SlidePreview.tsx`

- [ ] **步骤 1：编写编辑失败测试**

测试切换页面、修改标题、数组增减、替换媒体、自动保存失败回滚和超长文案错误提示。

- [ ] **步骤 2：实现最小 store**

store 只保存 `slides`、`selectedPageId`、`dirtyPageIds` 和 `savePage()`；页面契约从 API 获取，不复制到 store。

- [ ] **步骤 3：实现工作区**

左侧缩略图使用同一个 `NativeSlideRenderer` CSS 缩放；中间为真实 HTML 页面；右侧属性面板按 `copyKeys`、数组契约和媒体槽渲染输入控件。不得提供任意 CSS 编辑器。

- [ ] **步骤 4：接入 SlidePreview 分流**

`currentProject.render_mode === 'native'` 时渲染 `NativeDeckWorkspace`；否则保持现有图片预览代码路径不动。

- [ ] **步骤 5：验证并提交**

运行：`npm --prefix frontend run test:run -- src/tests/native-deck/NativeDeckWorkspace.test.tsx src/tests/components/InternalWorkflow.cozyslide.test.tsx`

预期：PASS。

```bash
git add frontend/src/store/useNativeDeckStore.ts frontend/src/components/native-deck frontend/src/pages/SlidePreview.tsx frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx
git commit -m "feat: add native HTML slide workspace"
```

### 任务 8：接入浏览器内逐节点 PPTX 导出

**文件：**
- 修改：`frontend/package.json`
- 创建：`frontend/src/native-deck/useNativeExportRuntime.ts`
- 创建：`frontend/src/native-deck/exportNativeDeck.ts`
- 创建：`frontend/src/components/native-deck/NativeDeckExportSurface.tsx`
- 创建：`frontend/src/tests/native-deck/exportNativeDeck.test.ts`
- 修改：`frontend/e2e/native-deck-export.spec.ts`

- [ ] **步骤 1：安装已有成熟依赖**

运行：`npm --prefix frontend install pptxgenjs@^4.0.1 html-to-image@^1.11.13 pdf-lib@^1.17.1`

- [ ] **步骤 2：实现导出 DOM 契约**

`NativeDeckExportSurface` 在屏幕外渲染固定 1920×1080 的 `#deck > .slide`，仅当前页带 `.active`。runtime 提供 `window.go()`、`window.__getVisibleSlides()` 和 `window.__layoutDeck()`。

- [ ] **步骤 3：实现适配器**

```ts
export async function exportNativeDeck(options: ExportOptions) {
  return exportEditablePptxInBrowser({
    title: options.title,
    htmlToImage,
    PptxGenJS,
    onProgress: options.onProgress,
    waitIfPaused: options.waitIfPaused,
  });
}
```

浏览器入口在每页采集前调用 `waitIfPaused()`。这是唯一允许修改的上游行为补丁，必须记录在 `UPSTREAM.md`。

- [ ] **步骤 4：禁止整页回退**

导出报告出现覆盖面积超过 90% 的单个图片对象且页面仍有文本对象时，前端判定质量失败，不上传成品。

- [ ] **步骤 5：运行测试并提交**

运行：`npm --prefix frontend run test:run -- src/tests/native-deck/exportNativeDeck.test.ts`，随后运行：`npm --prefix frontend run test:e2e -- e2e/native-deck-export.spec.ts`

预期：PASS，2 页 fixture 至少含 2 个可编辑文本对象，无整页回退。

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/vendor/html-deck-to-pptx frontend/src/native-deck frontend/src/components/native-deck/NativeDeckExportSurface.tsx frontend/src/tests/native-deck/exportNativeDeck.test.ts frontend/e2e/native-deck-export.spec.ts
git commit -m "feat: export native decks in browser"
```

### 任务 9：统一导出任务、暂停恢复和结果保存

**文件：**
- 修改：`backend/controllers/export_controller.py`
- 修改：`backend/controllers/project_controller.py`
- 修改：`backend/services/task_manager.py`
- 创建：`backend/tests/unit/test_native_export_result.py`
- 修改：`frontend/src/api/endpoints.ts`
- 修改：`frontend/src/store/useExportTasksStore.ts`
- 修改：`frontend/src/components/shared/ExportTasksPanel.tsx`

- [ ] **步骤 1：编写任务失败测试**

测试创建 `EXPORT_NATIVE_PPTX`、暂停、恢复、退出自动暂停、上传非法 ZIP 被拒绝、上传有效 PPTX 后返回下载地址。

- [ ] **步骤 2：增加浏览器导出握手接口**

创建任务接口返回 `task_id`。前端通过现有任务进度接口提交页级进度，完成后以 multipart 上传 `file` 和 `report`。后端验证文件扩展名、ZIP 签名、`[Content_Types].xml`、任务归属和最大体积。

- [ ] **步骤 3：实现恢复语义**

暂停仅在页面边界生效。恢复将任务状态设回 `PENDING`，前端重新读取数据库中的 `layout + props` 并从第一页重建 PPTX；UI 文案显示“重新开始导出”，不声称从字节断点继续。

- [ ] **步骤 4：统一质量报告 UI**

任务详情同时支持图片导出和原生导出的 `quality_report`：每页对象计数、局部回退、警告和失败原因。

- [ ] **步骤 5：验证并提交**

运行：`uv run pytest backend/tests/unit/test_native_export_result.py backend/tests/unit/test_export_task_pause_resume.py -q`，随后运行：`npm --prefix frontend run test:run -- src/tests/store/useExportTasksStore.test.ts src/tests/components/ExportTasksPanel.pause.test.tsx`

预期：PASS。

```bash
git add backend/controllers/export_controller.py backend/controllers/project_controller.py backend/services/task_manager.py backend/tests/unit/test_native_export_result.py frontend/src/api/endpoints.ts frontend/src/store/useExportTasksStore.ts frontend/src/components/shared/ExportTasksPanel.tsx
git commit -m "feat: persist native PPTX export tasks"
```

### 任务 10：增加创建模式和旧项目兼容

**文件：**
- 修改：`frontend/src/pages/Home.tsx`
- 修改：`frontend/src/types/index.ts`
- 修改：`frontend/src/store/useProjectStore.ts`
- 修改：`backend/controllers/project_controller.py`
- 修改：`backend/tests/unit/test_api_project.py`
- 创建：`frontend/src/tests/components/Home.render-mode.test.tsx`

- [ ] **步骤 1：编写模式选择失败测试**

断言新建项目可以选择“AI 图片模式”或“原生可编辑模式”；未选择时默认现有图片模式；已有项目不能在设置中切换模式。

- [ ] **步骤 2：实现创建请求**

`CreateProjectRequest` 增加 `render_mode?: 'image' | 'native'` 和 `native_theme?: string`。后端仅接受这两个枚举值，默认 `image`。

- [ ] **步骤 3：接入工作流按钮**

`native` 项目的“生成图片”按钮改为“生成页面”；图片编辑、局部重绘和图片版本历史在该模式隐藏，文字、媒体和版式属性编辑替代它们。

- [ ] **步骤 4：验证兼容性**

运行：`uv run pytest backend/tests/unit/test_api_project.py -q`，随后运行：`npm --prefix frontend run test:run -- src/tests/components/Home.render-mode.test.tsx src/tests/components/InternalWorkflow.cozyslide.test.tsx`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/pages/Home.tsx frontend/src/types/index.ts frontend/src/store/useProjectStore.ts backend/controllers/project_controller.py backend/tests/unit/test_api_project.py frontend/src/tests/components/Home.render-mode.test.tsx
git commit -m "feat: expose native deck creation mode"
```

### 任务 11：扩充授权主题并建立主题准入门

**文件：**
- 修改：`shared/native-deck/layout-manifest.json`
- 修改：`shared/native-deck/LICENSES.md`
- 修改：`frontend/src/native-deck/layoutRegistry.tsx`
- 创建：`frontend/src/tests/native-deck/themeCoverage.test.tsx`

- [ ] **步骤 1：执行授权门**

只有许可证允许再分发或已取得书面授权的主题进入仓库。未通过的 DashiAI 主题不复制，改为按相同契约建设自有主题。

- [ ] **步骤 2：每次只增加一套主题**

每套主题先覆盖 8 个核心角色，运行全部契约、渲染和导出测试后再加入下一套。禁止一次性导入全部主题后集中修错。

- [ ] **步骤 3：增加主题覆盖测试**

每个发布主题必须具有封面、正文、指标、对比、流程、案例、结论和结束页；所有布局 ID 唯一，媒体文件存在且没有绝对路径。

- [ ] **步骤 4：执行视觉与导出基准**

每套主题固定导出一份 8 页基准 deck，在 PowerPoint 和 WPS 中人工抽查文字、图片、形状、中文字体和溢出。

- [ ] **步骤 5：Commit**

```bash
git add shared/native-deck frontend/src/native-deck frontend/src/tests/native-deck/themeCoverage.test.tsx
git commit -m "feat: add licensed native deck theme pack"
```

### 任务 12：桌面预打包和回归基准

**文件：**
- 修改：`backend/desktop.spec`
- 修改：`scripts/build-desktop.ps1`
- 修改：`desktop/main.js`
- 创建：`backend/tests/unit/test_native_layout_packaging.py`
- 修改：`docs/features/export.mdx`
- 修改：`docs/zh/features/export.mdx`

- [ ] **步骤 1：增加打包失败测试**

断言 PyInstaller datas 包含 `shared/native-deck/layout-manifest.json`，前端生产包包含浏览器导出代码，Electron 退出暂停接口包含 `EXPORT_NATIVE_PPTX`。

- [ ] **步骤 2：执行完整自动验证**

运行：

```bash
uv run pytest backend/tests/unit/test_native_deck_model.py backend/tests/unit/test_native_deck_service.py backend/tests/unit/test_native_deck_api.py backend/tests/unit/test_native_export_result.py backend/tests/unit/test_native_layout_packaging.py -q
npm --prefix frontend run test:run -- src/tests/native-deck src/tests/components/Home.render-mode.test.tsx src/tests/store/useExportTasksStore.test.ts
npm --prefix frontend run test:e2e -- e2e/native-deck-export.spec.ts
npm --prefix frontend run build
```

预期：所有命令退出 0。

- [ ] **步骤 3：构建 Windows 安装包**

运行：`npm run build:desktop`

预期：生成 `EasySlide-0.3.0-Setup.exe`，不包含额外 Chromium 目录。

- [ ] **步骤 4：执行安装包验收**

断网启动安装版，创建 8 页 `native` 项目，编辑两页文字和一张媒体，导出 PPTX，确认文件保存到设置的导出目录；退出运行中任务后重新打开，任务显示 `PAUSED`，恢复后重新导出成功。

- [ ] **步骤 5：建立发布门槛并提交**

发布要求：原生导出 20 份固定样本成功率 100%；无整页回退；无重复文字；PowerPoint/WPS 各抽检 5 份；旧图片项目的聚焦测试全部通过。

```bash
git add backend/desktop.spec scripts/build-desktop.ps1 desktop/main.js backend/tests/unit/test_native_layout_packaging.py docs/features/export.mdx docs/zh/features/export.mdx
git commit -m "build: package native editable deck workflow"
```

### 任务 13：补齐原生 PDF 和单文件离线 HTML

**文件：**
- 创建：`frontend/src/native-deck/exportNativePdf.ts`
- 创建：`frontend/src/native-deck/exportNativeHtml.ts`
- 创建：`frontend/e2e/native-deck-format-export.spec.ts`
- 修改：`backend/controllers/export_controller.py`
- 修改：`backend/tests/unit/test_native_export_result.py`

- [ ] **步骤 1：编写三格式失败测试**

固定 2 页 native deck，分别断言：PPTX 为有效 ZIP 且含 `[Content_Types].xml`；PDF 以 `%PDF-` 开头且页数为 2；HTML 只有一个文件、包含 2 个 `.slide`、不含 `/files/`、`http://`、`https://` 和本机绝对路径。

- [ ] **步骤 2：实现原生 PDF**

`exportNativePdf()` 使用 `html-to-image` 按页生成 PNG，再用 `pdf-lib` 创建 16:9 页面并铺满图片。所有页面按 1920×1080 捕获，禁止从 PPTX 二次转换 PDF。

```ts
const pdf = await PDFDocument.create();
for (const pngBytes of pagePngBytes) {
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([1280, 720]);
  page.drawImage(image, { x: 0, y: 0, width: 1280, height: 720 });
}
return new Blob([await pdf.save()], { type: 'application/pdf' });
```

- [ ] **步骤 3：实现单文件离线 HTML**

`exportNativeHtml()` 克隆 export surface，将受控布局 CSS 通过 Vite `?inline` 嵌入 `<style>`，把图片和视频 poster 转成 data URL，并加入最小键盘/按钮翻页脚本。所有用户文字由 React 已转义 DOM 克隆得到，不拼接未经转义的 props。

- [ ] **步骤 4：复用统一结果上传接口**

完成接口接受 `format` 枚举 `pptx|pdf|html`，分别验证 ZIP 签名、PDF 签名或 UTF-8 HTML；三种格式都写入项目导出目录并返回现有下载 URL。单文件 HTML 上限设为 100 MB，超过时明确报错并建议改用 PPTX/PDF。

- [ ] **步骤 5：验证、重建最终安装包并提交**

依次运行：`uv run pytest backend/tests/unit/test_native_export_result.py -q`、`npm --prefix frontend run test:e2e -- e2e/native-deck-export.spec.ts e2e/native-deck-format-export.spec.ts`、`npm run build:desktop`。

预期：PASS，三种格式均为 2 页且不依赖外部 URL；最终安装包内不包含额外 Chromium。

```bash
git add frontend/src/native-deck/exportNativePdf.ts frontend/src/native-deck/exportNativeHtml.ts frontend/e2e/native-deck-format-export.spec.ts backend/controllers/export_controller.py backend/tests/unit/test_native_export_result.py
git commit -m "feat: export native decks as PDF and offline HTML"
```

---

## 实施顺序和检查点

1. 完成任务 1-2 后先发布图片导出质量修复，不等待 HTML 模式。
2. 完成任务 3-5 后检查数据库兼容和 AI 结构化生成质量；不进入 UI 前先保证所有 props 都能通过契约。
3. 完成任务 6-8 后交付内部原型，使用固定 8 页样本验证 PowerPoint/WPS。
4. 完成任务 9-10 后开放 `native` 创建入口。
5. 任务 11 按授权和测试结果逐主题推进，不阻塞核心功能发布。
6. 任务 12 先验证桌面打包与离线 PPTX，不作为三格式正式版发布。
7. 任务 13 补齐 PDF/HTML 并重建安装包后，才对外宣称支持 PPTX/PDF/HTML 三格式交付。

## 回滚策略

- 数据库字段均为新增字段，旧记录默认 `image`；回滚前禁止删除 `native` 项目数据。
- 原生创建入口可从前端隐藏，但已创建项目仍能读取和导出。
- 浏览器导出失败时不自动切换图片 OCR 导出，避免用户误以为仍是原生可编辑结果。
- 图片模式任何回归都阻止发布；原生模式不能修改现有 `generated_image_path` 的含义。
- 上游导出核心升级必须先更新 `UPSTREAM.md` 哈希并重跑 20 份固定基准。

## 明确不做

- 不把历史图片项目自动转换为原生模板项目。
- 不允许模型生成任意 HTML、CSS、JavaScript 或 React 代码。
- 不增加完整自由画布、图层面板或 PowerPoint 级动画编辑器。
- 不为浏览器截图中间态建立大文件断点存储。
- 不在授权不清晰时发布 DashiAI 的主题代码、字体或图片素材。
