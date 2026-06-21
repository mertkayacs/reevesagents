// Screen history router for the v1 visible-menu TUI.
// Push/pop manage pages; selected run/agent ids live beside routing state.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useApp } from 'ink'
import type { ScreenName, RouterContextValue } from './state/types.js'

import { ToastProvider } from './state/ToastContext.js'
import { WizardProvider } from './state/WizardContext.js'
import { WorkerDraftProvider } from './state/WorkerDraftContext.js'
import { LanguageProvider } from './state/LanguageContext.js'
import { configExists } from './state/config.js'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { LanguageSelect } from './screens/LanguageSelect.js'
import { Welcome } from './screens/Welcome.js'
import { Runs } from './screens/Runs.js'
import { RunHistory } from './screens/RunHistory.js'
import { Run } from './screens/Run.js'
import { RunAgents } from './screens/run/Agents.js'
import { RunOutput } from './screens/run/Output.js'
import { AgentDetail } from './screens/AgentDetail.js'
import { AgentOutput } from './screens/run/agent/Output.js'
import { AgentTask } from './screens/run/agent/Task.js'
import { AgentKill } from './screens/run/agent/Kill.js'
import { NewRun } from './screens/NewRun.js'
import { NewRunBasics } from './screens/newrun/02Basics.js'
import { NewRunRoot } from './screens/newrun/03Root.js'
import { NewRunWorkers } from './screens/newrun/04Workers.js'
import { NewRunWorker } from './screens/newrun/04Worker.js'
import { NewRunReview } from './screens/newrun/05Review.js'
import { NewRunStarting } from './screens/newrun/05Starting.js'
import { AddWorker } from './screens/run/AddWorker.js'
import { RunStop } from './screens/run/Stop.js'
import { Settings } from './screens/Settings.js'
import { AgentControl } from './screens/AgentControl.js'
import { Reference } from './screens/Reference.js'
import { Credits } from './screens/Credits.js'
import { Doctor } from './screens/Doctor.js'
import { DoctorCheck } from './screens/doctor/Check.js'
import { Approvals } from './screens/Approvals.js'
import { Config } from './screens/Config.js'
import { Presets } from './screens/Presets.js'
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
    case 'LanguageSelect': return <LanguageSelect />
    case 'Welcome':     return <Welcome />
    case 'Runs':        return <Runs />
    case 'RunHistory':  return <RunHistory />
    case 'Run':         return <Run />
    case 'RunAgents':   return <RunAgents />
    case 'RunOutput':   return <RunOutput />
    case 'RunStop':     return <RunStop />
    case 'AgentDetail': return <AgentDetail />
    case 'AgentOutput': return <AgentOutput />
    case 'AgentTask':   return <AgentTask />
    case 'AgentKill':   return <AgentKill />
    case 'NewRun':      return <NewRun />
    case 'NewRunBasics': return <NewRunBasics />
    case 'NewRunRoot': return <NewRunRoot />
    case 'NewRunWorkers': return <NewRunWorkers />
    case 'NewRunWorker': return <NewRunWorker />
    case 'NewRunReview': return <NewRunReview />
    case 'NewRunStarting': return <NewRunStarting />
    case 'AddWorker': return <AddWorker />
    case 'Settings':    return <Settings />
    case 'AgentControl': return <AgentControl />
    case 'Reference':   return <Reference />
    case 'Credits':     return <Credits />
    case 'Doctor':      return <Doctor />
    case 'DoctorCheck': return <DoctorCheck />
    case 'Approvals':   return <Approvals />
    case 'Config':      return <Config />
    case 'Presets':     return <Presets />
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
  const [selectedCheckName, setSelectedCheckName] = useState<string | null>(null)
  const [selectedWorkerIdx, setSelectedWorkerIdx] = useState<number | null>(null)
  const firstRunNeedsLanguage = !initialScreen && !configExists()
  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [initialScreen ? normalizeScreen(initialScreen) : firstRunNeedsLanguage ? 'LanguageSelect' : 'Welcome'],
    index: 0,
  }))

  useEffect(() => {
    if (initialScreen) return
    const timer = setInterval(() => {
      const token = readTuiOpenToken()
      if (!token || token === openTokenRef.current) return
      openTokenRef.current = token
      setSelectedAgentId(null)
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
      selectedCheckName,
      setSelectedCheckName,
      selectedWorkerIdx,
      setSelectedWorkerIdx,
      canBack,
      canForward,
    }}>
      <LanguageProvider>
        <WizardProvider>
          <WorkerDraftProvider>
            <ToastProvider>
              <ErrorBoundary>
                {renderScreen(current)}
              </ErrorBoundary>
            </ToastProvider>
          </WorkerDraftProvider>
        </WizardProvider>
      </LanguageProvider>
    </RouterContext.Provider>
  )
}

export { RouterContext }
export type { ScreenName }
