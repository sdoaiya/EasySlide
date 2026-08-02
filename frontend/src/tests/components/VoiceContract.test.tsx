import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 阶段 0 冻结契约：所有声音入口不得再出现手填 ID 文本框或硬编码默认
 * （统一 VoicePicker + canonical ID，计划 §7.4.5）。当前实现仍保留
 * 手填输入与硬编码默认，本套测试必须失败。
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

vi.mock('@/api/endpoints', () => ({
  getProject: mocks.getProject,
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

  it('PPT 转视频向导不再提供声音 ID 手填文本框', async () => {
    const { PptToVideoWizard } = await import('@/components/content-project/PptToVideoWizard');
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
