import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from './Button'

export function ExportDirectorySetting() {
  const [directory, setDirectory] = useState('')

  useEffect(() => {
    if (!window.electronAPI?.getExportDir) return
    void window.electronAPI.getExportDir().then(setDirectory).catch(() => setDirectory(''))
  }, [])

  const choose = async () => {
    if (!window.electronAPI?.chooseExportDir) return
    const next = await window.electronAPI.chooseExportDir()
    if (next) setDirectory(next)
  }

  return (
    <div className="space-y-3 border-b border-gray-200 pb-6 dark:border-border-primary">
      <div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary">导出文件夹</h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-foreground-tertiary">图片模式与可编辑模式共用此路径，导出任务下载会保存到这里。</p>
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-border-primary dark:bg-background-primary dark:text-foreground-secondary" title={directory}>
          {directory || '使用默认导出目录'}
        </div>
        <Button variant="secondary" size="sm" icon={<FolderOpen size={16} />} onClick={() => void choose()} disabled={!window.electronAPI?.chooseExportDir}>选择文件夹</Button>
      </div>
      {window.electronAPI?.openExportDir && <button type="button" onClick={() => void window.electronAPI?.openExportDir()} className="text-sm font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-300">打开导出文件夹</button>}
    </div>
  )
}
