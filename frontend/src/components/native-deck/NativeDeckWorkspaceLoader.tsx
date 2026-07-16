import { useEffect, useRef, useState } from 'react'
import { NativeDeckWorkspace, type NativeDeckWorkspaceProps } from './NativeDeckWorkspace'
import type { NativeLayoutContract } from './NativeDeckPropertyPanel'
import { generateNativeDeck, getTaskStatus, pauseTask, resumeTask } from '@/api/endpoints'
import { useProjectStore } from '@/store/useProjectStore'
import { getNativeDeckTaskStorageKey } from '@/utils/projectUtils'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'

type GenerationProgress = {
  status: string
  completed: number
  failed: number
  total: number
  failedPageIds: string[]
  error?: string
}

type NativeDeckWorkspaceLoaderProps = Omit<NativeDeckWorkspaceProps, 'layoutContracts'> & {
  generationTaskId?: string
  totalPages?: number
}

const contracts = layoutManifest.layouts as unknown as readonly NativeLayoutContract[]

export function NativeDeckWorkspaceLoader({ generationTaskId, totalPages = 0, ...props }: NativeDeckWorkspaceLoaderProps) {
  const [taskId, setTaskId] = useState(generationTaskId)
  const [generation, setGeneration] = useState<GenerationProgress>()
  const lastProgressRef = useRef('')
  const syncProject = useProjectStore(state => state.syncProject)
  const generationActive = generation?.status === 'PENDING' || generation?.status === 'PROCESSING' || generation?.status === 'PAUSED'

  useEffect(() => {
    if (!taskId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const storageKey = getNativeDeckTaskStorageKey(props.projectId)

    const poll = async () => {
      try {
        const task = (await getTaskStatus(props.projectId, taskId)).data
        if (!active || !task) return

        const progress = (task.progress || {}) as Partial<{ completed: number; failed: number; total: number; failed_page_ids: unknown }>
        const next = {
          status: task.status || 'PENDING',
          completed: Number(progress.completed || 0),
          failed: Number(progress.failed || 0),
          total: Number(progress.total || 0),
          failedPageIds: Array.isArray(progress.failed_page_ids) ? progress.failed_page_ids.filter((pageId): pageId is string => typeof pageId === 'string') : [],
          error: task.error_message,
        }

        const signature = `${next.status}:${next.completed}:${next.failed}:${next.failedPageIds.join(',')}`
        setGeneration(next)

        if (signature !== lastProgressRef.current) {
          lastProgressRef.current = signature
          await syncProject(props.projectId)
        }

        if (next.status === 'COMPLETED' || next.status === 'FAILED') {
          localStorage.removeItem(storageKey)
          return
        }

        timer = setTimeout(poll, 1000)
      } catch (reason) {
        if (!active) return
        setGeneration(current => ({
          status: 'FAILED',
          completed: current?.completed || 0,
          failed: current?.failed || 0,
          total: current?.total || 0,
          failedPageIds: current?.failedPageIds || [],
          error: reason instanceof Error ? reason.message : String(reason),
        }))
      }
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [taskId, props.projectId, syncProject])

  const startGeneration = async (pageIds?: string[]) => {
    setGeneration({ status: 'PENDING', completed: 0, failed: 0, total: pageIds?.length || totalPages, failedPageIds: [] })
    try {
      const task = (await generateNativeDeck(props.projectId, pageIds)).data
      const nextTaskId = task?.task_id || task?.id
      if (!nextTaskId) throw new Error('创建页面生成任务失败')
      localStorage.setItem(getNativeDeckTaskStorageKey(props.projectId), nextTaskId)
      setTaskId(nextTaskId)
    } catch (reason) {
      setGeneration({
        status: 'FAILED',
        completed: 0,
        failed: 0,
        total: pageIds?.length || totalPages,
        failedPageIds: [],
        error: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  const pauseGeneration = async () => {
    if (!taskId) return
    const task = (await pauseTask(props.projectId, taskId)).data
    setGeneration(current => current ? { ...current, status: task?.status || 'PAUSED' } : current)
  }

  const resumeGeneration = async () => {
    if (!taskId) return
    const task = (await resumeTask(props.projectId, taskId)).data
    setGeneration(current => current ? { ...current, status: task?.status || 'PROCESSING' } : current)
  }

  return (
    <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="relative min-h-0 min-w-0 flex-1">
        <NativeDeckWorkspace
          {...props}
          layoutContracts={contracts}
          pageGenerationStatus={generation ? { ...generation, onPause: generation.status === 'PENDING' || generation.status === 'PROCESSING' ? () => void pauseGeneration() : undefined, onResume: generation.status === 'FAILED' && generation.failedPageIds.length ? () => void startGeneration(generation.failedPageIds) : generation.status === 'PAUSED' ? () => void resumeGeneration() : undefined } : undefined}
          pageGenerationAction={props.slides.some(slide => slide.pending) && !generationActive
            ? { label: '批量生成页面', onClick: () => void startGeneration(props.slides.filter(slide => slide.pending).map(slide => slide.pageId)) }
            : undefined}
          singlePageGenerationAction={!generationActive ? { label: '生成本页', onClick: (pageId) => void startGeneration([pageId]) } : undefined}
        />
      </div>
    </div>
  )
}
