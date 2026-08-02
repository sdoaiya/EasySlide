// 页面状态
export type PageStatus = 'DRAFT' | 'GENERATING_DESCRIPTION' | 'DESCRIPTION_GENERATED' | 'NATIVE_GENERATED' | 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// 项目状态
export type ProjectStatus = 'DRAFT' | 'OUTLINE_GENERATED' | 'DESCRIPTIONS_GENERATED' | 'GENERATING_DESCRIPTIONS' | 'GENERATING_IMAGES' | 'NATIVE_DECK_GENERATED' | 'COMPLETED';

// 大纲内容
export interface OutlineContent {
  title: string;
  points: string[];
}

// 描述内容 - 支持两种格式：后端可能返回纯文本或结构化内容
export type DescriptionContent =
  | {
      // 格式1: 后端返回的纯文本格式
      text: string;
      extra_fields?: Record<string, string>;
      layout_suggestion?: string; // 向后兼容
    }
  | {
      // 格式2: 类型定义中的结构化格式
      title: string;
      text_content: string[];
      extra_fields?: Record<string, string>;
      layout_suggestion?: string; // 向后兼容
    };

// 图片版本
export interface ImageVersion {
  version_id: string;
  page_id: string;
  image_path: string;
  image_url?: string;
  version_number: number;
  is_current: boolean;
  scene_manifest_ref?: { page_id: string; path: string; sha256: string } | null;
  scene_status?: 'missing' | 'building' | 'ready' | 'degraded' | 'failed';
  scene_quality_score?: number | null;
  scene_schema_version?: number | null;
  scene_error?: string | null;
  created_at?: string;
}

// 页面
export interface Page {
  page_id: string;  // 后端返回 page_id
  id?: string;      // 前端使用的别名
  order_index: number;
  part?: string; // 章节名
  outline_content: OutlineContent | null;
  description_content?: DescriptionContent;
  narration_text?: string; // TTS 旁白文本
  narration_segments?: NarrationSegment[];
  narration_status?: string;
  current_narration_version_id?: string | null;
  narration_locked?: boolean;
  narration_revision?: number;
  native_layout?: string;
  native_props?: Record<string, unknown>;
  generated_image_url?: string; // 后端返回 generated_image_url
  generated_image_path?: string; // 前端使用的别名
  template_image_url?: string;
  template_image_path?: string;
  template_style_text?: string | null;
  template_selection_role?: string | null;
  template_selection_layout?: string | null;
  template_selection_source?: string | null;
  template_match_reason?: string | null;
  status: PageStatus;
  created_at?: string;
  updated_at?: string;
  image_versions?: ImageVersion[]; // 历史版本列表
}

export interface NarrationConfig {
  speaker_persona: string;
  target_audience: string;
  speech_tone: string;
  presentation_topic: string;
  min_words: number;
  max_words: number;
  narration_mode?: 'single' | 'dialogue';
  speakers?: NarrationSpeaker[];
}

export interface NarrationSpeaker {
  id: string;
  name: string;
  voice: string;
  rate?: string;
}

export interface FishAudioVoice {
  id: string;
  title: string;
  state: string;
  languages: string[];
  visibility: 'private' | 'public' | string;
  author?: string | null;
  like_count?: number;
  task_count?: number;
  preview_url?: string | null;
}

export interface PronunciationEntry {
  term: string;
  pronunciation: string;
}

export interface NarrationPreferences {
  quality_check: boolean;
  strict_quality_check: boolean;
  subtitle_timing: 'estimated' | 'asr';
  emotion_director: {
    intensity: 'gentle' | 'standard' | 'strong';
    pace: 'slow' | 'normal' | 'fast';
    pause: 'short' | 'normal' | 'long';
    relationship: 'neutral' | 'host_guest' | 'mentor' | 'debate';
    emotion?: 'curious' | 'emphasis' | 'confident' | 'calm' | 'warm' | 'excited';
  };
  page_overrides: Record<string, Partial<NarrationPreferences['emotion_director']>>;
}

export interface FishAudioVoiceAsset {
  id: string;
  name: string;
  voice: string;
  avatar: string;
  rate: string;
  language: string;
  default_emotion: 'curious' | 'emphasis' | 'confident' | 'calm' | 'warm' | 'excited';
  use_case: string;
  synthetic: boolean;
}

export interface NarrationSegment {
  segment_id?: string;
  order?: number;
  speaker_id: string;
  text: string;
  voice?: string;
  rate?: string;
  segment_index?: number;
  delivery?: NarrationDelivery;
}

export type NarrationMode = 'single' | 'dialogue';
export type NarrationVersionStatus = 'candidate' | 'applied' | 'archived';
export type NarrationSourceType = 'manual' | 'ai_generated' | 'ai_polished' | 'converted' | 'legacy';
export type NarrationPolicy = 'confirmed_only' | 'export_only_auto_fill' | 'allow_silent_pages';
export type NarrationTimingQuality = 'word_exact' | 'segment_exact' | 'aligned' | 'estimated';

export interface NarrationDelivery {
  emotion?: string;
  intensity?: number;
  rate?: string;
  pitch?: string;
  pause_before_ms?: number;
  pause_after_ms?: number;
}

export interface NarrationVersion {
  id: string;
  page_id: string;
  version_number: number;
  mode: NarrationMode;
  language: string;
  text: string;
  segments: NarrationSegment[];
  source_type: NarrationSourceType;
  status: NarrationVersionStatus;
  parent_version_id?: string | null;
  ai_operation?: string | null;
  ai_config?: Record<string, unknown>;
  content_hash: string;
  created_by: 'user' | 'ai' | 'migration' | string;
  created_at?: string | null;
}

export interface NarrationPageSummary {
  page_id: string;
  order_index: number;
  mode?: NarrationMode;
  current_version_id?: string | null;
  locked: boolean;
  revision: number;
  word_count: number;
  estimated_seconds: number;
  candidate_count: number;
  narration_status?: string | null;
  error?: string | null;
}

export interface ProjectNarrationSummary {
  pages: NarrationPageSummary[];
  total_pages: number;
  confirmed_pages: number;
  missing_pages: number;
  candidate_pages: number;
}

export interface NarrationVersionsResponse {
  page_id: string;
  revision: number;
  current_version_id?: string | null;
  locked: boolean;
  versions: NarrationVersion[];
}

export interface NarrationDiff {
  changed: boolean;
  before_text?: string;
  after_text?: string;
  additions?: number;
  deletions?: number;
}

export interface NarrationCandidateResponse {
  candidate: NarrationVersion;
  diff: NarrationDiff;
  quality_checks?: string[];
  estimated_seconds?: number;
}

/** 候选稳定契约（重构计划 §7.4）：candidate_id 即 NarrationVersion.id */
export interface NarrationCandidate {
  candidate_id: string;
  page_id: string;
  source_page_revision: number;
  base_version_id?: string | null;
  source_content_hash: string;
  status: 'candidate' | 'applied' | 'archived';
  operation: string;
  style_profile_id: string;
  expressiveness_id: string;
  voice_profile_id: string;
  text: string;
  segments: NarrationSegment[];
  provider: string;
  model_id: string;
  prompt_version: string;
  created_at?: string | null;
}

/** 活动/历史 AI 文案任务摘要（刷新恢复用） */
export interface NarrationAiJobSummary {
  task_id: string;
  status: NarrationAiJobStatus;
  operation?: string;
  scope?: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  page_ids: string[];
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

export interface NarrationBatchApplyItem {
  candidate_id: string;
  base_revision: number;
}

export interface NarrationBatchApplyResult {
  candidate_id: string;
  page_id?: string;
  status: 'applied' | 'conflict' | 'skipped' | 'error';
  revision?: number;
  applied_version_id?: string;
  message?: string;
}

export interface NarrationPreviewTiming {
  segment_id?: string;
  start_ms: number;
  end_ms: number;
}

export interface NarrationPreviewResult {
  audio_url: string;
  provider: 'edge' | 'fish_audio';
  timing_quality: NarrationTimingQuality;
  cache_hit: boolean;
  duration_ms?: number;
  timings?: NarrationPreviewTiming[];
}

export interface CreateNarrationVersionRequest {
  baseRevision: number;
  mode: NarrationMode;
  language: string;
  text: string;
  segments?: NarrationSegment[];
}

export interface NarrationAiCandidateRequest {
  operation: string;
  baseVersionId?: string;
  baseRevision: number;
  selection?: { start: number; end: number };
  instruction?: string;
  generationConfig?: Record<string, unknown>;
}

export type NarrationAiJobScope = 'selected' | 'missing' | 'all_unlocked';
export type NarrationAiJobStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface NarrationAiJobRequest {
  scope: NarrationAiJobScope;
  pageIds?: string[];
  operation: string;
  instruction?: string;
  selection?: { start: number; end: number };
  generationConfig?: Record<string, unknown>;
}

export interface NarrationAiJobResult {
  task_id: string;
  status: NarrationAiJobStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  operation?: string;
  scope?: string;
  pages: Array<{
    page_id: string;
    status: 'candidate' | 'failed' | 'skipped';
    candidate_id?: string;
    reason?: string;
  }>;
}

export interface NarrationPreviewDraft {
  mode: NarrationMode;
  language: string;
  text: string;
  segments?: NarrationSegment[];
}

export interface NarrationPreviewRequest {
  versionId?: string;
  draft?: NarrationPreviewDraft;
  segmentId?: string;
  ttsProvider: 'edge' | 'fish_audio';
  voice?: string;
  speakers?: NarrationSpeaker[];
  autoEmotion?: boolean;
}

// 导出设置 - 组件提取方法
export type ExportExtractorMethod = 'mineru' | 'hybrid';

// 导出设置 - 背景图获取方法
export type ExportInpaintMethod = 'generative' | 'baidu' | 'hybrid';

export type RenderMode = 'image' | 'native';
export type ContentWorkspaceKind = 'ppt' | 'video' | 'podcast';
export type ContentProjectEntry = 'spine' | ContentWorkspaceKind;
export type WorkspaceState = 'uninitialized' | 'draft' | 'ready' | 'stale';
export type PptWorkspaceStage = ProjectStatus;

export interface ContentSpine {
  id: string;
  project_id: string;
  revision: number;
  status: 'draft' | 'confirmed';
  content_hash: string;
  document: Record<string, any>;
  preview_sections?: Array<Record<string, any>>;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectWorkspace {
  id: string;
  project_id: string;
  kind: ContentWorkspaceKind;
  state: WorkspaceState;
  stage?: PptWorkspaceStage | null;
  revision: number;
  current_version_id?: string | null;
  source_kind: 'spine' | 'ppt' | 'migration' | 'manual';
  source_revision?: number | null;
  settings: Record<string, any>;
  document?: Record<string, any> | null;
  cover_url?: string | null;
}

export interface ContentProject {
  project_id: string;
  project_title?: string | null;
  lifecycle_state: 'active' | 'archived' | 'migration_failed';
  last_workspace?: ContentProjectEntry | null;
  project_settings: {
    pronunciation_lexicon: PronunciationEntry[];
    narration_preferences: NarrationPreferences;
  };
  spine: ContentSpine;
  workspaces: ProjectWorkspace[];
  pending_sync_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export type WorkspaceGenerationStatus =
  | 'PENDING' | 'RUNNING' | 'PAUSED' | 'REVIEW_READY'
  | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'STALE';

export interface WorkspaceGenerationRun {
  run_id: string;
  project_id: string;
  target_workspace_kind: 'video' | 'podcast';
  source_kind: 'brief' | 'ppt';
  source_workspace_id?: string | null;
  source_version_id?: string | null;
  source_revision: number;
  source_snapshot_hash: string;
  source_summary?: Record<string, any> | null;
  parent_run_id?: string | null;
  mode: 'direct' | 'preserve' | 'ai_adapt';
  operation: 'generate' | 'polish' | 'shorten' | 'expand' | 'regenerate';
  options?: Record<string, any> | null;
  candidate_hash?: string | null;
  status: WorkspaceGenerationStatus;
  task_id?: string | null;
  target_workspace_id?: string | null;
  published_version_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  candidate?: Record<string, any> | null;
  stale?: boolean;
  result_route?: string;
}

export interface CreateWorkspaceGenerationRunRequest {
  targetWorkspaceKind: 'video' | 'podcast';
  sourceKind: 'brief' | 'ppt';
  mode?: 'direct' | 'preserve' | 'ai_adapt';
  operation?: string;
  pageIds?: string[];
  options?: Record<string, any>;
}

export interface OptimizeWorkspaceGenerationRunRequest {
  itemIds: string[];
  operation: 'polish' | 'shorten' | 'expand' | 'regenerate';
  instruction?: string;
  styleProfileId?: string;
  expressivenessId?: string;
  voiceProfileId?: string;
}

export interface SyncDiffItem {
  item_id: string;
  path: string;
  operation: 'add' | 'remove' | 'replace';
  change_type: 'fact' | 'structure' | 'content';
  before: unknown;
  after: unknown;
  source_ref?: string | null;
}

export interface ContentSyncProposal {
  id: string;
  project_id: string;
  source_kind: ContentProjectEntry;
  target_kind: ContentProjectEntry;
  source_revision: number;
  target_base_revision: number;
  diff: { schema_version: 1; items: SyncDiffItem[] };
  resolution: {
    applied_item_ids: string[];
    rejected_item_ids: string[];
    target_revision: number;
    applications: Array<{
      item_ids: string[];
      target_revision: number;
      version_id?: string | null;
    }>;
  };
  reason?: string | null;
  status: 'pending' | 'partially_applied' | 'applied' | 'rejected' | 'stale';
  created_at?: string | null;
  resolved_at?: string | null;
}

export interface WorkspaceVersion {
  id: string;
  workspace_id: string;
  revision: number;
  document: Record<string, any>;
  settings: Record<string, any>;
  content_hash: string;
  source_type: 'manual' | 'ai' | 'sync' | 'migration' | 'restore';
  parent_version_id?: string | null;
  created_at?: string | null;
}
export type NativeImageDensity = 'sparse' | 'standard' | 'rich' | 'custom';
export type NativeImageStyle = 'theme' | 'photo' | '3d' | 'flat' | 'tech' | 'custom';
export type NativeImageComposition = 'auto' | 'center' | 'text-left' | 'text-right' | 'full-bleed';
export type NativeVisualPalette = 'default' | 'enterprise_blue' | 'teal' | 'black_gold' | 'orange_gray' | 'custom';
export type NativeChartTheme = 'clean' | 'consulting' | 'contrast' | 'executive';
export type NativeMediaStyle = 'auto' | 'photo' | 'illustration' | 'product' | 'none';
export type NativeTone = 'strategy' | 'sales' | 'government' | 'technical' | 'research';
export interface ProjectDashboardStats {
  total: number;
  completed: number;
  generating: number;
  in_progress: number;
}

export interface NativeImageSettings {
  density: NativeImageDensity;
  style: NativeImageStyle;
  composition: NativeImageComposition;
  palette?: NativeVisualPalette;
  custom_palette?: Partial<Record<'accent' | 'secondary' | 'surface' | 'text', string>>;
  chart_theme?: NativeChartTheme;
  media_style?: NativeMediaStyle;
  tone?: NativeTone;
  custom_prompt: string;
  custom_counts: Record<string, number>;
}

export interface ImageGenerationOptions {
  maxWorkers?: number;
  useTemplate?: boolean;
  density?: 'sparse' | 'standard' | 'rich';
  style?: 'theme' | 'business' | 'tech' | 'photo' | 'flat';
  composition?: 'auto' | 'text-left' | 'text-right' | 'center' | 'full-bleed';
  restraint?: 'standard' | 'strong' | 'documentary';
  customPrompt?: string;
  language?: 'zh' | 'ja' | 'en' | 'auto';
  qualityIssues?: string[];
}

export interface ImageGenerationResponse {
  task_id: string | null;
  status: 'GENERATING_IMAGES' | 'NO_PENDING_IMAGES';
  total_pages: number;
  skipped_existing?: number;
}

export interface NativeExportQualityReport {
  slideCount: number;
  textObjects: number;
  shapeObjects: number;
  imageObjects: number;
  slideSummaries: Array<{
    index: number;
    renderedTextObjects?: number;
    renderedShapeObjects?: number;
    renderedImageObjects?: number;
    [key: string]: unknown;
  }>;
  animationSummary?: Array<{
    pageIndex: number;
    enter?: string;
    elementEnter?: string;
    elementFallback?: 'dashi-internal-fade';
    elementDuration?: number;
    elementDelay?: number;
    elementStagger?: number;
    elementEasing?: string;
    elementTrigger?: 'auto' | 'click';
    transition?: string;
    internal?: boolean;
    advanceAfter?: number;
  }>;
  formula_inventory?: Array<{
    slideIndex: number;
    text: string;
    decision: 'editable-text';
    editable: true;
  }>;
  warnings: Array<Record<string, unknown>>;
}

// 项目
export interface Project {
  project_id: string;  // 后端返回 project_id
  id?: string;         // 前端使用的别名
  cover_url?: string | null;  // 项目摘要封面（阶段3 ProjectSummary）
  dashboard_status?: 'completed' | 'generating' | 'in_progress';
  page_count?: number;
  active_task_count?: number;
  project_title?: string;
  idea_prompt: string;
  outline_text?: string;  // 用户输入的大纲文本（用于outline类型）
  description_text?: string;  // 用户输入的描述文本（用于description类型）
  extra_requirements?: string; // 额外要求，应用到每个页面的AI提示词
  outline_requirements?: string; // 大纲生成要求
  description_requirements?: string; // 页面描述生成要求
  creation_type?: string;
  render_mode?: RenderMode;
  native_theme?: string;
  native_image_settings?: NativeImageSettings;
  template_image_url?: string; // 后端返回 template_image_url
  pronunciation_lexicon?: PronunciationEntry[];
  narration_preferences?: NarrationPreferences;
  template_image_path?: string; // 前端使用的别名
  template_style?: string; // 风格描述文本（无模板图模式）
  template_pack_id?: string | null; // 内置模板包标识
  schema_version?: number;
  last_workspace?: ContentProjectEntry | null;
  workspaces?: ProjectWorkspace[];
  // 导出设置
  export_extractor_method?: ExportExtractorMethod; // 组件提取方法
  export_inpaint_method?: ExportInpaintMethod; // 背景图获取方法
  export_allow_partial?: boolean; // 是否允许返回半成品（导出出错时继续而非停止）
  export_high_fidelity_editable?: boolean; // 高保真可编辑导出（默认关闭）
  enable_icon_subject_extraction?: boolean; // 已废弃
  image_aspect_ratio?: string; // 画面比例（如 16:9, 4:3）
  status: ProjectStatus;
  pages: Page[];
  active_image_tasks?: Task[];
  created_at: string;
  updated_at: string;
}

/**
 * 素材信息
 */
export type MaterialMediaKind = 'image' | 'audio' | 'video' | 'transcript';

export interface Material {
  id: string;
  project_id?: string | null;
  filename: string;
  url: string;
  relative_path: string;
  created_at: string;
  updated_at: string;
  prompt?: string;
  original_filename?: string | null;
  source_filename?: string;
  name?: string;
  caption?: string | null;
  media_kind?: MaterialMediaKind;
  purpose?: string;
  mime_type?: string | null;
  duration_ms?: number | null;
  source_note?: string | null;
  license_status?: string | null;
}

// 任务状态
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

// 任务信息
export interface Task {
  task_id: string;
  id?: string; // 别名
  task_type?: string;
  status: TaskStatus;
  progress?: {
    total: number;
    completed: number;
    failed?: number;
    [key: string]: any; // 允许额外的字段，如material_id, image_url等
  };
  error_message?: string;
  result?: any;
  error?: string; // 别名
  created_at?: string;
  completed_at?: string;
  dismissed_at?: string | null;
}

// 创建项目请求
export interface CreateProjectRequest {
  creation_type?: 'idea' | 'outline' | 'descriptions' | 'blank';
  idea_prompt?: string;
  outline_text?: string;
  description_text?: string;
  template_image?: File;
  template_style?: string;
  template_pack_id?: string | null;
  image_aspect_ratio?: string;
  render_mode?: RenderMode;
  native_theme?: string;
  native_image_settings?: NativeImageSettings;
  pronunciation_lexicon?: PronunciationEntry[];
  narration_preferences?: NarrationPreferences;
  initial_workspace?: ContentWorkspaceKind;
}

export interface NarrationQualityReport {
  provider: 'fish_audio' | 'edge';
  model: string;
  characters: number;
  requests: number;
  duration_seconds: number;
  elapsed_seconds: number;
  retry_count: number;
  quality_pages: Array<{
    page_index: number;
    similarity?: number;
    matched?: boolean;
    issues?: string[];
    asr_duration?: number;
    timing_quality?: NarrationTimingQuality;
    audio_sha256?: string;
    audio_timeline_sha256?: string;
    motion_manifest_sha256?: string;
    visual_renderer?: 'hyperframes' | 'browser_frames' | 'ken_burns' | 'static_frame';
    fallback_from?: 'hyperframes' | 'browser_frames';
    fallback_reason?: string;
  }>;
  warnings: string[];
  render_snapshot?: { path: string; sha256: string } | null;
}

// API响应
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  task_id?: string;
  message?: string;
  error?: string;
}

// 设置
export interface Settings {
  id: number;
  ai_provider_format: string;
  api_base_url?: string;
  api_key_length: number;
  fish_audio_api_key_length: number;
  fish_audio_model: 's2.1-pro-free' | string;
  fish_audio_voice_assets?: FishAudioVoiceAsset[];
  image_resolution: string;
  image_aspect_ratio: string;
  max_description_workers: number;
  max_image_workers: number;
  text_model?: string;
  image_model?: string;
  mineru_api_base?: string;
  mineru_token_length: number;
  image_caption_model?: string;
  output_language: 'zh' | 'en' | 'ja' | 'auto';
  // 描述生成模式
  description_generation_mode: 'streaming' | 'parallel';
  // 描述额外字段
  description_extra_fields?: string[];
  image_prompt_extra_fields?: string[];
  // 推理模式配置（分别控制文本和图像）
  enable_text_reasoning: boolean;
  text_thinking_budget: number;
  enable_image_reasoning: boolean;
  image_thinking_budget: number;
  enable_image_quality_control: boolean;
  baidu_api_key_length: number;
  // LazyLLM 配置
  text_model_source?: string;
  image_model_source?: string;
  image_caption_model_source?: string;
  lazyllm_api_keys_info?: Record<string, number>;  // {vendor: key_length}
  // Per-model API credentials (for gemini/openai per-model overrides)
  text_api_key_length: number;
  text_api_base_url?: string;
  image_api_key_length: number;
  image_api_base_url?: string;
  image_caption_api_key_length: number;
  image_caption_api_base_url?: string;
  // OpenAI image API protocol
  openai_image_api_protocol?: string;
  // OpenAI Codex OAuth
  openai_oauth_connected: boolean;
  openai_oauth_account_id?: string;
  created_at?: string;
  updated_at?: string;
}
