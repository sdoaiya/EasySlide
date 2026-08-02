import { apiClient, getApiBaseUrl } from './client';
import type { Project, Task, ApiResponse, CreateProjectRequest, Page, Material, NativeExportQualityReport, ProjectDashboardStats, ImageGenerationOptions, ImageGenerationResponse, FishAudioVoice, NarrationPreferences, PronunciationEntry, NarrationPolicy, NarrationVersion, ProjectNarrationSummary, NarrationVersionsResponse, NarrationCandidateResponse, NarrationPreviewResult, CreateNarrationVersionRequest, NarrationAiCandidateRequest, NarrationPreviewRequest, NarrationAiJobRequest, NarrationAiJobResult, NarrationAiJobStatus, NarrationAiJobSummary, NarrationCandidate, NarrationBatchApplyItem, NarrationBatchApplyResult, ContentProject, ContentProjectEntry, ContentSpine, ContentSyncProposal, ContentWorkspaceKind, ProjectWorkspace, WorkspaceVersion, WorkspaceGenerationRun, CreateWorkspaceGenerationRunRequest, OptimizeWorkspaceGenerationRunRequest } from '@/types';
import type { Settings } from '../types/index';
import type { NativeMotionSceneBundle, NativeSceneManifestRef } from '@/native-deck/exportNativeMotionBundle';
import type { NativeSceneManifest } from '@/native-deck/nativeSceneAdapter';

export type { Material };

// ===== 访问口令 API =====

export const checkAccessCode = async (): Promise<ApiResponse<{ enabled: boolean }>> => {
  const response = await apiClient.get<ApiResponse<{ enabled: boolean }>>('/api/access-code/check');
  return response.data;
};

export const verifyAccessCode = async (code: string): Promise<ApiResponse<{ valid: boolean }>> => {
  const response = await apiClient.post<ApiResponse<{ valid: boolean }>>('/api/access-code/verify', { code });
  return response.data;
};

// ===== 项目相关 API =====

/**
 * 创建项目
 */
export const createProject = async (data: CreateProjectRequest): Promise<ApiResponse<Project>> => {
  // 根据输入类型确定 creation_type
  let creation_type = data.creation_type || 'idea';
  if (data.description_text) {
    creation_type = 'descriptions';
  } else if (data.outline_text) {
    creation_type = 'outline';
  }

  const response = await apiClient.post<ApiResponse<Project>>('/api/projects', {
    creation_type,
    idea_prompt: data.idea_prompt,
    outline_text: data.outline_text,
    description_text: data.description_text,
    template_style: data.template_style,
    template_pack_id: data.template_pack_id,
    image_aspect_ratio: data.image_aspect_ratio,
    render_mode: data.render_mode,
    native_theme: data.native_theme,
    native_image_settings: data.native_image_settings,
    initial_workspace: data.initial_workspace,
  });
  return response.data;
};

/**
 * 上传模板图片
 */
export const uploadTemplate = async (
  projectId: string,
  templateImage: File
): Promise<ApiResponse<{ template_image_url: string }>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);

  const response = await apiClient.post<ApiResponse<{ template_image_url: string }>>(
    `/api/projects/${projectId}/template`,
    formData
  );
  return response.data;
};

/**
 * 获取项目列表（历史项目）
 */
export const listProjects = async (limit?: number, offset?: number, status?: 'completed' | 'generating' | 'in_progress', workspace?: 'ppt' | 'video' | 'podcast'): Promise<ApiResponse<{ projects: Project[]; total: number; stats?: ProjectDashboardStats }>> => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append('limit', limit.toString());
  if (offset !== undefined) params.append('offset', offset.toString());
  if (status) params.append('status', status);
  if (workspace) params.append('workspace', workspace);

  const queryString = params.toString();
  const url = `/api/projects${queryString ? `?${queryString}` : ''}`;
  const response = await apiClient.get<ApiResponse<{ projects: Project[]; total: number }>>(url);
  return response.data;
};

/**
 * 获取项目详情
 */
export const getProject = async (projectId: string): Promise<ApiResponse<Project>> => {
  const response = await apiClient.get<ApiResponse<Project>>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * 删除项目
 */
export const deleteProject = async (projectId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * 更新项目
 */
export const updateProject = async (
  projectId: string,
  data: Partial<Project>
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(`/api/projects/${projectId}`, data);
  return response.data;
};

/**
 * 更新页面顺序
 */
export const updatePagesOrder = async (
  projectId: string,
  pageIds: string[]
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(
    `/api/projects/${projectId}`,
    { pages_order: pageIds }
  );
  return response.data;
};

// ===== 大纲生成 =====

/**
 * 生成大纲
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateOutline = async (projectId: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/outline`,
    { language: lang }
  );
  return response.data;
};

/**
 * 流式生成大纲（SSE）
 * 返回 ReadableStream，每个 page 事件包含一个页面对象
 */
export interface OutlineStreamPage {
  index: number;
  title: string;
  points: string[];
  part?: string;
  description_text?: string;
  extra_fields?: Record<string, string>;
}

export interface OutlineStreamCallbacks {
  onPage: (page: OutlineStreamPage) => void;
  onDone: (data: { total: number; pages: Page[] }) => void;
  onError: (message: string) => void;
}

export const generateOutlineStream = async (
  projectId: string,
  callbacks: OutlineStreamCallbacks,
  language?: OutputLanguage,
  lockPageCount?: boolean,
): Promise<void> => {
  const lang = language || await getStoredOutputLanguage();
  const accessCode = localStorage.getItem('easyslide-access-code');

  const response = await fetch(`${getApiBaseUrl()}/api/projects/${projectId}/generate/outline/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
    },
    body: JSON.stringify({ language: lang, lock_page_count: lockPageCount }),
  });

  if (!response.ok || !response.body) {
    callbacks.onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7);
        else if (line.startsWith('data: ')) eventData = line.slice(6);
      }

      if (!eventType || !eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === 'page') callbacks.onPage(parsed);
        else if (eventType === 'done') callbacks.onDone(parsed);
        else if (eventType === 'error') callbacks.onError(parsed.message);
      } catch {
        // Skip malformed events
      }
    }

    readResult = await reader.read();
  }
};

// ===== 描述生成 =====

/**
 * 从描述文本生成大纲和页面描述（一次性完成）
 * @param projectId 项目ID
 * @param descriptionText 描述文本（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateFromDescription = async (projectId: string, descriptionText?: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/from-description`,
    { 
      ...(descriptionText ? { description_text: descriptionText } : {}),
      language: lang 
    }
  );
  return response.data;
};

/**
 * 批量生成描述（并行模式）
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const generateDescriptions = async (projectId: string, language?: OutputLanguage, detailLevel?: string): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/descriptions`,
    { language: lang, detail_level: detailLevel || 'default' }
  );
  return response.data;
};

/**
 * 流式生成描述（SSE）
 */
export interface DescriptionStreamEvent {
  page_index: number;
  page_id: string;
  text: string;
  extra_fields?: Record<string, string>;
}

export interface DescriptionStreamCallbacks {
  onDescription: (data: DescriptionStreamEvent) => void;
  onDone: (data: { total: number; pages: Page[] }) => void;
  onError: (message: string) => void;
}

export const generateDescriptionsStream = async (
  projectId: string,
  callbacks: DescriptionStreamCallbacks,
  language?: OutputLanguage,
  detailLevel?: string,
): Promise<void> => {
  const lang = language || await getStoredOutputLanguage();
  const accessCode = localStorage.getItem('easyslide-access-code');

  const response = await fetch(`${getApiBaseUrl()}/api/projects/${projectId}/generate/descriptions/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
    },
    body: JSON.stringify({ language: lang, detail_level: detailLevel || 'default' }),
  });

  if (!response.ok || !response.body) {
    callbacks.onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7);
        else if (line.startsWith('data: ')) eventData = line.slice(6);
      }

      if (!eventType || !eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === 'description') callbacks.onDescription(parsed);
        else if (eventType === 'done') callbacks.onDone(parsed);
        else if (eventType === 'error') callbacks.onError(parsed.message);
      } catch {
        // Skip malformed events
      }
    }

    readResult = await reader.read();
  }
};

/**
 * 生成单页描述
 */
export const generatePageDescription = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  language?: OutputLanguage,
  detailLevel?: string
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/description`,
    { force_regenerate: forceRegenerate, language: lang, detail_level: detailLevel || 'default' }
  );
  return response.data;
};

/**
 * 重新生成 PPT 翻新项目的单页（重新解析原 PDF 并提取内容）
 */
export const regenerateRenovationPage = async (
  projectId: string,
  pageId: string,
  keepLayout: boolean = false,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/regenerate-renovation`,
    { keep_layout: keepLayout, language: lang }
  );
  return response.data;
};

/**
 * 根据用户要求修改大纲
 * @param projectId 项目ID
 * @param userRequirement 用户要求
 * @param previousRequirements 历史要求（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const refineOutline = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/outline`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

/**
 * 根据用户要求修改页面描述
 * @param projectId 项目ID
 * @param userRequirement 用户要求
 * @param previousRequirements 历史要求（可选）
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 */
export const refineDescriptions = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/descriptions`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

// ===== 图片生成 =====

/**
 * 批量生成图片
 * @param projectId 项目ID
 * @param language 输出语言（可选，默认从 sessionStorage 获取）
 * @param pageIds 可选的页面ID列表，如果不提供则生成所有页面
 */
export const generateImages = async (
  projectId: string,
  language?: OutputLanguage,
  pageIds?: string[],
  options?: ImageGenerationOptions,
): Promise<ApiResponse<ImageGenerationResponse>> => {
  const lang = options?.language || language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<ImageGenerationResponse>>(
    `/api/projects/${projectId}/generate/images`,
    {
      language: lang,
      page_ids: pageIds,
      max_workers: options?.maxWorkers,
      use_template: options?.useTemplate,
      image_density: options?.density,
      image_style: options?.style,
      image_composition: options?.composition,
      image_restraint: options?.restraint,
      image_style_prompt: options?.customPrompt?.trim() || undefined,
    }
  );
  return response.data;
};

/**
 * 生成单页图片
 */
export const generatePageImage = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  options?: ImageGenerationOptions,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = options?.language || language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/image`,
    {
      force_regenerate: forceRegenerate,
      language: lang,
      max_workers: options?.maxWorkers,
      use_template: options?.useTemplate,
      image_density: options?.density,
      image_style: options?.style,
      image_composition: options?.composition,
      image_restraint: options?.restraint,
      image_style_prompt: options?.customPrompt?.trim() || undefined,
      quality_issues: options?.qualityIssues?.length ? options.qualityIssues : undefined,
    }
  );
  return response.data;
};

/**
 * 编辑图片（自然语言修改）
 */
export const editPageImage = async (
  projectId: string,
  pageId: string,
  editPrompt: string,
  contextImages?: {
    useTemplate?: boolean;
    descImageUrls?: string[];
    uploadedFiles?: File[];
  }
): Promise<ApiResponse> => {
  // 如果有上传的文件，使用 multipart/form-data
  if (contextImages?.uploadedFiles && contextImages.uploadedFiles.length > 0) {
    const formData = new FormData();
    formData.append('edit_instruction', editPrompt);
    formData.append('use_template', String(contextImages.useTemplate || false));
    if (contextImages.descImageUrls && contextImages.descImageUrls.length > 0) {
      formData.append('desc_image_urls', JSON.stringify(contextImages.descImageUrls));
    }
    // 添加上传的文件
    contextImages.uploadedFiles.forEach((file) => {
      formData.append('context_images', file);
    });

    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      formData
    );
    return response.data;
  } else {
    // 使用 JSON
    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      {
        edit_instruction: editPrompt,
        context_images: {
          use_template: contextImages?.useTemplate || false,
          desc_image_urls: contextImages?.descImageUrls || [],
        },
      }
    );
    return response.data;
  }
};

/**
 * 获取页面图片历史版本
 */
export const getPageImageVersions = async (
  projectId: string,
  pageId: string
): Promise<ApiResponse<{ versions: any[] }>> => {
  const response = await apiClient.get<ApiResponse<{ versions: any[] }>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions`
  );
  return response.data;
};

/**
 * 设置当前使用的图片版本
 */
export const setCurrentImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string
): Promise<ApiResponse> => {
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/set-current`
  );
  return response.data;
};

export const recoverPageImageScene = async (
  projectId: string,
  pageId: string,
  versionId: string,
  force = false
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/recover-scene`,
    { force }
  );
  return response.data;
};

// ===== 页面操作 =====

/**
 * 更新页面
 */
export const updatePage = async (
  projectId: string,
  pageId: string,
  data: Partial<Page>
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}`,
    data
  );
  return response.data;
};

export const getContentProject = async (projectId: string): Promise<ApiResponse<ContentProject>> => {
  const response = await apiClient.get<ApiResponse<ContentProject>>(`/api/content-projects/${projectId}`);
  return response.data;
};

export const confirmContentSpine = async (
  projectId: string,
  expectedRevision: number,
): Promise<ApiResponse<ContentSpine>> => {
  const response = await apiClient.post<ApiResponse<ContentSpine>>(
    `/api/content-projects/${projectId}/spine/confirm`,
    { expected_revision: expectedRevision },
  );
  return response.data;
};

export const updateContentSpine = async (
  projectId: string,
  document: Record<string, unknown>,
  expectedRevision: number,
): Promise<ApiResponse<ContentSpine>> => {
  const response = await apiClient.put<ApiResponse<ContentSpine>>(
    `/api/content-projects/${projectId}/spine`,
    { document, expected_revision: expectedRevision },
  );
  return response.data;
};

export interface ContentSpineOptimization {
  topic: string;
  audience: string;
  goal: string;
  rationale?: string;
}

export const optimizeContentSpine = async (
  projectId: string,
  context: Pick<ContentSpineOptimization, 'topic' | 'audience' | 'goal'>,
): Promise<ApiResponse<ContentSpineOptimization>> => {
  const response = await apiClient.post<ApiResponse<ContentSpineOptimization>>(
    `/api/content-projects/${projectId}/spine/optimize`,
    context,
  );
  return response.data;
};

/** 创建页使用的无状态简报优化：只返回建议，不落库、不创建工作区。 */
export const optimizeProjectBrief = async (
  context: Pick<ContentSpineOptimization, 'topic' | 'audience' | 'goal'>,
): Promise<ApiResponse<ContentSpineOptimization>> => {
  const response = await apiClient.post<ApiResponse<ContentSpineOptimization>>(
    '/api/projects/brief/optimize',
    context,
  );
  return response.data;
};

export const initializeContentWorkspace = async (
  projectId: string,
  kind: ContentWorkspaceKind,
  settings: Record<string, unknown> = {},
): Promise<ApiResponse<{ project_id: string; workspace_kind: ContentWorkspaceKind; task_id: string; status: string }>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/workspaces/${kind}/initialize`,
    { settings },
  );
  return response.data;
};

export const setLastProjectEntry = async (
  projectId: string,
  entry: ContentProjectEntry,
): Promise<ApiResponse<{ project_id: string; last_workspace: ContentProjectEntry }>> => {
  const response = await apiClient.put(`/api/content-projects/${projectId}/last-workspace`, { entry });
  return response.data;
};

// ===== 工作区生成运行 API（重构计划 §11） =====

export const createWorkspaceGenerationRun = async (
  projectId: string,
  data: CreateWorkspaceGenerationRunRequest,
): Promise<ApiResponse<WorkspaceGenerationRun>> => {
  const response = await apiClient.post<ApiResponse<WorkspaceGenerationRun>>(
    `/api/projects/${projectId}/workspace-generation-runs`,
    {
      target_workspace_kind: data.targetWorkspaceKind,
      source_kind: data.sourceKind,
      mode: data.mode,
      operation: data.operation,
      options: {
        ...(data.options || {}),
        ...(data.pageIds ? { page_ids: data.pageIds } : {}),
      },
    },
  );
  return response.data;
};

export const listWorkspaceGenerationRuns = async (
  projectId: string,
): Promise<ApiResponse<{ runs: WorkspaceGenerationRun[]; total: number }>> => {
  const response = await apiClient.get<ApiResponse<{ runs: WorkspaceGenerationRun[]; total: number }>>(
    `/api/projects/${projectId}/workspace-generation-runs`,
  );
  return response.data;
};

export const getWorkspaceGenerationRun = async (
  projectId: string,
  runId: string,
): Promise<ApiResponse<WorkspaceGenerationRun>> => {
  const response = await apiClient.get<ApiResponse<WorkspaceGenerationRun>>(
    `/api/projects/${projectId}/workspace-generation-runs/${runId}`,
  );
  return response.data;
};

export const controlWorkspaceGenerationRun = async (
  projectId: string,
  runId: string,
  action: 'pause' | 'resume' | 'cancel' | 'retry',
): Promise<ApiResponse<WorkspaceGenerationRun>> => {
  const response = await apiClient.post<ApiResponse<WorkspaceGenerationRun>>(
    `/api/projects/${projectId}/workspace-generation-runs/${runId}/${action}`,
  );
  return response.data;
};

export const publishWorkspaceGenerationRun = async (
  projectId: string,
  runId: string,
): Promise<ApiResponse<WorkspaceGenerationRun>> => {
  const response = await apiClient.post<ApiResponse<WorkspaceGenerationRun>>(
    `/api/projects/${projectId}/workspace-generation-runs/${runId}/publish`,
  );
  return response.data;
};

export const optimizeWorkspaceGenerationRun = async (
  projectId: string,
  runId: string,
  data: OptimizeWorkspaceGenerationRunRequest,
): Promise<ApiResponse<WorkspaceGenerationRun>> => {
  const response = await apiClient.post<ApiResponse<WorkspaceGenerationRun>>(
    `/api/projects/${projectId}/workspace-generation-runs/${runId}/optimize`,
    {
      item_ids: data.itemIds,
      operation: data.operation,
      instruction: data.instruction,
      style_profile_id: data.styleProfileId,
      expressiveness_id: data.expressivenessId,
      voice_profile_id: data.voiceProfileId,
    },
  );
  return response.data;
};

export const handoffVideoWorkspaceFrames = async (
  projectId: string,
  frames: Blob[] | Blob[][],
  pageIds: string[],
): Promise<ApiResponse<{ attached: boolean }>> => {
  const sequences = Array.isArray(frames[0]) ? frames as Blob[][] : (frames as Blob[]).map((frame) => [frame]);
  const formData = new FormData();
  formData.append('page_ids', JSON.stringify(pageIds));
  formData.append('frame_counts', JSON.stringify(sequences.map((sequence) => sequence.length)));
  sequences.flat().forEach((frame, index) => formData.append('frames', frame, `frame-${index + 1}.png`));
  const response = await apiClient.post<ApiResponse<{ attached: boolean }>>(
    `/api/content-projects/${projectId}/workspaces/video/browser-frames`,
    formData,
  );
  return response.data;
};

export const updateContentWorkspace = async (
  projectId: string,
  kind: 'video' | 'podcast',
  baseRevision: number,
  document: Record<string, unknown>,
  settings: Record<string, unknown>,
): Promise<ApiResponse<{ workspace: ProjectWorkspace; version: WorkspaceVersion }>> => {
  const response = await apiClient.put(
    `/api/content-projects/${projectId}/workspaces/${kind}`,
    { base_revision: baseRevision, document, settings },
  );
  return response.data;
};

export const proposeVideoToSpine = async (
  projectId: string,
  targetBaseRevision: number,
): Promise<ApiResponse<ContentSyncProposal>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/workspaces/video/propose-to-spine`,
    { target_base_revision: targetBaseRevision },
  );
  return response.data;
};

export const exportVideoWorkspace = async (
  projectId: string,
  options: {
    filename?: string;
    voice?: string;
    rate?: string;
    enableKenBurns?: boolean;
    renderProfile?: 'proof' | 'final';
    sourceProofTaskId?: string;
  } = {},
): Promise<ApiResponse<{ task_id: string; workspace_version: number }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; workspace_version: number }>>(
    `/api/content-projects/${projectId}/workspaces/video/export`,
    {
      filename: options.filename,
      voice: options.voice,
      rate: options.rate,
      enable_ken_burns: options.enableKenBurns,
      render_profile: options.renderProfile,
      source_proof_task_id: options.sourceProofTaskId,
    },
  );
  return response.data;
};

export const proposePodcastToSpine = async (
  projectId: string,
  targetBaseRevision: number,
): Promise<ApiResponse<ContentSyncProposal>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/workspaces/podcast/propose-to-spine`,
    { target_base_revision: targetBaseRevision },
  );
  return response.data;
};

export const exportPodcastWorkspace = async (
  projectId: string,
  options?: { filename?: string; format?: 'mp3' | 'wav' },
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post(`/api/content-projects/${projectId}/workspaces/podcast/export`, {
    filename: options?.filename,
    format: options?.format ?? 'mp3',
  });
  return response.data;
};

export const previewPodcastWorkspace = async (
  projectId: string,
  options: {
    provider: 'edge' | 'fish_audio';
    segmentId?: string;
    voice?: string;
    speed?: number;
  },
): Promise<ApiResponse<{
  audio_url: string;
  provider: 'edge' | 'fish_audio';
  timing_quality: string;
  cache_hit: boolean;
}>> => {
  let response;
  try {
    response = await apiClient.post<Blob>(
      `/api/content-projects/${projectId}/workspaces/podcast/preview`,
      {
        provider: options.provider,
        segment_id: options.segmentId,
        voice: options.voice,
        speed: options.speed,
      },
      { responseType: 'blob' },
    );
  } catch (error) {
    const blob = (error as { response?: { data?: unknown } }).response?.data;
    if (blob instanceof Blob && blob.type.includes('application/json')) {
      const text = typeof blob.text === 'function' ? await blob.text() : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      const payload = JSON.parse(text);
      const message = payload?.error?.message || payload?.message;
      if (message) throw new Error(message);
    }
    throw error;
  }
  return {
    success: true,
    message: '',
    data: {
      audio_url: URL.createObjectURL(response.data),
      provider: (response.headers['x-tts-provider'] || options.provider) as 'edge' | 'fish_audio',
      timing_quality: response.headers['x-timing-quality'] || 'estimated',
      cache_hit: response.headers['x-cache-hit'] === 'true',
    },
  };
};

export const listContentSyncProposals = async (
  projectId: string,
): Promise<ApiResponse<{ proposals: ContentSyncProposal[] }>> => {
  const response = await apiClient.get(`/api/content-projects/${projectId}/sync-proposals`);
  return response.data;
};

export const applyContentSyncProposal = async (
  projectId: string,
  proposalId: string,
  baseRevision: number,
  selectedItemIds: string[],
): Promise<ApiResponse<{ proposal: ContentSyncProposal }>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/sync-proposals/${proposalId}/apply`,
    { base_revision: baseRevision, selected_item_ids: selectedItemIds },
  );
  return response.data;
};

export const rejectContentSyncProposal = async (
  projectId: string,
  proposalId: string,
  selectedItemIds: string[],
): Promise<ApiResponse<ContentSyncProposal>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/sync-proposals/${proposalId}/reject`,
    { selected_item_ids: selectedItemIds },
  );
  return response.data;
};

export const listWorkspaceVersions = async (
  projectId: string,
  kind: ContentWorkspaceKind,
): Promise<ApiResponse<{ workspace: ProjectWorkspace; versions: WorkspaceVersion[] }>> => {
  const response = await apiClient.get(
    `/api/content-projects/${projectId}/workspaces/${kind}/versions`,
  );
  return response.data;
};

export const restoreWorkspaceVersion = async (
  projectId: string,
  kind: ContentWorkspaceKind,
  versionId: string,
  baseRevision: number,
): Promise<ApiResponse<{ workspace: ProjectWorkspace; version: WorkspaceVersion }>> => {
  const response = await apiClient.post(
    `/api/content-projects/${projectId}/workspaces/${kind}/versions/${versionId}/restore`,
    { base_revision: baseRevision },
  );
  return response.data;
};

export const uploadPageTemplate = async (
  projectId: string,
  pageId: string,
  templateImage: File
): Promise<ApiResponse<Page>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/template`,
    formData
  );
  return response.data;
};

export const updatePageTemplate = async (
  projectId: string,
  pageId: string,
  templateStyleText: string
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.patch<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/template`,
    { template_style_text: templateStyleText }
  );
  return response.data;
};

export const clearPageTemplate = async (projectId: string, pageId: string): Promise<ApiResponse<Page>> => {
  const response = await apiClient.delete<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/template`
  );
  return response.data;
};

export const autoMatchPageTemplates = async (
  projectId: string,
  overwriteExisting = true
): Promise<ApiResponse<{ matched: number; skipped: number; pages: Array<{ page_id: string; role: string; layout: string; source: string; reason: string }> }>> => {
  const response = await apiClient.post<ApiResponse<{ matched: number; skipped: number; pages: Array<{ page_id: string; role: string; layout: string; source: string; reason: string }> }>>(
    `/api/projects/${projectId}/pages/templates/auto-match`,
    { overwrite_existing: overwriteExisting }
  );
  return response.data;
};

/**
 * 更新页面描述
 */
export const updatePageDescription = async (
  projectId: string,
  pageId: string,
  descriptionContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/description`,
    { description_content: descriptionContent, language: lang }
  );
  return response.data;
};

/**
 * 更新页面大纲
 */
export const updatePageOutline = async (
  projectId: string,
  pageId: string,
  outlineContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/outline`,
    { outline_content: outlineContent, language: lang }
  );
  return response.data;
};

/**
 * 删除页面
 */
export const deletePage = async (projectId: string, pageId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}`
  );
  return response.data;
};

/**
 * 添加页面
 */
export const addPage = async (projectId: string, data: Partial<Page>): Promise<ApiResponse<Page>> => {
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages`,
    data
  );
  return response.data;
};

// ===== 任务查询 =====

/**
 * 查询任务状态
 */
export const getTaskStatus = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.get<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}`);
  return response.data;
};

export const pauseTask = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}/pause`);
  return response.data;
};

export const resumeTask = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}/resume`);
  return response.data;
};

export const cancelTask = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}/cancel`);
  return response.data;
};

export const retryTask = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}/retry`);
  return response.data;
};

export interface ServerTaskListParams {
  projectId?: string;
  workspaceKind?: string;
  status?: string;
  limit?: number;
  cursor?: number;
}

export interface ServerTaskListResponse {
  tasks: Task[];
  total: number;
  limit: number;
  cursor: number;
}

/**
 * 服务器任务列表（任务中心与项目任务面板共享的唯一事实源，计划 §5.3）
 */
export const listServerTasks = async (params: ServerTaskListParams = {}): Promise<ApiResponse<ServerTaskListResponse>> => {
  const query = new URLSearchParams();
  if (params.projectId) query.set('project_id', params.projectId);
  if (params.workspaceKind) query.set('workspace_kind', params.workspaceKind);
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', String(params.cursor));
  const response = await apiClient.get<ApiResponse<ServerTaskListResponse>>(`/api/tasks${query.toString() ? `?${query.toString()}` : ''}`);
  return response.data;
};

// ===== 旁白 (Narration) =====

/**
 * 更新页面旁白文本
 */
export const updatePageNarration = async (
  projectId: string,
  pageId: string,
  narrationText: string,
  narrationSegments?: Array<{ speaker_id: string; text: string; voice?: string; rate?: string }>
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/narration`,
    { narration_text: narrationText, narration_segments: narrationSegments }
  );
  return response.data;
};

/**
 * AI 生成单页旁白
 */
export const generatePageNarration = async (
  projectId: string,
  pageId: string,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/generate/narration`,
    { language: lang }
  );
  return response.data;
};

/**
 * 批量生成所有页面旁白
 */
export const generateAllNarrations = async (
  projectId: string,
  language?: OutputLanguage,
  forceRegenerate?: boolean
): Promise<ApiResponse<{ total: number; generated: number; skipped: number; failed: number; pages: Page[] }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ total: number; generated: number; skipped: number; failed: number; pages: Page[] }>>(
    `/api/projects/${projectId}/generate/narrations`,
    { language: lang, force_regenerate: forceRegenerate || false }
  );
  return response.data;
};

export const getProjectNarrations = async (
  projectId: string,
): Promise<ApiResponse<ProjectNarrationSummary>> => {
  const response = await apiClient.get<ApiResponse<ProjectNarrationSummary>>(
    `/api/projects/${projectId}/narrations`,
  );
  return response.data;
};

export const getPageNarrationVersions = async (
  projectId: string,
  pageId: string,
): Promise<ApiResponse<NarrationVersionsResponse>> => {
  const response = await apiClient.get<ApiResponse<NarrationVersionsResponse>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/versions`,
  );
  return response.data;
};

export const createPageNarrationVersion = async (
  projectId: string,
  pageId: string,
  data: CreateNarrationVersionRequest,
): Promise<ApiResponse<{ version: NarrationVersion; revision: number }>> => {
  const response = await apiClient.post<ApiResponse<{ version: NarrationVersion; revision: number }>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/versions`,
    {
      base_revision: data.baseRevision,
      mode: data.mode,
      language: data.language,
      text: data.text,
      segments: data.segments,
    },
  );
  return response.data;
};

export const applyNarrationVersion = async (
  projectId: string,
  pageId: string,
  versionId: string,
  baseRevision: number,
): Promise<ApiResponse<{ version: NarrationVersion; revision: number }>> => {
  const response = await apiClient.post<ApiResponse<{ version: NarrationVersion; revision: number }>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/versions/${versionId}/apply`,
    { base_revision: baseRevision },
  );
  return response.data;
};

export const discardNarrationCandidate = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<ApiResponse<{ version_id: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ version_id: string }>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/candidates/${versionId}`,
  );
  return response.data;
};

export const setPageNarrationLock = async (
  projectId: string,
  pageId: string,
  locked: boolean,
  baseRevision: number,
): Promise<ApiResponse<{ locked: boolean; revision: number }>> => {
  const response = await apiClient.put<ApiResponse<{ locked: boolean; revision: number }>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/lock`,
    { locked, base_revision: baseRevision },
  );
  return response.data;
};

export const createNarrationAiCandidate = async (
  projectId: string,
  pageId: string,
  data: NarrationAiCandidateRequest,
): Promise<ApiResponse<NarrationCandidateResponse>> => {
  const response = await apiClient.post<ApiResponse<NarrationCandidateResponse>>(
    `/api/projects/${projectId}/pages/${pageId}/narration/ai-candidates`,
    {
      operation: data.operation,
      base_version_id: data.baseVersionId,
      base_revision: data.baseRevision,
      selection: data.selection,
      instruction: data.instruction,
      generation_config: data.generationConfig,
    },
  );
  return response.data;
};

export const createNarrationAiJob = async (
  projectId: string,
  data: NarrationAiJobRequest,
): Promise<ApiResponse<{ task_id: string; status: NarrationAiJobStatus; total: number }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: NarrationAiJobStatus; total: number }>>(
    `/api/projects/${projectId}/narrations/ai-jobs`,
    {
      scope: data.scope,
      page_ids: data.pageIds,
      operation: data.operation,
      instruction: data.instruction,
      selection: data.selection,
      generation_config: data.generationConfig,
    },
  );
  return response.data;
};

export const getNarrationAiJobResult = async (
  projectId: string,
  taskId: string,
): Promise<ApiResponse<NarrationAiJobResult>> => {
  const response = await apiClient.get<ApiResponse<NarrationAiJobResult>>(
    `/api/projects/${projectId}/narrations/ai-jobs/${taskId}/result`,
  );
  return response.data;
};

/** 活动/历史 AI 文案任务列表；刷新后用于恢复任务展示（阶段3） */
export const listNarrationAiJobs = async (
  projectId: string,
  status?: 'active',
): Promise<ApiResponse<{ jobs: NarrationAiJobSummary[]; total: number }>> => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const query = params.toString();
  const response = await apiClient.get<ApiResponse<{ jobs: NarrationAiJobSummary[]; total: number }>>(
    `/api/projects/${projectId}/narrations/ai-jobs${query ? `?${query}` : ''}`,
  );
  return response.data;
};

/** 候选列表（稳定契约） */
export const listNarrationCandidates = async (
  projectId: string,
  options: { pageIds?: string[]; status?: 'candidate' | 'applied' | 'archived' } = {},
): Promise<ApiResponse<{ candidates: NarrationCandidate[]; total: number }>> => {
  const params = new URLSearchParams();
  (options.pageIds || []).forEach((pageId) => params.append('page_id', pageId));
  if (options.status) params.append('status', options.status);
  const query = params.toString();
  const response = await apiClient.get<ApiResponse<{ candidates: NarrationCandidate[]; total: number }>>(
    `/api/projects/${projectId}/narration-candidates${query ? `?${query}` : ''}`,
  );
  return response.data;
};

/** 逐页批量应用候选；每项携带 base_revision，冲突页跳过并报告 */
export const batchApplyNarrationCandidates = async (
  projectId: string,
  items: NarrationBatchApplyItem[],
): Promise<ApiResponse<{ results: NarrationBatchApplyResult[]; applied: number; conflicts: number }>> => {
  const response = await apiClient.post<ApiResponse<{ results: NarrationBatchApplyResult[]; applied: number; conflicts: number }>>(
    `/api/projects/${projectId}/narration-candidates/batch-apply`,
    { items },
  );
  return response.data;
};

/** 批量丢弃候选 */
export const batchArchiveNarrationCandidates = async (
  projectId: string,
  candidateIds: string[],
): Promise<ApiResponse<{ results: NarrationBatchApplyResult[]; archived: number }>> => {
  const response = await apiClient.post<ApiResponse<{ results: NarrationBatchApplyResult[]; archived: number }>>(
    `/api/projects/${projectId}/narration-candidates/batch-archive`,
    { candidate_ids: candidateIds },
  );
  return response.data;
};

const controlNarrationAiJob = async (projectId: string, taskId: string, action: 'pause' | 'resume' | 'cancel') => {
  const response = await apiClient.post<ApiResponse<{ status: NarrationAiJobStatus }>>(
    `/api/projects/${projectId}/narrations/ai-jobs/${taskId}/${action}`,
  );
  return response.data;
};

export const pauseNarrationAiJob = (projectId: string, taskId: string) => controlNarrationAiJob(projectId, taskId, 'pause');
export const resumeNarrationAiJob = (projectId: string, taskId: string) => controlNarrationAiJob(projectId, taskId, 'resume');
export const cancelNarrationAiJob = (projectId: string, taskId: string) => controlNarrationAiJob(projectId, taskId, 'cancel');

export const previewPageNarration = async (
  projectId: string,
  pageId: string,
  options: NarrationPreviewRequest,
): Promise<ApiResponse<NarrationPreviewResult>> => {
  let response;
  try {
    response = await apiClient.post<Blob>(
      `/api/projects/${projectId}/pages/${pageId}/narration/preview`,
      {
        version_id: options.versionId,
        draft: options.draft,
        segment_id: options.segmentId,
        tts_provider: options.ttsProvider,
        voice: options.voice,
        speakers: options.speakers,
        auto_emotion: options.autoEmotion,
      },
      { responseType: 'blob' },
    );
  } catch (error) {
    const blob = (error as { response?: { data?: unknown } }).response?.data;
    if (blob instanceof Blob && blob.type.includes('application/json')) {
      const text = typeof blob.text === 'function' ? await blob.text() : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      const payload = JSON.parse(text);
      const message = payload?.error?.message || payload?.message;
      if (message) throw new Error(message);
    }
    throw error;
  }
  return {
    success: true,
    data: {
      audio_url: URL.createObjectURL(response.data),
      provider: (response.headers['x-tts-provider'] || options.ttsProvider) as NarrationPreviewResult['provider'],
      timing_quality: (response.headers['x-timing-quality'] || 'estimated') as NarrationPreviewResult['timing_quality'],
      cache_hit: response.headers['x-cache-hit'] === 'true',
    },
  };
};

// ===== 导出 =====

/**
 * Helper function to build query string with page_ids
 */
const buildPageIdsQuery = (pageIds?: string[]): string => {
  if (!pageIds || pageIds.length === 0) return '';
  const params = new URLSearchParams();
  params.set('page_ids', pageIds.join(','));
  return `?${params.toString()}`;
};

const buildExportQuery = (params: Record<string, string | string[] | boolean | undefined>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(','));
      return;
    }
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * 导出为PPTX
 * @param projectId 项目ID
 * @param pageIds 可选的页面ID列表，如果不提供则导出所有页面
 */
export const exportPPTX = async (
  projectId: string,
  pageIds?: string[],
  options?: {
    transitionEnabled?: boolean;
    transitionEffects?: string[];
  }
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>> => {
  const url = `/api/projects/${projectId}/export/pptx${buildExportQuery({
    page_ids: pageIds,
    transition_enabled: options?.transitionEnabled ? true : undefined,
    transition_effects: options?.transitionEnabled ? options.transitionEffects : undefined,
  })}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>
  >(url);
  return response.data;
};

/**
 * 导出为PDF
 * @param projectId 项目ID
 * @param pageIds 可选的页面ID列表，如果不提供则导出所有页面
 */
export const exportPDF = async (
  projectId: string,
  pageIds?: string[]
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>> => {
  const url = `/api/projects/${projectId}/export/pdf${buildPageIdsQuery(pageIds)}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>
  >(url);
  return response.data;
};

/**
 * 导出为图片（单张直接下载，多张打包ZIP）
 */
export const exportImages = async (
  projectId: string,
  pageIds?: string[]
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>> => {
  const url = `/api/projects/${projectId}/export/images${buildPageIdsQuery(pageIds)}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string; filename?: string }>
  >(url);
  return response.data;
};

/**
 * 导出为可编辑PPTX（异步任务）
 * @param projectId 项目ID
 * @param filename 可选的文件名
 * @param pageIds 可选的页面ID列表，如果不提供则导出所有页面
 */
export const exportEditablePPTX = async (
  projectId: string,
  filename?: string,
  pageIds?: string[]
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<
    ApiResponse<{ task_id: string }>
  >(`/api/projects/${projectId}/export/editable-pptx`, {
    filename,
    page_ids: pageIds
  });
  return response.data;
};

/**
 * 列出项目已导出的文件
 */
export const listExports = async (
  projectId: string,
): Promise<ApiResponse<{ files: Array<{
  filename: string;
  type: string;
  size: number;
  modified_at: string;
  download_url: string;
}> }>> => {
  const response = await apiClient.get(`/api/projects/${projectId}/exports`);
  return response.data;
};

/**
 * 删除项目已导出的文件
 */
export const deleteExport = async (
  projectId: string,
  filename: string,
): Promise<ApiResponse<{ filename: string }>> => {
  const response = await apiClient.delete(
    `/api/projects/${projectId}/exports/${encodeURIComponent(filename)}`
  );
  return response.data;
};

export const clearExportCache = async (): Promise<ApiResponse<{
  deleted_files: number;
  freed_bytes: number;
  cleared_projects: number;
  skipped_active_projects: number;
}>> => {
  const response = await apiClient.delete('/api/projects/export-cache');
  return response.data;
};

/**
 * 导出为讲解视频（异步任务）
 * @param projectId 项目ID
 * @param options 导出选项
 */
export const exportVideo = async (
  projectId: string,
  options?: {
    filename?: string;
    pageIds?: string[];
    voice?: string;
    rate?: string;
    speed?: number;
    language?: string;
    generateNarration?: boolean;
    narrationMode?: 'single' | 'dialogue';
    speakers?: Array<{ id: string; name: string; voice: string; rate?: string }>;
    ttsProvider?: 'edge' | 'fish_audio';
    autoEmotion?: boolean;
    pronunciationLexicon?: PronunciationEntry[];
    narrationPreferences?: NarrationPreferences;
    narrationPolicy?: NarrationPolicy;
    narrationVersionMap?: Record<string, string>;
    enableKenBurns?: boolean;
    kenBurnsStyle?: 'auto' | 'zoom' | 'pan';
    includeNoImagePages?: boolean;
    presentationTopic?: string;
    narrationConfig?: {
      speaker_persona?: string;
      target_audience?: string;
      speech_tone?: string;
      presentation_topic?: string;
      min_words?: number;
      max_words?: number;
    };
    directorConfig?: {
      preset?: 'business' | 'training' | 'launch' | 'brief';
      motion_intensity?: 'minimal' | 'subtle' | 'standard';
      subtitle_mode?: 'standard' | 'highlight' | 'off';
      transition?: 'cut' | 'fade' | 'push';
      page_pause_ms?: number;
    };
  }
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<
    ApiResponse<{ task_id: string }>
  >(`/api/projects/${projectId}/export/video`, {
    filename: options?.filename,
    page_ids: options?.pageIds,
    voice: options?.voice,
    rate: options?.rate,
    speed: options?.speed,
    language: options?.language,
    generate_narration: options?.generateNarration ?? true,
    enable_ken_burns: options?.enableKenBurns ?? false,
    ken_burns_style: options?.kenBurnsStyle ?? 'auto',
    include_no_image_pages: options?.includeNoImagePages ?? false,
    presentation_topic: options?.presentationTopic,
    narration_config: options?.narrationConfig,
    narration_mode: options?.narrationMode,
    speakers: options?.speakers,
    tts_provider: options?.ttsProvider ?? 'edge',
    auto_emotion: options?.autoEmotion ?? true,
    pronunciation_lexicon: options?.pronunciationLexicon,
    narration_preferences: options?.narrationPreferences,
    narration_policy: options?.narrationPolicy,
    narration_version_map: options?.narrationVersionMap,
    director_config: options?.directorConfig,
  });
  return response.data;
};

export const addPagesBatch = async (
  projectId: string,
  pages: Array<Pick<Page, 'part' | 'outline_content' | 'description_content'>>,
): Promise<ApiResponse<{ pages: Page[] }>> => {
  const response = await apiClient.post<ApiResponse<{ pages: Page[] }>>(
    `/api/projects/${projectId}/pages/batch`,
    { pages },
  );
  return response.data;
};

export interface VideoExportPreflight {
  can_export: boolean;
  errors: string[];
  warnings: string[];
  total_pages: number;
  pages_with_narration: number;
  missing_images: number[];
  missing_narration: number[];
  scene_animation: {
    enabled: boolean;
    animated_pages: number[];
    fallback_pages: Array<{
      page: number;
      level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
      reason: string;
      strategy: 'ken_burns_or_static';
    }>;
    page_levels: Array<{
      page: number;
      level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
      reason: string;
    }>;
    errors: Array<{ page: number; reason: string }>;
  };
  estimate: {
    characters: number;
    estimated_seconds: number;
    requests: number;
    roles: number;
    free_model_notice: string;
  };
}

export const preflightExportVideo = async (
  projectId: string,
  options?: {
    pageIds?: string[];
    generateNarration?: boolean;
    includeNoImagePages?: boolean;
    ttsProvider?: 'edge' | 'fish_audio';
    voice?: string;
    narrationMode?: 'single' | 'dialogue';
    speakers?: Array<{ id: string; name: string; voice: string; rate?: string }>;
    speed?: number;
    narrationPolicy?: NarrationPolicy;
    narrationVersionMap?: Record<string, string>;
  },
): Promise<ApiResponse<VideoExportPreflight>> => {
  const response = await apiClient.post<ApiResponse<VideoExportPreflight>>(`/api/projects/${projectId}/export/video/preflight`, {
    page_ids: options?.pageIds,
    generate_narration: options?.generateNarration ?? true,
    include_no_image_pages: options?.includeNoImagePages ?? false,
    tts_provider: options?.ttsProvider ?? 'edge',
    voice: options?.voice,
    narration_mode: options?.narrationMode,
    speakers: options?.speakers,
    speed: options?.speed,
    narration_policy: options?.narrationPolicy,
    narration_version_map: options?.narrationVersionMap,
  });
  return response.data;
};

export const previewFishNarration = async (
  projectId: string,
  options: {
    text: string;
    voice: string;
    speed?: number;
    autoEmotion?: boolean;
    pronunciationLexicon?: PronunciationEntry[];
  },
): Promise<Blob> => {
  const response = await apiClient.post(
    `/api/projects/${projectId}/narration/preview`,
    {
      text: options.text,
      voice: options.voice,
      speed: options.speed ?? 1,
      auto_emotion: options.autoEmotion ?? true,
      pronunciation_lexicon: options.pronunciationLexicon,
    },
    { responseType: 'blob' },
  );
  return response.data;
};

export const createNativeSceneManifestRefs = async (
  sceneManifests: NativeSceneManifest[],
  pageIds: string[],
): Promise<NativeSceneManifestRef[]> => {
  if (sceneManifests.length !== pageIds.length || sceneManifests.some((manifest, index) => manifest.page_id !== pageIds[index])) {
    throw new Error('场景清单顺序与导出页面不一致');
  }
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持场景清单完整性校验');

  return Promise.all(sceneManifests.map(async (manifest) => {
    const content = new TextEncoder().encode(JSON.stringify(sortJsonValue(manifest)));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', content);
    return {
      page_id: manifest.page_id,
      sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
  }));
};

export const exportNativeVideo = async (
  projectId: string,
  frames: Blob[] | Blob[][],
  pageIds: string[],
  filename?: string,
  directorConfig?: {
    preset?: 'business' | 'training' | 'launch' | 'brief';
    motion_intensity?: 'minimal' | 'subtle' | 'standard';
    subtitle_mode?: 'standard' | 'highlight' | 'off';
    transition?: 'cut' | 'fade' | 'push';
    page_pause_ms?: number;
  },
  narrationOptions?: {
    ttsProvider?: 'edge' | 'fish_audio';
    voice?: string;
    rate?: string;
    speed?: number;
    language?: string;
    generateNarration?: boolean;
    narrationMode?: 'single' | 'dialogue';
    speakers?: Array<{ id: string; name: string; voice: string; rate?: string }>;
    narrationConfig?: {
      speaker_persona?: string;
      target_audience?: string;
      speech_tone?: string;
      presentation_topic?: string;
      min_words?: number;
      max_words?: number;
    };
    autoEmotion?: boolean;
    pronunciationLexicon?: PronunciationEntry[];
    narrationPreferences?: NarrationPreferences;
    narrationPolicy?: NarrationPolicy;
    narrationVersionMap?: Record<string, string>;
  },
  sceneManifests?: NativeSceneManifest[],
  bundles?: NativeMotionSceneBundle[],
): Promise<ApiResponse<{ task_id: string }>> => {
  const formData = new FormData();
  formData.append('page_ids', JSON.stringify(pageIds));
  if (filename) formData.append('filename', filename);
  if (directorConfig) formData.append('director_config', JSON.stringify(directorConfig));
  formData.append('tts_provider', narrationOptions?.ttsProvider ?? 'edge');
  if (narrationOptions?.voice) formData.append('voice', narrationOptions.voice);
  if (narrationOptions?.rate) formData.append('rate', narrationOptions.rate);
  if (narrationOptions?.speed !== undefined) formData.append('speed', String(narrationOptions.speed));
  if (narrationOptions?.language) formData.append('language', narrationOptions.language);
  formData.append('generate_narration', String(narrationOptions?.generateNarration ?? true));
  if (narrationOptions?.narrationMode) formData.append('narration_mode', narrationOptions.narrationMode);
  if (narrationOptions?.speakers) formData.append('speakers', JSON.stringify(narrationOptions.speakers));
  if (narrationOptions?.narrationConfig) formData.append('narration_config', JSON.stringify(narrationOptions.narrationConfig));
  formData.append('auto_emotion', String(narrationOptions?.autoEmotion ?? true));
  if (narrationOptions?.pronunciationLexicon) formData.append('pronunciation_lexicon', JSON.stringify(narrationOptions.pronunciationLexicon));
  if (narrationOptions?.narrationPreferences) formData.append('narration_preferences', JSON.stringify(narrationOptions.narrationPreferences));
  if (narrationOptions?.narrationPolicy) formData.append('narration_policy', narrationOptions.narrationPolicy);
  if (narrationOptions?.narrationVersionMap) formData.append('narration_version_map', JSON.stringify(narrationOptions.narrationVersionMap));
  if (sceneManifests !== undefined) {
    if (sceneManifests.length !== pageIds.length || sceneManifests.some((manifest, index) => manifest.page_id !== pageIds[index])) {
      throw new Error('场景清单顺序与导出页面不一致');
    }
    formData.append('scene_manifests', JSON.stringify(sceneManifests));
  }
  if (bundles !== undefined) {
    if (sceneManifests === undefined) throw new Error('上传原生场景包时必须同时提供场景清单');
    if (bundles.length !== pageIds.length) throw new Error('场景包数量与导出页面不一致');
    if (bundles.some((bundle, index) => bundle.page_id !== pageIds[index])) {
      throw new Error('场景包顺序与导出页面不一致');
    }
    const refs = await createNativeSceneManifestRefs(sceneManifests, pageIds);
    if (bundles.some((bundle, index) => bundle.scene_manifest_sha256 !== refs[index].sha256)) {
      throw new Error('场景包哈希与场景清单不一致');
    }
    formData.append('native_scene_bundles', JSON.stringify(bundles));
  }
  const sequences = Array.isArray(frames[0]) ? frames as Blob[][] : (frames as Blob[]).map((frame) => [frame]);
  formData.append('frame_counts', JSON.stringify(sequences.map((sequence) => sequence.length)));
  sequences.flat().forEach((frame, index) => formData.append('frames', frame, `frame-${index + 1}.png`));
  const response = await apiClient.post<ApiResponse<{ task_id: string }>>(
    `/api/projects/${projectId}/export/native-video`,
    formData,
  );
  return response.data;
};

// ===== 素材生成 =====

/**
 * 生成单张素材图片（不绑定具体页面）
 * 现在返回异步任务ID，需要通过getTaskStatus轮询获取结果
 */
export const generateMaterialImage = async (
  projectId: string,
  prompt: string,
  refImage?: File | null,
  extraImages?: File[],
  aspectRatio?: string
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const formData = new FormData();
  formData.append('prompt', prompt);
  if (aspectRatio) {
    formData.append('aspect_ratio', aspectRatio);
  }
  if (refImage) {
    formData.append('ref_image', refImage);
  }

  if (extraImages && extraImages.length > 0) {
    extraImages.forEach((file) => {
      formData.append('extra_images', file);
    });
  }

  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/materials/generate`,
    formData
  );
  return response.data;
};

export type MaterialProcessOperation =
  | 'generate'
  | 'edit_full'
  | 'region_edit'
  | 'erase_region';

export interface MaterialSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  image_width: number;
  image_height: number;
}

export interface ProcessMaterialOptions {
  operation: MaterialProcessOperation;
  prompt?: string;
  sourceImage?: File | null;
  refImage?: File | null;
  extraImages?: File[];
  aspectRatio?: string;
  selection?: MaterialSelectionRect | null;
  applyMode?: 'overlay_selection' | 'replace_full';
}

export const processMaterialImage = async (
  projectId: string,
  options: ProcessMaterialOptions
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const formData = new FormData();
  formData.append('operation', options.operation);
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  }
  if (options.aspectRatio) {
    formData.append('aspect_ratio', options.aspectRatio);
  }
  if (options.applyMode) {
    formData.append('apply_mode', options.applyMode);
  }
  if (options.selection) {
    formData.append('selection', JSON.stringify(options.selection));
  }
  if (options.sourceImage) {
    formData.append('source_image', options.sourceImage);
  }
  if (options.refImage) {
    formData.append('ref_image', options.refImage);
  }
  if (options.extraImages && options.extraImages.length > 0) {
    options.extraImages.forEach((file) => {
      formData.append('extra_images', file);
    });
  }

  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/materials/process`,
    formData
  );
  return response.data;
};

/**
 * 获取素材列表
 * @param projectId 项目ID，可选
 *   - If provided and not 'all' or 'none': Get materials for specific project via /api/projects/{projectId}/materials
 *   - If 'all': Get all materials via /api/materials?project_id=all
 *   - If 'none': Get global materials (not bound to any project) via /api/materials?project_id=none
 *   - If not provided: Get all materials via /api/materials
 */
export const listMaterials = async (
  projectId?: string,
  filters?: { mediaKind?: Material['media_kind'] | Material['media_kind'][]; purpose?: string }
): Promise<ApiResponse<{ materials: Material[]; count: number }>> => {
  let url: string;

  if (!projectId || projectId === 'all') {
    // Get all materials using global endpoint
    url = '/api/materials?project_id=all';
  } else if (projectId === 'none') {
    // Get global materials (not bound to any project)
    url = '/api/materials?project_id=none';
  } else {
    // Get materials for specific project
    url = `/api/projects/${projectId}/materials`;
  }

  const query: string[] = [];
  if (filters?.mediaKind) {
    const mediaKind = Array.isArray(filters.mediaKind) ? filters.mediaKind.join(',') : filters.mediaKind;
    query.push(`media_kind=${encodeURIComponent(mediaKind)}`);
  }
  if (filters?.purpose) query.push(`purpose=${encodeURIComponent(filters.purpose)}`);
  if (query.length) url += `${url.includes('?') ? '&' : '?'}${query.join('&')}`;

  const response = await apiClient.get<ApiResponse<{ materials: Material[]; count: number }>>(url);
  return response.data;
};

/**
 * 上传素材图片
 * @param file 图片文件
 * @param projectId 可选的项目ID
 *   - If provided: Upload material bound to the project
 *   - If not provided or 'none': Upload as global material (not bound to any project)
 */
export const uploadMaterial = async (
  file: File,
  projectId?: string | null,
  generateCaption?: boolean
): Promise<ApiResponse<Material & { caption?: string }>> => {
  const formData = new FormData();
  formData.append('file', file);

  let url: string;
  if (!projectId || projectId === 'none') {
    // Use global upload endpoint for materials not bound to any project
    url = '/api/materials/upload';
  } else {
    // Use project-specific upload endpoint
    url = `/api/projects/${projectId}/materials/upload`;
  }

  if (generateCaption) {
    url += (url.includes('?') ? '&' : '?') + 'generate_caption=true';
  }

  const response = await apiClient.post<ApiResponse<Material & { caption?: string }>>(url, formData);
  return response.data;
};

/**
 * 删除素材
 */
export const deleteMaterial = async (materialId: string): Promise<ApiResponse<{ id: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ id: string }>>(`/api/materials/${materialId}`);
  return response.data;
};

/**
 * Generate caption for an existing material
 */
export const getMaterialCaption = async (materialId: string): Promise<ApiResponse<{ caption: string }>> => {
  const response = await apiClient.get<ApiResponse<{ caption: string }>>(`/api/materials/${materialId}/caption`);
  return response.data;
};

/**
 * Get material by URL and ensure it has a caption
 */
export const getMaterialByUrl = async (url: string): Promise<ApiResponse<Material>> => {
  const response = await apiClient.get<ApiResponse<Material>>(`/api/materials/by-url`, { params: { url } });
  return response.data;
};

/**
 * Download selected materials bundled as a zip archive.
 */
export const downloadMaterialsZip = async (
  materialIds: string[]
): Promise<ApiResponse<{ download_url: string }>> => {
  const { data: blob } = await apiClient.post<Blob>(
    '/api/materials/download',
    { material_ids: materialIds },
    { responseType: 'blob' },
  );

  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href,
    download: 'materials.zip',
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);

  return { success: true, data: { download_url: '' } };
};

/**
 * 关联素材到项目（通过URL）
 * @param projectId 项目ID
 * @param materialUrls 素材URL列表
 */
export const associateMaterialsToProject = async (
  projectId: string,
  materialUrls: string[]
): Promise<ApiResponse<{ updated_ids: string[]; count: number }>> => {
  const response = await apiClient.post<ApiResponse<{ updated_ids: string[]; count: number }>>(
    '/api/materials/associate',
    { project_id: projectId, material_urls: materialUrls }
  );
  return response.data;
};

// ===== 用户模板 =====

export interface UserTemplate {
  template_id: string;
  name?: string;
  template_image_url: string;
  thumb_url?: string;  // Thumbnail URL for faster loading
  created_at?: string;
  updated_at?: string;
}

/**
 * 上传用户模板
 */
export const uploadUserTemplate = async (
  templateImage: File,
  name?: string
): Promise<ApiResponse<UserTemplate>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);
  if (name) {
    formData.append('name', name);
  }

  const response = await apiClient.post<ApiResponse<UserTemplate>>(
    '/api/user-templates',
    formData
  );
  return response.data;
};

/**
 * 获取用户模板列表
 */
export const listUserTemplates = async (): Promise<ApiResponse<{ templates: UserTemplate[] }>> => {
  const response = await apiClient.get<ApiResponse<{ templates: UserTemplate[] }>>(
    '/api/user-templates'
  );
  return response.data;
};

/**
 * 删除用户模板
 */
export const deleteUserTemplate = async (templateId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/user-templates/${templateId}`);
  return response.data;
};

// ===== 参考文件相关 API =====

export interface UserStyleTemplate {
  id: string;
  name: string;
  description: string;
  color?: string;
  created_at?: string;
}

export const createUserStyleTemplate = async (
  data: { name: string; description: string; color?: string }
): Promise<ApiResponse<UserStyleTemplate>> => {
  const response = await apiClient.post<ApiResponse<UserStyleTemplate>>(
    '/api/user-style-templates',
    data
  );
  return response.data;
};

export const listUserStyleTemplates = async (): Promise<ApiResponse<{ templates: UserStyleTemplate[] }>> => {
  const response = await apiClient.get<ApiResponse<{ templates: UserStyleTemplate[] }>>(
    '/api/user-style-templates'
  );
  return response.data;
};

export const deleteUserStyleTemplate = async (id: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/user-style-templates/${id}`);
  return response.data;
};

// ===== 参考文件相关 API =====

export interface ReferenceFile {
  id: string;
  project_id: string | null;
  filename: string;
  file_size: number;
  file_type: string;
  parse_status: 'pending' | 'parsing' | 'completed' | 'failed';
  markdown_content: string | null;
  error_message: string | null;
  image_caption_failed_count?: number;  // Optional, calculated dynamically
  created_at: string;
  updated_at: string;
}

/**
 * 上传参考文件
 * @param file 文件
 * @param projectId 可选的项目ID（如果不提供或为'none'，则为全局文件）
 */
export const uploadReferenceFile = async (
  file: File,
  projectId?: string | null
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId && projectId !== 'none') {
    formData.append('project_id', projectId);
  }

  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    '/api/reference-files/upload',
    formData
  );
  return response.data;
};

/**
 * 获取参考文件信息
 * @param fileId 文件ID
 */
export const getReferenceFile = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.get<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * 列出项目的参考文件
 * @param projectId 项目ID（'global' 或 'none' 表示列出全局文件）
 */
export const listProjectReferenceFiles = async (
  projectId: string
): Promise<ApiResponse<{ files: ReferenceFile[] }>> => {
  const response = await apiClient.get<ApiResponse<{ files: ReferenceFile[] }>>(
    `/api/reference-files/project/${projectId}`
  );
  return response.data;
};

/**
 * 删除参考文件
 * @param fileId 文件ID
 */
export const deleteReferenceFile = async (fileId: string): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * 触发文件解析
 * @param fileId 文件ID
 */
export const triggerFileParse = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/parse`
  );
  return response.data;
};

/**
 * 将参考文件关联到项目
 * @param fileId 文件ID
 * @param projectId 项目ID
 */
export const associateFileToProject = async (
  fileId: string,
  projectId: string
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}/associate`,
    { project_id: projectId }
  );
  return response.data;
};

/**
 * 从项目中移除参考文件（不删除文件本身）
 * @param fileId 文件ID
 */
export const dissociateFileFromProject = async (
  fileId: string
): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/dissociate`
  );
  return response.data;
};

// ===== 输出语言设置 =====

export type OutputLanguage = 'zh' | 'ja' | 'en' | 'auto';

export interface OutputLanguageOption {
  value: OutputLanguage;
  label: string;
}

export const OUTPUT_LANGUAGE_OPTIONS: OutputLanguageOption[] = [
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: '自动' },
];

/**
 * 获取默认输出语言设置（从服务器环境变量读取）
 *
 * 注意：这只返回服务器配置的默认语言。
 * 实际的语言选择应由前端在 sessionStorage 中管理，
 * 并在每次生成请求时通过 language 参数传递。
 */
export const getDefaultOutputLanguage = async (): Promise<ApiResponse<{ language: OutputLanguage }>> => {
  const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>(
    '/api/output-language'
  );
  return response.data;
};

/**
 * 从后端 Settings 获取用户的输出语言偏好
 * 如果获取失败，返回默认值 'zh'
 */
export const getStoredOutputLanguage = async (): Promise<OutputLanguage> => {
  try {
    const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>('/api/output-language');
    return response.data.data?.language || 'zh';
  } catch (error) {
    console.warn('Failed to load output language from settings, using default', error);
    return 'zh';
  }
};

/**
 * 获取系统设置
 */
export const getSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.get<ApiResponse<Settings>>('/api/settings');
  return response.data;
};

/**
 * 更新系统设置
 */
export const updateSettings = async (
  data: Partial<Omit<Settings, 'id' | 'api_key_length' | 'fish_audio_api_key_length' | 'fish_audio_model' | 'mineru_token_length' | 'baidu_api_key_length' | 'created_at' | 'updated_at'>> & {
    api_key?: string;
    fish_audio_api_key?: string;
    mineru_token?: string;
    baidu_api_key?: string;
    text_api_key?: string;
    image_api_key?: string;
    image_caption_api_key?: string;
    lazyllm_api_keys?: Record<string, string>;
  }
): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.put<ApiResponse<Settings>>('/api/settings', data);
  return response.data;
};

/**
 * 重置系统设置
 */
export const resetSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.post<ApiResponse<Settings>>('/api/settings/reset');
  return response.data;
};

export const verifyFishAudio = async (
  apiKey?: string,
): Promise<ApiResponse<{ connected: boolean; model: string; voice_count_sampled: number }>> => {
  const response = await apiClient.post('/api/settings/fish-audio/verify', { api_key: apiKey || undefined });
  return response.data;
};

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

export const getFishAudioVoices = async (params?: { scope?: 'private' | 'public' | 'all'; sortBy?: string; pageSize?: number }): Promise<ApiResponse<{ voices: FishAudioVoice[] }>> => {
  const response = await apiClient.get('/api/settings/fish-audio/voices', {
    params: {
      scope: params?.scope,
      sort_by: params?.sortBy,
      page_size: params?.pageSize,
    },
  });
  return response.data;
};

export const previewFishAudioVoice = async (voiceId: string, text?: string): Promise<Blob> => {
  const response = await apiClient.post(`/api/settings/fish-audio/voices/${encodeURIComponent(voiceId)}/preview`, { text }, { responseType: 'blob' });
  return response.data;
};

export const getFishAudioCapabilities = async (): Promise<ApiResponse<{
  model: string;
  tts: boolean;
  asr: boolean;
  voice_clone: boolean;
  multi_speaker: boolean;
  voice_design: { available: boolean; reason: string };
}>> => {
  const response = await apiClient.get('/api/settings/fish-audio/capabilities');
  return response.data;
};

export const createFishAudioVoice = async (data: {
  title: string;
  files: File[];
  transcripts?: string[];
  consentConfirmed: boolean;
}): Promise<ApiResponse<FishAudioVoice>> => {
  const form = new FormData();
  form.append('title', data.title);
  form.append('consent_confirmed', String(data.consentConfirmed));
  data.files.forEach((file, index) => {
    form.append('voices', file);
    form.append('texts', data.transcripts?.[index] || '');
  });
  const response = await apiClient.post('/api/settings/fish-audio/voices', form);
  return response.data;
};

export const deleteFishAudioVoice = async (voiceId: string): Promise<ApiResponse<{ id: string }>> => {
  const response = await apiClient.delete(`/api/settings/fish-audio/voices/${encodeURIComponent(voiceId)}`);
  return response.data;
};

/**
 * OpenAI OAuth: get authorization URL
 */
export const getOpenAIOAuthUrl = async (): Promise<ApiResponse<{ auth_url: string; callback_server_available?: boolean }>> => {
  const response = await apiClient.get<ApiResponse<{ auth_url: string; callback_server_available?: boolean }>>('/api/settings/openai-oauth/authorize');
  return response.data;
};

/**
 * OpenAI OAuth: disconnect
 */
export const disconnectOpenAIOAuth = async (): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/settings/openai-oauth/disconnect');
  return response.data;
};

/**
 * OpenAI OAuth: get connection status
 */
export const getOpenAIOAuthStatus = async (): Promise<ApiResponse<{ connected: boolean; account_id: string | null }>> => {
  const response = await apiClient.get<ApiResponse<{ connected: boolean; account_id: string | null }>>('/api/settings/openai-oauth/status');
  return response.data;
};

/**
 * OpenAI OAuth: list available models
 */
export const getOpenAIOAuthModels = async (): Promise<ApiResponse<{ models: string[]; text_models?: string[]; image_models?: string[] }>> => {
  const response = await apiClient.get<ApiResponse<{ models: string[]; text_models?: string[]; image_models?: string[] }>>('/api/settings/openai-oauth/models');
  return response.data;
};

export const createNativePptxExport = async (
  projectId: string,
  format: 'pptx' | 'pdf' | 'html' = 'pptx',
): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/export/native-pptx`, { format });
  return response.data;
};

export const generateNativeDeck = async (projectId: string, pageIds?: string[]): Promise<ApiResponse<Task>> => {
  const response = await apiClient.post<ApiResponse<Task>>(`/api/projects/${projectId}/generate/native-deck`, pageIds?.length ? { page_ids: pageIds } : {});
  return response.data;
};

export type NativePageVersion = {
  version_id: string;
  version_number: number;
  is_current: boolean;
  layout: string;
  props: Record<string, unknown>;
  created_at?: string | null;
};

export const getNativePageVersions = async (projectId: string, pageId: string): Promise<ApiResponse<{ versions: NativePageVersion[] }>> => {
  const response = await apiClient.get<ApiResponse<{ versions: NativePageVersion[] }>>(`/api/projects/${projectId}/pages/${pageId}/native/versions`);
  return response.data;
};

export const restoreNativePageVersion = async (projectId: string, pageId: string, versionId: string): Promise<ApiResponse> => {
  const response = await apiClient.put<ApiResponse>(`/api/projects/${projectId}/pages/${pageId}/native/versions/${versionId}`);
  return response.data;
};

export const updateNativePptxProgress = async (
  projectId: string,
  taskId: string,
  progress: { total?: number; completed?: number; percent?: number; current_step?: string; messages?: string[]; warnings?: string[] },
): Promise<ApiResponse<Task>> => {
  const response = await apiClient.put<ApiResponse<Task>>(
    `/api/projects/${projectId}/export/native-pptx/${taskId}/progress`,
    progress,
  );
  return response.data;
};

export const completeNativePptxExport = async (
  projectId: string,
  taskId: string,
  blob: Blob,
  report: NativeExportQualityReport,
  filename: string,
): Promise<ApiResponse<Task>> => {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('filename', filename);
  form.append('report', JSON.stringify(report));
  const response = await apiClient.post<ApiResponse<Task>>(
    `/api/projects/${projectId}/export/native-pptx/${taskId}/complete`,
    form,
  );
  return response.data;
};

export interface ModelOptionsRequest {
  provider: string;
  model_type: 'text' | 'image' | 'image_caption';
  api_key?: string;
  api_base_url?: string;
}

export const getModelOptions = async (
  data: ModelOptionsRequest
): Promise<ApiResponse<{ models: string[] }>> => {
  const response = await apiClient.post<ApiResponse<{ models: string[] }>>('/api/settings/model-options', data);
  return response.data;
};

/**
 * 手动提交 OAuth 回调 URL（端口 1455 不可用时的兜底）
 */
export const submitOAuthManualCallback = async (callbackUrl: string): Promise<ApiResponse<{ message: string; account_id: string | null }>> => {
  const response = await apiClient.post<ApiResponse<{ message: string; account_id: string | null }>>('/api/settings/openai-oauth/manual-callback', { callback_url: callbackUrl });
  return response.data;
};

/**
 * 验证 API key 是否可用
 */
export const verifyApiKey = async (): Promise<ApiResponse<{ available: boolean; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ available: boolean; message: string }>>('/api/settings/verify');
  return response.data;
};

/**
 * 可选的测试设置类型
 */
export interface TestSettingsOverride {
  api_key?: string;
  api_base_url?: string;
  text_model?: string;
  image_model?: string;
  image_caption_model?: string;
  image_caption_model_source?: string;
  mineru_api_base?: string;
  mineru_token?: string;
  baidu_api_key?: string;
  ai_provider_format?: string;
  image_resolution?: string;
  enable_text_reasoning?: boolean;
  text_thinking_budget?: number;
  enable_image_reasoning?: boolean;
  image_thinking_budget?: number;
}

/**
 * 测试百度 OCR 服务（异步）
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testBaiduOcr = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/baidu-ocr', settings || {});
  return response.data;
};

/**
 * 测试文本生成模型（异步）
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testTextModel = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/text-model', settings || {});
  return response.data;
};

/**
 * 测试图片识别模型（异步）
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testCaptionModel = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/caption-model', settings || {});
  return response.data;
};

/**
 * 测试百度图像修复（异步）
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testBaiduInpaint = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/baidu-inpaint', settings || {});
  return response.data;
};

/**
 * 测试图像生成模型（异步）
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testImageModel = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/image-model', settings || {});
  return response.data;
};

/**
 * Test built-in Paddle PDF parsing (async)
 * @param settings 可选的设置覆盖（未保存的设置）
 * @returns 返回任务ID，需要通过 getTestStatus 轮询结果
 */
export const testMineruPdf = async (settings?: TestSettingsOverride): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>('/api/settings/tests/mineru-pdf', settings || {});
  return response.data;
};

/**
 * 查询测试任务状态
 * @param taskId 任务ID
 * @returns 任务状态信息
 */
export const getTestStatus = async (taskId: string): Promise<ApiResponse<{
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: any;
  error?: string;
  message?: string;
  openai_oauth_disconnected?: boolean;
}>> => {
  const response = await apiClient.get<ApiResponse<any>>(`/api/settings/tests/${taskId}/status`);
  return response.data;
};

export interface UpdateCheckInfo {
  status: 'up_to_date' | 'update_available' | 'unknown';
  update_available: boolean;
  message: string;
  repository: string;
  current: {
    tag?: string;
    commit_sha?: string;
    short_sha?: string;
    is_docker: boolean;
  };
  latest: null | {
    tag: string;
    sha?: string;
    last_updated: string;
    image: string;
  };
}

export const checkForUpdates = async (): Promise<ApiResponse<UpdateCheckInfo>> => {
  const response = await apiClient.get<ApiResponse<UpdateCheckInfo>>('/api/settings/check-update');
  return response.data;
};


// ===== PPT 翻新相关 API =====

/**
 * 创建 PPT 翻新项目
 * 上传 PDF/PPTX 文件，后端异步解析内容并填充大纲+描述
 */
export const createPptRenovationProject = async (
  file: File,
  options?: {
    keepLayout?: boolean;
    templateStyle?: string;
    language?: string;
  }
): Promise<ApiResponse<{ project_id: string; task_id: string; page_count: number }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.keepLayout) {
    formData.append('keep_layout', 'true');
  }
  if (options?.templateStyle) {
    formData.append('template_style', options.templateStyle);
  }
  if (options?.language) {
    formData.append('language', options.language);
  }

  const response = await apiClient.post<ApiResponse<{ project_id: string; task_id: string; page_count: number }>>(
    '/api/projects/renovation',
    formData
  );
  return response.data;
};

/**
 * 从图片提取风格描述（通用，不绑定项目）
 */
export const extractStyleFromImage = async (
  imageFile: File
): Promise<ApiResponse<{ style_description: string }>> => {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await apiClient.post<ApiResponse<{ style_description: string }>>(
    '/api/extract-style',
    formData
  );
  return response.data;
};
