# 原生可编辑工作流升级实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development 或在当前会话按测试驱动逐任务实现。步骤使用复选框跟踪进度。

**目标：** 完成创建页主题体验、原生逐页生成、安全主题切换、自动配图、讲解视频和项目恢复。

**架构：** 复用现有任务、素材和视频链路，新增最薄的原生编辑器适配。页面生成继续轮询；图片批次由前端四并发调度；主题切换只迁移兼容内容。

**技术栈：** React、TypeScript、Zustand、Vitest、Playwright、Flask、SQLAlchemy、Pytest。

---

### 任务 1：创建页模式与主题预览

**文件：** `frontend/src/pages/Home.tsx`、`frontend/src/native-deck/dashiThemes.ts`、`frontend/src/components/native-deck/NativeThemePicker.tsx`、`frontend/src/tests/components/Home.render-mode.test.tsx`

- [ ] 先增加模式高亮、主题说明切换和单一焦点态测试并确认失败。
- [ ] 扩展主题元数据，增加预览、说明和适用场景。
- [ ] 使用可访问按钮卡片和主题预览选择器替换弱化的模式控件与纯文本下拉。
- [ ] 运行 `npm test -- --run src/tests/components/Home.render-mode.test.tsx`。

### 任务 2：生成任务立即进入编辑器

**文件：** `frontend/src/pages/DetailEditor.tsx`、`frontend/src/pages/SlidePreview.tsx`、`frontend/src/components/native-deck/NativeDeckWorkspaceLoader.tsx`、相关测试

- [ ] 测试任务创建后立即导航且携带任务 ID。
- [ ] 测试编辑器按 completed 变化同步项目并显示进度。
- [ ] 删除 DetailEditor 中等待任务完成的阻塞轮询。
- [ ] 仅在进度变化时同步项目，完成或失败后停止轮询。

### 任务 3：增量合并与安全主题切换

**文件：** `frontend/src/components/native-deck/NativeDeckWorkspace.tsx`、`NativeDeckPropertyPanel.tsx`、`NativeSlideRenderer.tsx`、`NativeDeckCanvas.tsx`、相关测试

- [ ] 测试服务器追加页面不覆盖脏页面和当前选择。
- [ ] 测试主题匹配优先角色和字段兼容度，不按页码优先。
- [ ] 测试迁移后不出现模板示例，媒体和未映射内容被保留。
- [ ] 为单页渲染增加错误边界和按布局重新挂载。

### 任务 4：项目级图片设置

**文件：** `backend/models/project.py`、迁移文件、`backend/controllers/project_controller.py`、`frontend/src/types/index.ts`、`ProjectSettingsModal.tsx`、相关测试

- [ ] 测试默认设置、合法枚举和更新接口。
- [ ] 增加受控 JSON 设置：density、style、custom_prompt。
- [ ] 项目设置中增加图片生成设置区并保存。

### 任务 5：原生媒体槽生成与替换

**文件：** `NativeDeckPropertyPanel.tsx`、`NativeDeckWorkspace.tsx`、`frontend/src/native-deck/nativeMedia.ts`、`backend/services/native_deck_service.py`、相关测试

- [ ] 测试空槽扫描、密度过滤、四并发和暂停后不派发新任务。
- [ ] 测试单图生成成功写回、失败保留旧值、上传替换不影响其他槽。
- [ ] 复用 generateMaterialImage、processMaterialImage、MaterialSelector 和上传素材接口。
- [ ] 只允许受控元数据字段，继续拒绝其他未知属性。

### 任务 6：原生讲解视频

**文件：** `frontend/src/components/export/VideoExportDialog.tsx`、`NativeDeckWorkspace.tsx`、`frontend/src/api/endpoints.ts`、`backend/controllers/export_controller.py`、`backend/services/task_manager.py`、相关测试

- [ ] 抽取并测试图片模式与原生模式共用的视频设置对话框。
- [ ] 测试原生页面帧生成失败时不创建任务。
- [ ] 增加原生临时帧上传和现有视频任务复用入口。
- [ ] 验证任务暂停、继续和下载仍走现有任务面板。

### 任务 7：历史项目恢复

**文件：** `frontend/src/utils/projectUtils.ts`、`frontend/src/store/useProjectStore.ts`、`frontend/src/pages/History.tsx`、相关测试

- [ ] 测试原生已生成、原生生成中和未生成三种路由。
- [ ] 让 syncProject 返回同步后的项目。
- [ ] History 使用同步后的项目计算路由。

### 任务 8：集成验证

- [ ] 运行原生编辑器、创建页、项目路由、项目设置聚焦测试。
- [ ] 运行后端原生项目、任务和视频测试。
- [ ] 运行前端生产构建。
- [ ] 使用 Playwright 验证创建页、流式生成、主题切换、配图和视频入口。
- [ ] 打包桌面版本并核对主题预览、素材路径和临时视频帧。

