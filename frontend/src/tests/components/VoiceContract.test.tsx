import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 阶段 0 冻结契约：所有声音入口不得再出现手填 ID 文本框或硬编码默认
 * （统一 VoicePicker + canonical ID，计划 §7.4.5）。阶段 2 已用 VoicePicker
 * 替换手填输入并移除硬编码默认，本套测试必须保持通过。
 */

const mocks = vi.hoisted(() => ({
  createRun: vi.fn(),
  getProject: vi.fn(),
  navigate: vi.fn(),
  project: {
    project_id: 'project-1',
    project_title: '测试项目',
    spine: { status: 'confirmed', revision: 1, document: {} },
    workspaces: [{ kind: 'ppt', state: 'draft', revision: 1 }],
  },
  runs: [] as any[],
  loadRuns: vi.fn(),
  load: vi.fn(),
  error: null,
}));

import { PptToVideoWizard } from '@/components/content-project/PptToVideoWizard';
const wizardModule = { PptToVideoWizard };

vi.mock('@/api/endpoints', () => ({
  getProject: mocks.getProject,
}));

// VoicePicker 的目录请求：契约测试只关心“无手填框”，目录数据 stub 为空即可
vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: { data: { voices: [] } } }) },
  getStaticAssetUrl: (path: string) => path,
  getImageUrl: (path: string) => path,
}));

vi.mock('@/store/useContentProjectStore', () => ({
  useContentProjectStore: () => ({
    project: mocks.project,
    loading: false,
    load: mocks.load,
  }),
  selectContentWorkspace: (project: any, kind: string) =>
    project?.workspaces?.find((item: any) => item.kind === kind),
  selectSpineSummary: () => ({ topic: '', sources: [] }),
}));

vi.mock('@/store/useWorkspaceGenerationStore', () => ({
  useWorkspaceGenerationStore: () => ({
    runs: mocks.runs,
    loadRuns: mocks.loadRuns,
    createRun: mocks.createRun,
    error: mocks.error,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

describe('声音入口契约（阶段0）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({ data: { pages: [] } });
  });

  it('PPT 转视频向导不再提供声音 ID 手填文本框', () => {
    // 静态导入避免与 hoisted mock 文件同进程时的动态 import 死锁
    const { PptToVideoWizard } = wizardModule;
    render(<PptToVideoWizard projectId="project-1" isOpen onClose={vi.fn()} />);

    // 契约：使用 VoicePicker，不存在手填文本框（当前存在「默认声音」输入，测试失败）
    expect(screen.queryByLabelText('默认声音')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/edge:voice|fish:voice/)).not.toBeInTheDocument();
  });

  it('PPT 转视频向导不再硬编码默认声音', async () => {
    const src = await import('@/components/content-project/PptToVideoWizard.tsx?raw');
    // 契约：源码不得出现硬编码 canonical 默认（当前存在，测试失败）
    expect(src.default).not.toContain("edge:zh-CN-XiaoxiaoNeural");
    expect(src.default).not.toContain("expression.standard.v1");
  });
});
