import { useEffect, useRef, useState } from 'react'
import { NativeDeckWorkspace, type NativeDeckWorkspaceProps } from './NativeDeckWorkspace'
import type { NativeLayoutContract } from './NativeDeckPropertyPanel'
import { generateNativeDeck, getTaskStatus } from '@/api/endpoints'
import { useProjectStore } from '@/store/useProjectStore'
import { getNativeDeckTaskStorageKey } from '@/utils/projectUtils'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'

type GenerationProgress = {
  status: string
  completed: number
  failed: number
  total: number
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

  useEffect(() => {
    if (!taskId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const storageKey = getNativeDeckTaskStorageKey(props.projectId)

    const poll = async () => {
      try {
        const task = (await getTaskStatus(props.projectId, taskId)).data
        if (!active || !task) return

        const progress = (task.progress || {}) as Partial<{ completed: number; failed: number; total: number }>
        const next = {
          status: task.status || 'PENDING',
          completed: Number(progress.completed || 0),
          failed: Number(progress.failed || 0),
          total: Number(progress.total || 0),
          error: task.error_message,
        }

        const signature = `${next.status}:${next.completed}:${next.failed}`
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

  const remainingPages = Math.max(0, totalPages - props.slides.length)
  const startGeneration = async () => {
    setGeneration({ status: 'PENDING', completed: 0, failed: 0, total: totalPages })
    try {
      const task = (await generateNativeDeck(props.projectId)).data
      const nextTaskId = task?.task_id || task?.id
      if (!nextTaskId) throw new Error('创建页面生成任务失败')
      localStorage.setItem(getNativeDeckTaskStorageKey(props.projectId), nextTaskId)
      setTaskId(nextTaskId)
    } catch (reason) {
      setGeneration({
        status: 'FAILED',
        completed: 0,
        failed: 0,
        total: totalPages,
        error: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {generation && generation.status !== 'COMPLETED' && (
        <div
          className={generation.status === 'FAILED'
            ? 'border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700'
            : 'border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700'}
          role={generation.status === 'FAILED' ? 'alert' : 'status'}
        >
          {generation.status === 'FAILED'
            ? `页面生成失败：${generation.error || '请稍后重试'}`
            : `正在生成页面 ${generation.completed}/${generation.total}`}
          {generation.failed > 0 && `，失败 ${generation.failed}`}
          {generation.status === 'FAILED' && remainingPages > 0 && (
            <button type="button" onClick={() => void startGeneration()} className="ml-3 rounded-md bg-cyan-600 px-3 py-1.5 font-medium text-white hover:bg-cyan-700">
              重新生成剩余 {remainingPages} 页
            </button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <NativeDeckWorkspace {...props} layoutContracts={contracts} />
      </div>
    </div>
  )
}
