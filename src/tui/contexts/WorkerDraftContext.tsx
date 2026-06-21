// Mini context for AddWorker sub-wizard (existing run only).
// Holds one worker draft. Resets on unmount or explicit reset().

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { Provider, Permissions } from '../../core/types.js'

export interface WorkerDraft {
  nickname: string
  provider: Provider
  model: string
  prompt: string
  workingDir: string
  permissions: Permissions
}

interface WorkerDraftContextValue {
  draft: WorkerDraft
  update: (_patch: Partial<WorkerDraft>) => void
  reset: () => void
}

const WorkerDraftContext = createContext<WorkerDraftContextValue | null>(null)

const INITIAL_DRAFT: WorkerDraft = {
  nickname: 'worker',
  provider: 'codex',
  model: '',
  prompt: '',
  workingDir: process.cwd(),
  permissions: 'ask',
}

export function useWorkerDraft(): WorkerDraftContextValue {
  const ctx = useContext(WorkerDraftContext)
  if (!ctx) throw new Error('useWorkerDraft must be used within WorkerDraftProvider')
  return ctx
}

export function WorkerDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<WorkerDraft>(INITIAL_DRAFT)

  const update = useCallback((_patch: Partial<WorkerDraft>) => {
    setDraft(prev => ({ ...prev, ..._patch }))
  }, [])

  const reset = useCallback(() => {
    setDraft(INITIAL_DRAFT)
  }, [])

  return (
    <WorkerDraftContext.Provider value={{ draft, update, reset }}>
      {children}
    </WorkerDraftContext.Provider>
  )
}
