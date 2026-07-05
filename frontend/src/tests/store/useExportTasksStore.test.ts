import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useExportTasksStore } from '@/store/useExportTasksStore'
import { getTaskStatus } from '@/api/endpoints'

vi.mock('@/api/endpoints', () => ({
  getTaskStatus: vi.fn(),
}))

describe('useExportTasksStore', () => {
  beforeEach(() => {
    act(() => {
      useExportTasksStore.setState({ tasks: [] })
    })
    window.localStorage.clear()
  })

  it('clears completed export tasks only for the selected project', () => {
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

  it('keeps polling tasks active when a status request times out', async () => {
    vi.mocked(getTaskStatus).mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })

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
  })
})
