# EasySlide

EasySlide 是一个面向演示文稿创作的 AI 工作台。它围绕「从想法到成稿」的流程重组了首页、工作台、项目历史、设置中心和导出体验，并增强了 OpenAI / Codex OAuth 接入。

## 核心能力

- 从一句话、主题或已有材料生成 PPT 大纲、页面描述和视觉稿。
- 支持项目历史、页面编辑、素材中心、素材生成和参考文件管理。
- 支持 PPTX、PDF、图片、可编辑 PPTX 和讲解视频导出。
- 支持 OpenAI 文本模型、OpenAI 图片模型和 Codex（OpenAI OAuth）接入。
- 默认使用 EasySlide 品牌、登录页、设置页和官网式首页入口。

## 本地启动

### 后端

```bash
uv sync
cd backend
uv run alembic upgrade head
uv run python app.py
```

后端默认运行在 `http://localhost:5011`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:3011`。

## Docker

开发环境：

```bash
docker compose up --build
```

预构建镜像环境：

```bash
docker compose -f docker-compose.prod.yml up -d
```

All-in-one 环境：

```bash
docker compose -f docker-compose.allinone.yml up -d
```

## Windows 桌面版

桌面版面向 Windows 10，使用 Electron 承载前端，并随应用启动本地 Flask 后端。

```powershell
npm run build:desktop
```

构建完成后，安装包位于 `release/EasySlide-0.3.0-Setup.exe`。便携版位于 `release/EasySlide-0.3.0-Portable`，可直接运行或压缩分发。

## 配置

复制 `.env.example` 为 `.env`，再按需填写模型与服务配置。OpenAI / Codex OAuth 相关配置可在前端「设置」页面完成连接与验证。

```bash
cp .env.example .env
```

## CLI

主命令为 `easyslide-cli`，旧的 `banana-cli` 入口仍保留兼容：

```bash
uv run easyslide-cli --help
```

默认配置目录已迁移到 `~/.config/easyslide/cli.toml`；如果本机存在旧版 CLI 配置，程序仍会优先读取它以保持兼容。

## 验证

后端聚焦测试：

```bash
uv run pytest backend/tests/unit/test_easyslide_branding.py backend/tests/unit/test_update_check_service.py backend/tests/unit/test_icon_subject_extraction.py backend/tests/unit/test_openai_oauth_controller.py backend/tests/unit/test_openai_image_proxy_compat.py backend/tests/unit/test_api_settings_provider.py
```

前端聚焦测试：

```bash
cd frontend
npm run test:run -- src/tests/components/BrandStorageKeys.test.tsx src/tests/components/IndexSeo.easyslide.test.ts src/tests/components/Settings.openai-entry.test.tsx src/tests/components/SettingsAbout.test.tsx src/tests/components/HelpModal.easyslide.test.tsx src/tests/components/App.routes.test.tsx src/tests/components/Landing.easyslide.test.tsx src/tests/components/Home.workspace.test.tsx src/tests/components/History.easyslide.test.tsx src/tests/components/InternalWorkflow.easyslide.test.tsx
npm run build
```
