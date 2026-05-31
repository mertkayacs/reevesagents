// Run hub: overview for one run with links to sub-pages.
// Reads selectedRunId from router; displays run metadata and primary actions.

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { listAgents, readRun } from '../state/runs.js'
import type { RunRecord } from '../state/types.js'

const REFRESH_INTERVAL_MS = 5000

type RowItem = 'Agents' | 'Output' | 'AddWorker' | '__section__' | 'StopRun' | 'Back'
const OTHER_LABELS: Record<RowItem, string> = {
  Agents: 'Entries',
  Output: 'Output',
  AddWorker: 'Add Terminal',
  StopRun: 'Return & Stop Run',
  Back: 'Back',
  '__section__': '',
}
const SPAWNER_LABELS: Record<RowItem, string> = {
  Agents: 'Terminals',
  Output: 'Output',
  AddWorker: 'Add Terminal',
  StopRun: 'Return & Stop Run',
  Back: 'Back',
  '__section__': '',
}
const ACTION_LABEL_WIDTH = Math.max(
  ...Object.values(OTHER_LABELS).map(label => label.length),
  ...Object.values(SPAWNER_LABELS).map(label => label.length),
)

interface SelectableItem {
  type: 'action'
  action: RowItem
}

export function Run() {
  const { selectedRunId, push, pop } = useRouter()
  const [run, setRun] = useState<RunRecord | null>(() =>
    selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  )
  const [selectedIdx, setSelectedIdx] = useState(0)

  const agents = run ? listAgents(run.id) : []
  const isSpawner = run?.mode === 'spawner'
  const labels = isSpawner ? SPAWNER_LABELS : OTHER_LABELS

  useEffect(() => {
    if (!selectedRunId) return
    const refresh = () => {
      try { setRun(readRun(selectedRunId)) } catch { setRun(null) }
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [selectedRunId])

  const items: SelectableItem[] = [
    { type: 'action', action: 'Agents' },
    { type: 'action', action: 'Output' },
    { type: 'action', action: 'AddWorker' },
    { type: 'action', action: '__section__' },
    { type: 'action', action: 'StopRun' },
    { type: 'action', action: 'Back' },
  ]

  const selected = items[selectedIdx]

  function handleActivate(): void {
    if (!selected || !run) return

    switch (selected.action) {
      case 'Agents':
        push('RunAgents')
        break
      case 'Output':
        push('RunOutput')
        break
      case 'AddWorker':
        if (run.status === 'ended' || run.ended_at !== null) return
        push('AddWorker')
        break
      case 'StopRun':
        if (run.status === 'ended' || run.ended_at !== null) return
        push('RunStop')
        break
      case 'Back':
        pop()
        break
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => {
        let next = idx - 1
        while (next >= 0 && items[next].action === '__section__') next--
        return Math.max(0, next)
      })
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => {
        let next = idx + 1
        while (next < items.length && items[next].action === '__section__') next++
        return Math.min(items.length - 1, next)
      })
      return
    }
    if (key.return) {
      if (!run) { pop(); return }
      handleActivate()
      return
    }
    if (key.escape || key.backspace) {
      pop()
      return
    }
  })

  if (!run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs']}
        statusContext="Run not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Run not found.</Text>
          <Box marginTop={1}>
            <Row
              selected={selectedIdx === 0}
              primary="Back"
              hint="return to all runs"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  // Inline summary line. Skips empty/default fields. Truncates at terminal width.
  const rootAgent = agents.find(a => a.role === 'root')
  const isRunEnded = run.status === 'ended' || run.ended_at !== null
  const summaryParts: string[] = []
  if (!isSpawner && rootAgent) summaryParts.push(`first ${rootAgent.provider}`)
  summaryParts.push(`${agents.length} ${isSpawner ? 'terminals' : 'entries'}`)
  if (run.tmux_session) summaryParts.push(`session ${run.tmux_session}`)
  summaryParts.push(`workdir ${run.working_dir}`)
  const summaryLine = summaryParts.join(' · ')

  let statusContext = `${run.name} · ${run.status} · ${agents.length} ${isSpawner ? 'terminals' : 'entries'}`
  if (selected && selected.action !== '__section__') {
    const actionLabels: Record<string, string> = {
      Agents: isSpawner ? 'view terminals' : 'view entries',
      Output: isSpawner ? 'peek across terminals' : 'peek across entries',
      AddWorker: isRunEnded ? 'run is ended' : isSpawner ? 'spawn new terminal' : 'not available for this run type',
      StopRun: isRunEnded ? 'run is ended' : 'return to Reeves and close run windows',
      Back: 'return to runs',
    }
    statusContext = actionLabels[selected.action] || ''
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name]}
      meta={[
        { label: 'status', value: run.status },
        { label: isSpawner ? 'terminals' : 'entries', value: String(agents.length) },
      ]}
      tagline={isSpawner
        ? 'Manage this spawner run. Terminals are independent provider CLIs.'
        : 'This run type is not managed by the spawner package.'}
      statusContext={statusContext}
      statusKeys="enter open · ↑↓ move · esc back"
    >
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color={colors.text.dim} wrap="truncate-end">{summaryLine}</Text>
        </Box>
        <Section label="Run" />
        {items.map((item, idx) => {
          const isSelected = selectedIdx === idx

          if (item.action === '__section__') {
            return (
              <React.Fragment key="__section__">
                <SectionEnd />
                <Section label="Lifecycle" />
              </React.Fragment>
            )
          }

          const isDisabledStop = item.action === 'StopRun' && isRunEnded
          const isDisabledAddWorker = item.action === 'AddWorker' && (isRunEnded || !isSpawner)

          const hints: Record<RowItem, string> = {
            Agents: `${agents.length} ${isSpawner ? 'terminals' : 'entries'}`,
            Output: isSpawner ? 'peek across all terminals' : 'peek across entries',
            AddWorker: isRunEnded ? 'run is ended' : isSpawner ? 'launch another independent terminal' : 'not available for this run type',
            StopRun: isRunEnded ? 'run is ended' : 'return to Reeves and close this run session',
            Back: 'return to all runs',
            '__section__': '',
          }

          return (
            <Row
              key={item.action}
              selected={isSelected}
              primary={labels[item.action]}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={hints[item.action]}
              disabled={isDisabledStop || isDisabledAddWorker}
              danger={item.action === 'StopRun'}
            />
          )
        })}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
