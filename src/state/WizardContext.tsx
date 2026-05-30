// Wizard state container for NewRun flow (steps 1-5).
// Holds run name, working dir, root config, and worker list with persistence.

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { Provider, Permissions, Effort, AuthMode } from './types.js'

export interface WorkerConfig {
  nickname: string
  provider: Provider
  model: string
  prompt: string
  workingDir: string
  permissions: Permissions
  authMode: AuthMode
  effort: Effort
}

export interface WizardState {
  presetName: string | null
  name: string
  workingDir: string
  root: WorkerConfig
  workers: WorkerConfig[]
}

interface WizardContextValue {
  state: WizardState
  update: (_patch: Partial<WizardState>) => void
  updateRoot: (_patch: Partial<WorkerConfig>) => void
  addWorker: () => number
  updateWorker: (_idx: number, _patch: Partial<WorkerConfig>) => void
  removeWorker: (_idx: number) => void
  reset: () => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

const INITIAL_WORKER: WorkerConfig = {
  nickname: '',
  provider: 'cc',
  model: '',
  prompt: '',
  workingDir: '',
  permissions: 'ask',
  authMode: 'default',
  effort: 'default',
}

const INITIAL_STATE: WizardState = {
  presetName: null,
  name: '',
  workingDir: process.cwd(),
  root: INITIAL_WORKER,
  workers: [],
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used within WizardProvider')
  return ctx
}

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE)

  const update = useCallback((_patch: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ..._patch }))
  }, [])

  const updateRoot = useCallback((_patch: Partial<WorkerConfig>) => {
    setState(prev => ({
      ...prev,
      root: { ...prev.root, ..._patch },
    }))
  }, [])

  const addWorker = useCallback((): number => {
    setState(prev => ({
      ...prev,
      workers: [...prev.workers, { ...INITIAL_WORKER }],
    }))
    return state.workers.length
  }, [state.workers.length])

  const updateWorker = useCallback((_idx: number, _patch: Partial<WorkerConfig>) => {
    setState(prev => {
      const workers = [...prev.workers]
      if (workers[_idx]) {
        workers[_idx] = { ...workers[_idx], ..._patch }
      }
      return { ...prev, workers }
    })
  }, [])

  const removeWorker = useCallback((_idx: number) => {
    setState(prev => ({
      ...prev,
      workers: prev.workers.filter((_, i) => i !== _idx),
    }))
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return (
    <WizardContext.Provider value={{
      state,
      update,
      updateRoot,
      addWorker,
      updateWorker,
      removeWorker,
      reset,
    }}>
      {children}
    </WizardContext.Provider>
  )
}
