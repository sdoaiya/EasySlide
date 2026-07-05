# EZPPT / EasySlide 二开复刻设计说明

## 1. 背景与目标

当前仓库已具备 AI PPT 生成、参考文件解析、设置管理、OpenAI provider 与 OpenAI OAuth 控制器等基础能力。用户目标不是从零做新产品，而是基于现有仓库进行二次开发，使其在产品表现上尽量贴近 `https://www.ezppt.cn/` 当前呈现的网站版本，并补齐前台可见的 OpenAI 支持。

本次设计以 2026-07-01 抓取到的目标站首页为依据：站点当前品牌标题为 `EasySlide | AI Presentation Generator and Workspace`，首页结构包含 Hero、Capability Overview、User Voices、FAQ、底部 CTA / Footer 等区块。由于站内登录后的完整工作台页面不能仅凭首页完全静态复原，因此本次二开遵循“首页和设置页高相似、内部主流程高一致表达、底层业务能力尽量复用”的原则。

## 2. 范围

### 2.1 本阶段包含

1. 前端品牌与落地页复刻：将当前 `Landing` 页面重构为接近 EZPPT/EasySlide 首页结构与文案节奏的展示页。
2. 应用首页复刻：将当前 `Home` 页面重组为更接近目标站“AI presentation workspace”入口风格，强化多入口创建、资料导入、持续编辑、导出流程表达。
3. 设置页复刻：重组当前 `Settings` 页面，将配置分区、字段层级、文案语气调整为目标站式产品设置页。
4. OpenAI 支持前台化：保留现有后端 OpenAI / OAuth 基础，在前端突出 OpenAI 作为主要可选 provider 的入口与状态展示。
5. 品牌统一：默认将旧项目的主要品牌露出调整为 EasySlide（如无进一步用户指示，先以此作为仿制目标品牌名）。

### 2.2 本阶段不包含

1. 不重写大纲编辑器、详情编辑器、预览页的底层生成逻辑。
2. 不推翻现有后端任务流、数据库结构或文件解析架构。
3. 不承诺登录后每一个内部工作台页面都达到像素级完全一致；本阶段聚焦用户最先接触、最关键配置、最关键入口区域。
4. 不将已有多 provider 体系删减为仅 OpenAI；只是在产品层优先突出 OpenAI。

## 3. 现状审计摘要

### 3.1 当前前端关键页面

- `frontend/src/pages/Landing.tsx`：已有独立营销页，但风格偏旧项目表达。
- `frontend/src/pages/Home.tsx`：当前为功能型首页，承载创建入口、参考文件上传、模板选择等。
- `frontend/src/pages/Settings.tsx`：已有完整设置页，字段很多，工程感较强，OpenAI OAuth 区块位于高级设置内。
- `frontend/src/App.tsx`：当前路由中 `/` 指向 `Home`，`/landing` 指向 `Landing`。

### 3.2 当前后端与 OpenAI 现状

仓库中已存在：

- `backend/controllers/openai_oauth_controller.py`
- `backend/controllers/settings_controller.py`
- `backend/services/ai_providers/text/openai_provider.py`
- `backend/services/ai_providers/image/openai_provider.py`
- `.env.example` 中的 OpenAI 配置项

这说明“增加 OpenAI 支持”的核心工作不是从零实现 provider，而是整理、前台化、默认化与体验重组。

## 4. 目标站映射

根据抓取到的 `https://www.ezppt.cn/` 当前首页文本，目标站的核心对外表达为：

- AI Presentation Workspace
- 支持 prompt / outline / description / existing PDF/PPTX 作为输入
- 强调 parsing、refinement、reusable assets、templates、export
- 首页包含 Capability Overview、User Voices、FAQ、Get Started CTA

因此本项目中的映射原则如下：

1. `Landing` 对齐目标站的营销页结构与表达。
2. `Home` 对齐目标站的“workspace 入口”叙事，但继续复用现有项目的创建流程能力。
3. `Settings` 对齐目标站的产品化配置感受，而不是继续维持纯工程设置堆叠。
4. OpenAI 在默认 provider、模型配置和账号连接上获得更清晰的核心入口。

## 5. 页面与信息架构设计

### 5.1 Landing 页

目标：让用户一进站就感知到这是一个接近 EZPPT / EasySlide 的 AI 演示文稿工作区产品。

建议结构：

1. 顶部导航：品牌名、进入应用按钮。
2. Hero：
   - 标题：AI Presentation Workspace 类表达
   - 副标题：从 concept 到 final deck 的全流程描述
   - 主按钮：Create Project / Get Started
3. Capability Overview：4 个能力卡片
   - Multiple entry points
   - Source parsing and extraction
   - Ongoing editing and style alignment
   - Export and delivery
4. User Voices：3 条用户评价卡片
5. FAQ：至少 3-4 条，与目标站首页问题类型一致
6. CTA/Footer：隐私、条款、Cookies、再次开始按钮

视觉原则：

- 采用更偏深色文本 + 大留白 + 干净产品页的风格
- 减少旧项目风格的强趣味化表达
- 保留现有技术栈下可复用的 Tailwind / React 结构

### 5.2 Home 页

目标：让当前功能首页从“工具输入台”升级为“Workspace 入口”。

建议信息架构：

1. 顶部品牌与工作区说明
2. 一段简短说明：支持从主题、长文本、大纲、描述、PDF/PPTX 开始
3. 主创建区域：保留 4 类创建方式，但文案和排版改成更产品化
   - Theme / Prompt
   - Outline
   - Description
   - Existing PDF/PPTX
4. 辅助说明区域：突出解析、模板、资产、持续编辑、导出
5. 继续保留参考文件上传、模板风格选择、素材库等核心业务入口

设计取舍：

- 不改业务本质，只改表达层和布局层
- 尽量保留现有 `Home` 已有上传、模板、素材、翻新能力，避免不必要重写

### 5.3 Settings 页

目标：把设置页从“大量字段列表”重组为“可理解的产品设置面板”。

建议一级分组：

1. Workspace / Appearance
2. Default AI Provider
3. Model Configuration
4. OpenAI Connection
5. Import / Parsing
6. Image & Export
7. Performance
8. About

重构原则：

- 优先把默认 provider、模型、OpenAI 连接讲清楚
- 保留现有字段，但通过分组和折叠改善可理解性
- 把 OpenAI OAuth 从隐藏较深的位置提升为核心区块
- 文案从偏配置项说明改为偏用户任务导向说明

## 6. OpenAI 支持设计

### 6.1 能力目标

在不重写后端核心 provider 体系的前提下，让 OpenAI 成为前台明确可用、可配置、可连接的主路径之一。

### 6.2 需要实现的前台表现

1. 默认 AI provider 可以直接选 OpenAI。
2. 文本模型、图片模型、图片识别模型的 provider 与模型名配置更清晰。
3. OpenAI OAuth 连接区块前置显示，不再埋得太深。
4. 当 OpenAI 已连接时，账号状态、可用模型、断开操作更可见。
5. 相关说明要体现“无需手填 Key 也可通过 OAuth 使用部分模型”的产品逻辑。

### 6.3 实现原则

- 尽量复用 `settings_controller` 与 `openai_oauth_controller`
- 尽量不新增复杂后端抽象
- 只补齐缺失的前端字段映射和展示逻辑
- 若前端现有字段命名已足够，则优先重排，而非重造 API

## 7. 具体实施映射

### 7.1 预计修改文件

前端重点文件：

- `frontend/src/pages/Landing.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Settings.tsx`
- 视需要补充或调整 `frontend/src/components/shared/*`
- 视需要调整 `frontend/src/App.tsx` 中首页/落地页默认入口策略

后端重点文件（仅在必要时修改）：

- `backend/controllers/settings_controller.py`
- `backend/controllers/openai_oauth_controller.py`
- 相关前端 API 映射文件（按项目现有 API 组织结构定位）

### 7.2 品牌调整

默认替换以下内容：

- 页面标题、导航品牌、Hero 主标题中的旧项目主品牌露出
- 相关 CTA 文案
- 如项目存在 favicon / logo 文本露出，先做文本级调整；视觉资源素材若缺失，可后续补图

## 8. 验证标准

实施完成后，至少需要满足：

1. `Landing` 页面结构明显接近目标站首页：Hero / Capability / Voices / FAQ / CTA 完整存在。
2. `Home` 页面保留现有项目核心能力，但整体信息架构和品牌表达明显向目标站靠拢。
3. `Settings` 页面完成分区重组，OpenAI 相关内容位置更核心、逻辑更清楚。
4. OpenAI 相关配置与连接能力前端可见，基础保存/读取流程不报错。
5. 品牌文字默认切换到 EasySlide（如无进一步品牌指示）。
6. 至少完成前端构建或聚焦检查，确认无明显语法或类型错误。

## 9. 风险与后续阶段

### 9.1 当前阶段风险

1. 目标站登录后内部工作区并未完整抓取，因此内部页只能做“高一致表达”而非逐像素还原。
2. 当前 `Settings.tsx` 体量很大，重构时需尽量手术式修改，避免破坏现有保存逻辑。
3. `Home.tsx` 承担了较多业务入口，改布局时需要避免影响现有提交流程与上传流程。

### 9.2 后续可扩展阶段

若本阶段完成后用户继续要求更强一致性，可继续推进：

1. 编辑器页文案与布局微调
2. 预览页风格统一
3. 图标、配图、logo 资源级替换
4. 更深入的 OpenAI 默认工作流优化

## 10. 实施建议

本次实现建议遵循以下顺序：

1. 先改 `Landing`
2. 再改 `Home`
3. 再改 `Settings`
4. 最后补 OpenAI 前端接入细节与验证

这样可以先快速形成目标站视觉基线，再处理配置层与能力层。
