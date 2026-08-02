# 讲解视频设置三级重构（声音方案 / 试听与比较 / 高级制作）

## 目标

把「讲解视频设置」弹窗（NativeDeckWorkspace）从单层长表单改为三级结构：

1. **声音方案**（默认展开）：旁白模式、角色与声音、表达方式、自动匹配语气、试听当前页
2. **试听与比较**：A/B 对比弹窗（不再长期占据页面）
3. **高级制作**（默认折叠，标题显示修改项计数）：角色预设、发音词典、质量检查、字幕时间轴、情绪导演

用户首屏只做三件事：选旁白模式、配角色声音、选表达方式。

## 关键设计决策

- **声音决定引擎**：删除独立「Edge / Fish」切换控件；声音列表统一包含 Edge、Fish 官方、Fish 私有与已保存角色（VoicePicker 合并 `/api/voices` 目录与 `fish_audio_voice_assets`）。多人模式主持人行显示全部来源（引擎切换入口），其他角色行按当前引擎过滤避免混用。
- **canonical voice id**：前端状态统一存 `edge:xxx` / `fish:xxx`；导出/预检/试听时拆分为 provider + upstream id 传后端。
- **表达方式 → emotion_director 映射**（后端无 speech_tone）：自然讲解 / 专业演示 / 故事表达三个预设 + 自定义（手动修改自动归为自定义）。
- **语速为全局**（`speakers[].rate` 后端未消费、Fish 整页单 speed），收纳进主持人角色的「更多设置」，默认不占页面空间。
- **质量级别合并**：快速 / 标准 / 严格 → 映射 `quality_check` + `strict_quality_check` + `subtitle_timing`；字幕时间轴显示「自动」由质量级别推导，页面不出现 ASR 技术术语。
- **逐页语气覆盖迁入 NativeDeckPropertyPanel** 内容层「语气覆盖」小节（可选 props，向后兼容）。
- **Voice Design 能力未开放时完全隐藏**（删除原因文本）。
- **预估摘要条**：字数 / 时长 / 请求数 / 角色数移到弹窗底部固定栏。
- **A/B 对比弹窗**（VoiceComparisonDialog）：左右 A/B 声音 + 共用试听文案（20–40 字）+ 播放互斥 + 采用 A/采用 B；后端 `/api/voices/<id>/preview` 支持可选 `text` 参数。

## 兼容性

- 数据结构不变（`quality_check` / `strict_quality_check` / `subtitle_timing` / `emotion_director` / `page_overrides` / `NarrationSpeaker.voice` 仍向后端透传），仅 UI 层映射。
- SlidePreview 旧弹窗最小适配（共享面板重构自动生效，删除 pageOptions/estimate 传参），弹窗自身结构不动。
- e2e `native-deck-workspace.spec.ts` 断言（dialog 名、开始导出按钮、帧捕获）保持兼容；`flow-ppt-video.spec.ts` 针对 SlidePreview 弹窗，不受影响。

## 文件清单

| 文件 | 改动 |
|---|---|
| `frontend/src/components/native-deck/NativeDeckWorkspace.tsx` | 弹窗三级重构；canonical id 化；删 fishVoices/引擎切换状态；试听当前页 |
| `frontend/src/components/shared/FishNarrationAdvancedPanel.tsx` | 重构为「高级制作」：质量级别、字幕自动、情绪导演、角色预设、发音词典；导出 `qualityLevelFrom` / `applyQualityLevel` / `countAdvancedModifications` |
| `frontend/src/components/shared/VoicePicker.tsx` | 选项副行=语言+来源（无裸 ID）；合并已保存角色；`providerFilter` |
| `frontend/src/components/shared/VoiceComparisonDialog.tsx` | 新增 A/B 对比弹窗 |
| `frontend/src/components/native-deck/NativeDeckPropertyPanel.tsx` | 内容层「语气覆盖」小节（可选 props） |
| `backend/controllers/voice_catalog_controller.py` | preview 端点可选 `text` 参数 |
| `frontend/src/pages/SlidePreview.tsx` | 最小适配（删 pageOptions/estimate） |

## 验收

- 首屏仅三个决策区（旁白模式 / 角色与声音 / 表达方式）
- 页面无裸声音 ID、无 ASR 技术术语
- 高级非默认值在折叠标题显示数量
- 角色预设套用明确提示同时应用音色、语速与语气
- 1280×720 下主配置与试听按钮无需滚动
