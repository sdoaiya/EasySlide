# 原生页面版本与工作区交互实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为原生可编辑页提供持久化历史版本、重新生成与稳定的任务和演示交互。

**架构：** 页面模型新增 JSON 快照字段，生成任务和版本切换接口只在覆盖当前原生布局前记录快照。原生工作区读取版本列表，属性栏负责展示和切换，工作区负责任务定位及演示覆盖层。

**技术栈：** Flask、SQLAlchemy、React、Vitest、pytest。

---

### 任务 1：原生页面版本持久化

**文件：**
- 修改：`backend/models/page.py`
- 修改：`backend/app.py`
- 修改：`backend/controllers/native_deck_controller.py`
- 修改：`backend/services/task_manager.py`
- 测试：`backend/tests/unit/test_native_deck_api.py`

- [ ] **步骤 1：编写失败测试**

```python
response = client.get(f'/api/projects/{project.id}/pages/{page.id}/native/versions')
assert response.get_json()['data']['versions'][0]['is_current'] is True
```

- [ ] **步骤 2：实现快照和版本切换接口**

```python
page.append_native_version(page.native_layout, page.get_native_props())
page.restore_native_version(version_id)
```

- [ ] **步骤 3：运行后端定向测试**

```powershell
.venv\Scripts\python.exe -m pytest backend/tests/unit/test_native_deck_api.py -q
```

### 任务 2：原生工作区版本与交互

**文件：**
- 修改：`frontend/src/api/endpoints.ts`
- 修改：`frontend/src/components/native-deck/NativeDeckWorkspace.tsx`
- 修改：`frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx`
- 测试：`frontend/src/tests/native-deck/NativeDeckWorkspace.test.tsx`

- [ ] **步骤 1：编写失败测试**

```tsx
expect(screen.getByRole('button', { name: '重新生成本页' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '页面版本' })).toBeInTheDocument()
```

- [ ] **步骤 2：实现版本菜单、重新生成与覆盖演示**

```tsx
<div className="relative"><button aria-label="导出任务" />{showTasks && <ExportTasksPanel />}</div>
{presenting && <div className="fixed inset-0 z-50"><NativeDeckCanvas /></div>}
```

- [ ] **步骤 3：运行前端定向测试和构建**

```powershell
npm run test:run -- src/tests/native-deck/NativeDeckWorkspace.test.tsx
npm run build
```
