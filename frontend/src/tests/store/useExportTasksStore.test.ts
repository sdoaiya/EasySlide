import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useExportTasksStore } from '@/store/useExportTasksStore'
import { deleteTask as deleteTaskApi, getTaskStatus, pauseTask as pauseTaskApi, resumeTask as resumeTaskApi } from '@/api/endpoints'

vi.mock('@/api/endpoints', () => ({
  getTaskStatus: vi.fn(),
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
  deleteTask: vi.fn(),
}))

describe('useExportTasksStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    act(() => {
      useExportTasksStore.setState({ tasks: [] })
    })
    window.localStorage.clear()
  })

  it('clears completed export tasks only for the selected project', () => {
    useExportTasksStore.setState({ total: 4 })
    act(() => {
      useExportTasksStore.getState().addTask({
        id: 'completed-current',
        taskId: '',
        projectId: 'project-a',
        type: 'pptx',
        status: 'COMPLETED',
      })
      useExportTasksStore.getState().addTask({
        id: 'failed-current',
        taskId: '',
        projectId: 'project-a',
        type: 'pdf',
        status: 'FAILED',
        errorMessage: 'Export failed',
      })
      useExportTasksStore.getState().addTask({
        id: 'completed-other',
        taskId: '',
        projectId: 'project-b',
        type: 'images',
        status: 'COMPLETED',
      })
      useExportTasksStore.getState().addTask({
        id: 'active-current',
        taskId: 'task-1',
        projectId: 'project-a',
        type: 'video',
        status: 'RUNNING',
      })
    })

    act(() => {
      useExportTasksStore.getState().clearCompleted('project-a')
    })

    expect(useExportTasksStore.getState().tasks.map(task => task.id)).toEqual([
      'active-current',
      'completed-other',
    ])
    // 按移除数量同步减少 total
    expect(useExportTasksStore.getState().total).toBe(2)
  })

  it('keeps the existing global clear behavior when no project is provided', () => {
    act(() => {
      useExportTasksStore.getState().addTask({
        id: 'completed-current',
        taskId: '',
        projectId: 'project-a',
        type: 'pptx',
        status: 'COMPLETED',
      })
      useExportTasksStore.getState().addTask({
        id: 'active-current',
        taskId: 'task-1',
        projectId: 'project-a',
        type: 'editable-pptx',
        status: 'PROCESSING',
      })
    })

    act(() => {
      useExportTasksStore.getState().clearCompleted()
    })

    expect(useExportTasksStore.getState().tasks.map(task => task.id)).toEqual([
      'active-current',
    ])
  })

  it('treats an empty project id as a scoped clear instead of a global clear', () => {
    act(() => {
      useExportTasksStore.getState().addTask({
        id: 'empty-project-completed',
        taskId: '',
        projectId: '',
        type: 'pptx',
        status: 'COMPLETED',
      })
      useExportTasksStore.getState().addTask({
        id: 'other-project-completed',
        taskId: '',
        projectId: 'project-b',
        type: 'pdf',
        status: 'COMPLETED',
      })
    })

    act(() => {
      useExportTasksStore.getState().clearCompleted('')
    })

    expect(useExportTasksStore.getState().tasks.map(task => task.id)).toEqual([
      'other-project-completed',
    ])
  })

  it('treats null as the global clear fallback at runtime', () => {
    act(() => {
      useExportTasksStore.getState().addTask({
        id: 'completed-current',
        taskId: '',
        projectId: 'project-a',
        type: 'pptx',
        status: 'COMPLETED',
      })
      useExportTasksStore.getState().addTask({
        id: 'active-current',
        taskId: 'task-1',
        projectId: 'project-a',
        type: 'video',
        status: 'RUNNING',
      })
    })

    act(() => {
      useExportTasksStore.getState().clearCompleted(null)
    })

    expect(useExportTasksStore.getState().tasks.map(task => task.id)).toEqual([
      'active-current',
    ])
  })

  it('removes a server task only after persistent deletion succeeds', async () => {
    vi.mocked(deleteTaskApi).mockResolvedValue({ data: { task_id: 'task-1', deleted: true } } as any)
    useExportTasksStore.setState({ total: 1 })
    useExportTasksStore.getState().addTask({
      id: 'task-1', taskId: 'task-1', projectId: 'project-a', type: 'video', status: 'PAUSED',
    })

    await useExportTasksStore.getState().removeTask('task-1')

    expect(deleteTaskApi).toHaveBeenCalledWith('project-a', 'task-1')
    expect(useExportTasksStore.getState().tasks).toEqual([])
    expect(useExportTasksStore.getState().total).toBe(0)
  })

  it('keeps a server task visible and polling when persistent deletion fails, surfacing the error', async () => {
    vi.useFakeTimers()
    vi.mocked(deleteTaskApi).mockRejectedValue(new Error('network error'))
    vi.mocked(getTaskStatus)
      .mockResolvedValueOnce({ data: { status: 'RUNNING' } } as any)
      .mockResolvedValueOnce({ data: { status: 'COMPLETED' } } as any)
    useExportTasksStore.getState().addTask({
      id: 'task-1', taskId: 'task-1', projectId: 'project-a', type: 'video', status: 'RUNNING',
    })

    // 先挂上轮询定时器
    await useExportTasksStore.getState().pollTask('task-1', 'project-a', 'task-1')

    // 删除失败：任务保留、错误被 surface（store 抛错 + errorMessage 标志）、轮询继续
    await expect(useExportTasksStore.getState().removeTask('task-1')).rejects.toThrow('network error')
    expect(useExportTasksStore.getState().tasks).toHaveLength(1)
    expect(useExportTasksStore.getState().tasks[0].status).toBe('RUNNING')
    expect(useExportTasksStore.getState().tasks[0].errorMessage).toBe('Network error. Please check your connection.')

    // 轮询定时器未被清理：下一次轮询仍会发生
    await vi.advanceTimersByTimeAsync(2000)
    expect(getTaskStatus).toHaveBeenCalledTimes(2)
    expect(useExportTasksStore.getState().tasks[0].status).toBe('COMPLETED')
  })

  it('removes a dismissed server task locally when polling gets a 404 instead of marking it failed', async () => {
    vi.mocked(getTaskStatus).mockRejectedValue({ response: { status: 404, data: {} } })
    useExportTasksStore.setState({ total: 1 })
    useExportTasksStore.getState().addTask({
      id: 'task-1', taskId: 'task-1', projectId: 'project-a', type: 'video', status: 'RUNNING',
    })

    await useExportTasksStore.getState().pollTask('task-1', 'project-a', 'task-1')

    expect(useExportTasksStore.getState().tasks).toEqual([])
    expect(useExportTasksStore.getState().total).toBe(0)
  })

  it('keeps local PAUSED when a late in-flight poll response arrives instead of resurrecting RUNNING', async () => {
    vi.useFakeTimers()
    let resolveStatus!: (value: any) => void
    vi.mocked(getTaskStatus).mockImplementation(() => new Promise((resolve) => { resolveStatus = resolve }))
    useExportTasksStore.getState().addTask({
      id: 'export-1', taskId: 'task-1', projectId: 'project-a', type: 'pptx', status: 'RUNNING',
    })

    const pollPromise = useExportTasksStore.getState().pollTask('export-1', 'project-a', 'task-1')
    // 请求在途时用户暂停（pauseTask 成功后本地状态先变为 PAUSED）
    act(() => { useExportTasksStore.getState().updateTask('export-1', { status: 'PAUSED' }) })
    await act(async () => {
      resolveStatus({ data: { status: 'RUNNING', task_id: 'task-1', project_id: 'project-a' } })
      await pollPromise
    })

    // 本地状态被保留，且未重新挂轮询定时器
    expect(useExportTasksStore.getState().tasks[0].status).toBe('PAUSED')
    await vi.advanceTimersByTimeAsync(4000)
    expect(getTaskStatus).toHaveBeenCalledTimes(1)
  })

  it('pauses a running task and stops its scheduled polling', async () => {
    vi.useFakeTimers()
    vi.mocked(getTaskStatus).mockResolvedValue({ data: { status: 'RUNNING' } } as any)
    vi.mocked(pauseTaskApi).mockResolvedValue({ data: { status: 'PAUSED' } } as any)
    useExportTasksStore.getState().addTask({
      id: 'export-1', taskId: 'task-1', projectId: 'project-a', type: 'pptx', status: 'RUNNING',
    })

    await useExportTasksStore.getState().pollTask('export-1', 'project-a', 'task-1')
    await useExportTasksStore.getState().pauseTask('export-1')
    await vi.advanceTimersByTimeAsync(2000)

    expect(pauseTaskApi).toHaveBeenCalledWith('project-a', 'task-1')
    expect(useExportTasksStore.getState().tasks[0].status).toBe('PAUSED')
    expect(getTaskStatus).toHaveBeenCalledTimes(1)
  })

  it('does not fake a paused status when the pause API fails', async () => {
    vi.mocked(pauseTaskApi).mockRejectedValue(new Error('network error'))
    useExportTasksStore.getState().addTask({
      id: 'export-1', taskId: 'task-1', projectId: 'project-a', type: 'pptx', status: 'RUNNING',
    })

    await expect(useExportTasksStore.getState().pauseTask('export-1')).rejects.toThrow('network error')

    expect(useExportTasksStore.getState().tasks[0].status).toBe('RUNNING')
  })

  it('resumes a paused task and restarts polling', async () => {
    vi.mocked(resumeTaskApi).mockResolvedValue({ data: { status: 'RUNNING' } } as any)
    vi.mocked(getTaskStatus).mockResolvedValue({ data: { status: 'COMPLETED' } } as any)
    useExportTasksStore.getState().addTask({
      id: 'export-1', taskId: 'task-1', projectId: 'project-a', type: 'pptx', status: 'PAUSED',
    })

    await useExportTasksStore.getState().resumeTask('export-1')

    expect(resumeTaskApi).toHaveBeenCalledWith('project-a', 'task-1')
    expect(getTaskStatus).toHaveBeenCalledWith('project-a', 'task-1')
    expect(useExportTasksStore.getState().tasks[0].status).toBe('COMPLETED')
  })

  it('does not fake a running status when the resume API fails', async () => {
    vi.mocked(resumeTaskApi).mockRejectedValue(new Error('network error'))
    useExportTasksStore.getState().addTask({
      id: 'export-1', taskId: 'task-1', projectId: 'project-a', type: 'pptx', status: 'PAUSED',
    })

    await expect(useExportTasksStore.getState().resumeTask('export-1')).rejects.toThrow('network error')

    expect(useExportTasksStore.getState().tasks[0].status).toBe('PAUSED')
    expect(getTaskStatus).not.toHaveBeenCalled()
  })

  it('keeps resumed native exports pending for a browser restart', async () => {
    vi.mocked(resumeTaskApi).mockResolvedValue({ data: { status: 'PENDING' } } as any)
    useExportTasksStore.getState().addTask({
      id: 'native-export', taskId: 'native-task', projectId: 'project-a', type: 'native-pptx', status: 'PAUSED',
    })

    await useExportTasksStore.getState().resumeTask('native-export')

    expect(useExportTasksStore.getState().tasks[0].status).toBe('PENDING')
    expect(getTaskStatus).not.toHaveBeenCalled()
  })

  it('leaves active native browser exports for the native workspace to restore', () => {
    useExportTasksStore.getState().addTask({
      id: 'native-export', taskId: 'native-task', projectId: 'project-a', type: 'native-pptx', status: 'PENDING',
    })
    useExportTasksStore.getState().addTask({
      id: 'video-export', taskId: 'video-task', projectId: 'project-a', type: 'video', status: 'PENDING',
    })
    vi.mocked(getTaskStatus).mockResolvedValue({ data: { status: 'COMPLETED' } } as any)

    useExportTasksStore.getState().restoreActiveTasks()

    expect(getTaskStatus).toHaveBeenCalledWith('project-a', 'video-task')
    expect(getTaskStatus).not.toHaveBeenCalledWith('project-a', 'native-task')
  })

  it('retries polling after a timeout and keeps the download link when the task completes', async () => {
    vi.useFakeTimers()
    vi.mocked(getTaskStatus)
      .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
      .mockResolvedValueOnce({
        data: {
          status: 'COMPLETED',
          progress: {
            download_url_absolute: 'http://127.0.0.1/files/project-a/exports/report.pptx',
            filename: '年度经营复盘.pptx',
          },
        },
      } as any)

    act(() => {
      useExportTasksStore.getState().addTask({
        id: 'video-timeout',
        taskId: 'task-video',
        projectId: 'project-a',
        type: 'video',
        status: 'PROCESSING',
      })
    })

    await act(async () => {
      await useExportTasksStore.getState().pollTask('video-timeout', 'project-a', 'task-video')
    })

    expect(useExportTasksStore.getState().tasks[0].status).toBe('PROCESSING')
    expect(useExportTasksStore.getState().tasks[0].errorMessage).toBeUndefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(getTaskStatus).toHaveBeenCalledTimes(2)
    expect(useExportTasksStore.getState().tasks[0].status).toBe('COMPLETED')
    expect(useExportTasksStore.getState().tasks[0].downloadUrl).toBe(
      'http://127.0.0.1/files/project-a/exports/report.pptx',
    )
    expect(useExportTasksStore.getState().tasks[0].filename).toBe('年度经营复盘.pptx')
  })
})

describe('mapTaskType', () => {
  it('maps native deck page generation to a page-generation label instead of workspace', async () => {
    const { mapTaskType } = await import('@/store/useExportTasksStore')
    expect(mapTaskType('GENERATE_NATIVE_DECK')).toBe('generate-pages')
    expect(mapTaskType('GENERATE_IMAGES')).toBe('generate-images')
    expect(mapTaskType('GENERATE_DESCRIPTIONS')).toBe('generate-descriptions')
    expect(mapTaskType('NARRATION_AI_BATCH')).toBe('narration-batch')
    expect(mapTaskType('INITIALIZE_CONTENT_WORKSPACE')).toBe('initialize-workspace')
    expect(mapTaskType('GENERATE_NATIVE_DECK', 'ppt')).toBe('generate-pages')
  })
})
