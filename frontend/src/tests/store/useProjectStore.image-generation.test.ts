import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/store/useProjectStore'
import * as api from '@/api/endpoints'

vi.mock('@/api/endpoints', () => ({
  generatePageImage: vi.fn(),
  generateImages: vi.fn(),
  getProject: vi.fn(),
  getTaskStatus: vi.fn(),
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
}))

const project = {
  project_id: 'project-images',
  id: 'project-images',
  idea_prompt: 'test',
  status: 'DESCRIPTIONS_GENERATED',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  pages: [
    { page_id: 'page-ready', id: 'page-ready', order_index: 0, status: 'COMPLETED', generated_image_path: 'ready.png' },
    { page_id: 'page-missing', id: 'page-missing', order_index: 1, status: 'DESCRIPTION_GENERATED' },
  ],
} as any

describe('useProjectStore image generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({
      currentProject: project,
      pageGeneratingTasks: {},
      activeImageTask: null,
      error: null,
      warningMessage: null,
    } as any)
    vi.mocked(api.generateImages).mockResolvedValue({ data: {} } as any)
    vi.mocked(api.getProject).mockResolvedValue({ data: project } as any)
  })

  it('batch generation submits only pages without images', async () => {
    await useProjectStore.getState().generateImages()

    expect(api.generateImages).toHaveBeenCalledWith('project-images', undefined, ['page-missing'], undefined)
  })

  it('passes image generation settings to the batch endpoint', async () => {
    await useProjectStore.getState().generateImages(undefined, {
      maxWorkers: 2,
      useTemplate: false,
      density: 'rich',
      style: 'tech',
      customPrompt: '蓝绿色科技感',
    })

    expect(api.generateImages).toHaveBeenCalledWith(
      'project-images',
      undefined,
      ['page-missing'],
      {
        maxWorkers: 2,
        useTemplate: false,
        density: 'rich',
        style: 'tech',
        customPrompt: '蓝绿色科技感',
      },
    )
  })

  it('passes image generation settings to the single page endpoint', async () => {
    vi.mocked(api.generatePageImage).mockResolvedValue({ data: {} } as any)

    await useProjectStore.getState().generatePageImage('page-missing', true, {
      maxWorkers: 3,
      useTemplate: false,
      density: 'rich',
      style: 'tech',
      customPrompt: '蓝绿色科技感',
    })

    expect(api.generatePageImage).toHaveBeenCalledWith(
      'project-images',
      'page-missing',
      true,
      {
        maxWorkers: 3,
        useTemplate: false,
        density: 'rich',
        style: 'tech',
        customPrompt: '蓝绿色科技感',
      },
    )
  })

  it('does not start another batch when every selected page already has an image', async () => {
    await useProjectStore.getState().generateImages(['page-ready'])

    expect(api.generateImages).not.toHaveBeenCalled()
  })

  it('pauses the active batch image task', async () => {
    const task = {
      task_id: 'image-task-1',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 2, completed: 1, page_ids: ['page-ready', 'page-missing'] },
    } as any
    useProjectStore.setState({ activeImageTask: task } as any)
    vi.mocked(api.pauseTask).mockResolvedValue({ data: { ...task, status: 'PAUSED' } } as any)

    await useProjectStore.getState().pauseImageGeneration()

    expect(api.pauseTask).toHaveBeenCalledWith('project-images', 'image-task-1')
    expect(useProjectStore.getState().activeImageTask?.status).toBe('PAUSED')
  })

  it('resumes only pages that still need images from a saved page id list', async () => {
    const task = {
      task_id: 'image-task-resume',
      task_type: 'GENERATE_IMAGES',
      status: 'PAUSED',
      progress: { total: 2, completed: 1, page_ids: ['page-ready', 'page-missing'] },
    } as any
    vi.mocked(api.resumeTask).mockResolvedValue({
      data: { ...task, status: 'PROCESSING' },
    } as any)
    vi.mocked(api.getTaskStatus).mockReturnValue(new Promise(() => {}))
    useProjectStore.setState({
      activeImageTask: task,
      pageGeneratingTasks: {},
    } as any)

    await useProjectStore.getState().resumeImageGeneration()

    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-missing': 'image-task-resume',
    })
    expect(api.getTaskStatus).toHaveBeenCalledWith('project-images', 'image-task-resume')
  })

  it('restores a paused image task after reopening the project', () => {
    const task = {
      task_id: 'image-task-restored',
      task_type: 'GENERATE_IMAGES',
      status: 'PAUSED',
      progress: { total: 1, completed: 0, page_ids: ['page-missing'] },
    } as any
    vi.mocked(api.getTaskStatus).mockReturnValue(new Promise(() => {}))
    useProjectStore.setState({
      currentProject: { ...project, active_image_tasks: [task] },
      activeImageTask: null,
      pageGeneratingTasks: {},
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().activeImageTask?.task_id).toBe('image-task-restored')
    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-missing': 'image-task-restored',
    })
    expect(api.getTaskStatus).not.toHaveBeenCalled()
  })

  it('restores only unfinished pages from an image manifest', () => {
    const task = {
      task_id: 'image-task-manifest',
      task_type: 'GENERATE_IMAGES',
      status: 'PAUSED',
      progress: {
        total: 2,
        completed: 1,
        pages: [
          { page_id: 'page-ready', status: 'completed' },
          { page_id: 'page-missing', status: 'queued' },
        ],
      },
    } as any
    vi.mocked(api.getTaskStatus).mockReturnValue(new Promise(() => {}))
    useProjectStore.setState({
      currentProject: { ...project, active_image_tasks: [task] },
      activeImageTask: null,
      pageGeneratingTasks: {},
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-missing': 'image-task-manifest',
    })
  })

  it('keeps failed unfinished pages attached to a paused image task for retry', () => {
    const task = {
      task_id: 'image-task-failed-paused',
      task_type: 'GENERATE_IMAGES',
      status: 'PAUSED',
      progress: {
        total: 2,
        completed: 1,
        pages: [
          { page_id: 'page-ready', status: 'completed' },
          { page_id: 'page-missing', status: 'failed' },
        ],
      },
    } as any
    vi.mocked(api.getTaskStatus).mockReturnValue(new Promise(() => {}))
    useProjectStore.setState({
      currentProject: {
        ...project,
        pages: [
          project.pages[0],
          { ...project.pages[1], status: 'FAILED' },
        ],
        active_image_tasks: [task],
      },
      activeImageTask: null,
      pageGeneratingTasks: {},
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-missing': 'image-task-failed-paused',
    })
  })

  it('does not clear an active single-page task when no batch task exists', () => {
    useProjectStore.setState({
      currentProject: project,
      activeImageTask: null,
      pageGeneratingTasks: { 'page-missing': 'single-page-task' },
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-missing': 'single-page-task',
    })
  })

  it('clears stale batch page mappings when reopening a project without an active batch task', () => {
    const staleTask = {
      task_id: 'stale-batch-task',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 1, completed: 0, page_ids: ['page-missing'] },
    } as any
    useProjectStore.setState({
      currentProject: { ...project, active_image_tasks: [] },
      activeImageTask: staleTask,
      pageGeneratingTasks: {
        'page-missing': 'stale-batch-task',
        'page-ready': 'single-page-task',
      },
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().activeImageTask).toBeNull()
    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({
      'page-ready': 'single-page-task',
    })
  })

  it('does not restore a stale running batch when every page already has an image', () => {
    const task = {
      task_id: 'image-task-stale',
      task_type: 'GENERATE_IMAGES',
      status: 'PROCESSING',
      progress: { total: 1, completed: 1, page_ids: ['page-ready'] },
    } as any
    vi.mocked(api.getTaskStatus).mockReturnValue(new Promise(() => {}))
    useProjectStore.setState({
      currentProject: { ...project, active_image_tasks: [task] },
      activeImageTask: null,
      pageGeneratingTasks: {},
    } as any)

    useProjectStore.getState().restoreImageGeneration()

    expect(useProjectStore.getState().activeImageTask).toBeNull()
    expect(useProjectStore.getState().pageGeneratingTasks).toEqual({})
    expect(api.getTaskStatus).not.toHaveBeenCalled()
  })
})
