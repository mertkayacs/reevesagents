// Screen history router for the v1 visible-menu TUI.
// Push/pop manage pages; selected run/agent ids live beside routing state.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useApp } from 'ink'
import type { ScreenName, RouterContextValue } from './state/types.js'

import { ToastProvider } from './state/ToastContext.js'
import { WizardProvider } from './state/WizardContext.js'
import { WorkerDraftProvider } from './state/WorkerDraftContext.js'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { Welcome } from './screens/Welcome.js'
import { Runs } from './screens/Runs.js'
import { Run } from './screens/Run.js'
import { RunAgents } from './screens/run/Agents.js'
import { RunOutput } from './screens/run/Output.js'
import { AgentDetail } from './screens/AgentDetail.js'
import { AgentOutput } from './screens/run/agent/Output.js'
import { AgentTask } from './screens/run/agent/Task.js'
import { AgentKill } from './screens/run/agent/Kill.js'
import { NewRun } from './screens/NewRun.js'
import { NewRunMode } from './screens/newrun/00Mode.js'
import { NewRunPreset } from './screens/newrun/01Preset.js'
import { NewRunBasics } from './screens/newrun/02Basics.js'
import { NewRunRoot } from './screens/newrun/03Root.js'
import { NewRunWorkers } from './screens/newrun/04Workers.js'
import { NewRunWorker } from './screens/newrun/04Worker.js'
import { NewRunReview } from './screens/newrun/05Review.js'
import { NewRunStarting } from './screens/newrun/05Starting.js'
import { AddWorker } from './screens/run/AddWorker.js'
import { RunStop } from './screens/run/Stop.js'
import { Settings } from './screens/Settings.js'
import { Reference } from './screens/Reference.js'
import { Credits } from './screens/Credits.js'
import { Approvals } from './screens/Approvals.js'
import { RunApprovals } from './screens/run/Approvals.js'
import { Approval } from './screens/Approval.js'
import { ApprovalApprove } from './screens/approval/Approve.js'
import { ApprovalDeny } from './screens/approval/Deny.js'
import { Doctor } from './screens/Doctor.js'
import { DoctorCheck } from './screens/doctor/Check.js'
import { readTuiOpenToken } from './state/tui-open.js'

const RouterContext = createContext<RouterContextValue | null>(null)

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within Router')
  return ctx
}

function normalizeScreen(screen: ScreenName): ScreenName {
  return screen
}

function renderScreen(screen: ScreenName) {
  switch (normalizeScreen(screen)) {
    case 'Welcome':     return <Welcome />
    case 'Runs':        return <Runs />
    case 'Run':         return <Run />
    case 'RunAgents':   return <RunAgents />
    case 'RunOutput':   return <RunOutput />
    case 'RunStop':     return <RunStop />
    case 'AgentDetail': return <AgentDetail />
    case 'AgentOutput': return <AgentOutput />
    case 'AgentTask':   return <AgentTask />
    case 'AgentKill':   return <AgentKill />
    case 'NewRun':      return <NewRun />
    case 'NewRunMode':  return <NewRunMode />
    case 'NewRunPreset': return <NewRunPreset />
    case 'NewRunBasics': return <NewRunBasics />
    case 'NewRunRoot': return <NewRunRoot />
    case 'NewRunWorkers': return <NewRunWorkers />
    case 'NewRunWorker': return <NewRunWorker />
    case 'NewRunReview': return <NewRunReview />
    case 'NewRunStarting': return <NewRunStarting />
    case 'AddWorker': return <AddWorker />
    case 'Settings':    return <Settings />
    case 'Reference':   return <Reference />
    case 'Credits':     return <Credits />
    case 'Approvals':   return <Approvals />
    case 'RunApprovals': return <RunApprovals />
    case 'Approval':    return <Approval />
    case 'ApprovalApprove': return <ApprovalApprove />
    case 'ApprovalDeny':    return <ApprovalDeny />
    case 'Doctor':      return <Doctor />
    case 'DoctorCheck': return <DoctorCheck />
    default:            return <Runs />
  }
}

export interface RouterProps {
  initialScreen?: ScreenName
}

export interface HistoryState {
  entries: ScreenName[]
  index: number
}

export function nextHistoryOnPush(prev: HistoryState, screen: ScreenName): HistoryState {
  const target = normalizeScreen(screen)
  const current = normalizeScreen(prev.entries[prev.index] ?? 'Runs')
  if (current === target) return prev
  if (prev.index > 0 && normalizeScreen(prev.entries[prev.index - 1] ?? 'Runs') === target) {
    return { ...prev, index: prev.index - 1 }
  }
  const entries = [...prev.entries.slice(0, prev.index + 1), target]
  return { entries, index: entries.length - 1 }
}

export function nextHistoryOnReset(screen: ScreenName, base: ScreenName[] = ['Welcome', 'Runs']): HistoryState {
  const target = normalizeScreen(screen)
  const normalizedBase = base.map(normalizeScreen)
  const entries = normalizedBase.at(-1) === target ? normalizedBase : [...normalizedBase, target]
  return { entries, index: entries.length - 1 }
}

export function Router({ initialScreen }: RouterProps = {}) {
  const { exit } = useApp()
  const envRunId = process.env.REEVES_RUN_ID ?? null
  const openTokenRef = useRef(readTuiOpenToken())
  const [selectedRunId, setSelectedRunId] = useState<string | null>(envRunId)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null)
  const [selectedCheckName, setSelectedCheckName] = useState<string | null>(null)
  const [selectedWorkerIdx, setSelectedWorkerIdx] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [initialScreen ? normalizeScreen(initialScreen) : 'Welcome'],
    index: 0,
  }))

  useEffect(() => {
    if (initialScreen) return
    const timer = setInterval(() => {
      const token = readTuiOpenToken()
      if (!token || token === openTokenRef.current) return
      openTokenRef.current = token
      setSelectedAgentId(null)
      setSelectedApprovalId(null)
      setSelectedCheckName(null)
      setSelectedWorkerIdx(null)
      setHistory({ entries: ['Welcome'], index: 0 })
    }, 1000)
    return () => clearInterval(timer)
  }, [initialScreen])

  const push = useCallback((screen: ScreenName) => {
    setHistory(prev => nextHistoryOnPush(prev, screen))
  }, [])

  const pop = useCallback(() => {
    setHistory(prev => {
      if (prev.index > 0) return { ...prev, index: prev.index - 1 }
      exit()
      return prev
    })
  }, [exit])

  const forward = useCallback(() => {
    setHistory(prev => (
      prev.index < prev.entries.length - 1
        ? { ...prev, index: prev.index + 1 }
        : prev
    ))
  }, [])

  const replace = useCallback((screen: ScreenName) => {
    setHistory(prev => {
      const entries = [...prev.entries]
      entries[prev.index] = normalizeScreen(screen)
      return { entries, index: prev.index }
    })
  }, [])

  const resetStack = useCallback((screen: ScreenName, base: ScreenName[] = ['Welcome', 'Runs']) => {
    setHistory(nextHistoryOnReset(screen, base))
  }, [])

  const current = normalizeScreen(history.entries[history.index] ?? 'Runs')
  const canBack = history.index > 0
  const canForward = history.index < history.entries.length - 1

  return (
    <RouterContext.Provider value={{
      screen: current,
      push,
      pop,
      forward,
      replace,
      resetStack,
      selectedRunId,
      setSelectedRunId,
      selectedAgentId,
      setSelectedAgentId,
      selectedApprovalId,
      setSelectedApprovalId,
      selectedCheckName,
      setSelectedCheckName,
      selectedWorkerIdx,
      setSelectedWorkerIdx,
      canBack,
      canForward,
    }}>
      <WizardProvider>
        <WorkerDraftProvider>
          <ToastProvider>
            <ErrorBoundary>
              {renderScreen(current)}
            </ErrorBoundary>
          </ToastProvider>
        </WorkerDraftProvider>
      </WizardProvider>
    </RouterContext.Provider>
  )
}

export { RouterContext }
export type { ScreenName }
