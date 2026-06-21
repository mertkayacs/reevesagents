// Run hub: overview for one run with links to sub-pages.
// Reads selectedRunId from router; displays run metadata and primary actions.

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { colors } from '../../utils/tokens.js'
import { listAgents, readRun } from '../../core/runs.js'
import { useToast } from '../contexts/ToastContext.js'
import { openRunTabs } from '../../core/runtime.js'
import type { RunRecord } from '../../core/types.js'

const REFRESH_INTERVAL_MS = 5000

type RowItem = 'Agents' | 'Output' | 'OpenTabs' | 'AddWorker' | '__section__' | 'StopRun' | 'Back'
const LABELS: Record<RowItem, string> = {
  Agents: 'Agents',
  Output: 'Output',
  OpenTabs: 'Switch to tmux tabs',
  AddWorker: 'Add Agent',
  StopRun: 'Stop Run',
  Back: 'Back',
  '__section__': '',
}
const ACTION_LABEL_WIDTH = Math.max(
  ...Object.values(LABELS).map(label => label.length),
  'Delete Run'.length,
)

interface SelectableItem {
  type: 'action'
  action: RowItem
}

export function Run() {
  const { selectedRunId, push, pop } = useRouter()
  const { toast } = useToast()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 8
  const [run, setRun] = useState<RunRecord | null>(() =>
    selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  )
  const [selectedIdx, setSelectedIdx] = useState(0)

  const agents = run ? listAgents(run.id) : []

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
    { type: 'action', action: 'OpenTabs' },
    { type: 'action', action: 'AddWorker' },
    { type: 'action', action: '__section__' },
    { type: 'action', action: 'StopRun' },
    { type: 'action', action: 'Back' },
  ]

  const selected = items[selectedIdx]
  const compactItems = items
    .map((item, itemIdx) => ({ item, itemIdx }))
    .filter(({ item }) => item.action !== '__section__')
  const compactSelectedIdx = Math.max(0, compactItems.findIndex(item => item.itemIdx === selectedIdx))
  const compactEntryCount = Math.max(1, bodyRows - 2)
  const compactFirstEntry = Math.min(
    Math.max(0, compactSelectedIdx - compactEntryCount + 1),
    Math.max(0, compactItems.length - compactEntryCount),
  )
  const visibleCompactItems = compactItems.slice(compactFirstEntry, compactFirstEntry + compactEntryCount)

  function handleActivate(): void {
    if (!selected || !run) return

    switch (selected.action) {
      case 'Agents':
        push('RunAgents')
        break
      case 'Output':
        push('RunOutput')
        break
      case 'OpenTabs':
        if (run.status === 'ended' || run.ended_at !== null) return
        try {
          openRunTabs(run.id)
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), 'error')
        }
        break
      case 'AddWorker':
        if (run.status === 'ended' || run.ended_at !== null) return
        push('AddWorker')
        break
      case 'StopRun':
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
  const isRunEnded = run.status === 'ended' || run.ended_at !== null
  const summaryParts: string[] = []
  summaryParts.push(`${agents.length} agents`)
  if (run.tmux_session) summaryParts.push(`session ${run.tmux_session}`)
  summaryParts.push(`workdir ${run.working_dir}`)
  const summaryLine = summaryParts.join(' · ')

  let statusContext = `${run.name} · ${run.status} · ${agents.length} agents`
  if (selected && selected.action !== '__section__') {
    const actionLabels: Record<string, string> = {
      Agents: 'view agents',
      Output: 'peek across agents',
      OpenTabs: isRunEnded ? 'run is ended' : 'switch to this run tmux session',
      AddWorker: isRunEnded ? 'run is ended' : 'add an agent to this run',
      StopRun: isRunEnded ? 'delete stopped run' : 'stop the run and move it to history',
      Back: 'return to runs',
    }
    statusContext = actionLabels[selected.action] || ''
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name]}
      meta={[
        { label: 'status', value: run.status },
        { label: 'agents', value: String(agents.length) },
      ]}
      tagline="Open, add, stop, or inspect agents in this run."
      statusContext={statusContext}
      statusKeys="enter open · ↑↓ move · esc back"
    >
      {compactBody ? (
        <Box flexDirection="column">
          <Section label={selectedIdx < 4 ? 'Actions' : 'Lifecycle'} />
          {visibleCompactItems.map(({ item, itemIdx }) => {
            const isDisabledAddWorker = item.action === 'AddWorker' && isRunEnded
            const primary = item.action === 'StopRun' && isRunEnded ? 'Delete Run' : LABELS[item.action]
            const hints: Record<RowItem, string> = {
              Agents: `${agents.length} agents`,
              Output: 'peek across all agents',
              OpenTabs: isRunEnded ? 'run is ended' : 'switch to tmux tabs for this run',
              AddWorker: isRunEnded ? 'run is ended' : 'add an agent to this run',
              StopRun: isRunEnded ? 'delete stopped run' : 'stop the run and move it to history',
              Back: 'return to all runs',
              '__section__': '',
            }
            const isDisabledOpenTabs = item.action === 'OpenTabs' && isRunEnded
            return (
              <Row
                key={item.action}
                selected={selectedIdx === itemIdx}
                primary={primary}
                primaryWidth={ACTION_LABEL_WIDTH}
                hint={hints[item.action]}
                disabled={isDisabledAddWorker || isDisabledOpenTabs}
                danger={item.action === 'StopRun'}
              />
            )
          })}
          <SectionEnd />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={colors.text.dim} wrap="truncate-end">{summaryLine}</Text>
          </Box>
          <Section label="Actions" />
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

            const isDisabledAddWorker = item.action === 'AddWorker' && isRunEnded
            const primary = item.action === 'StopRun' && isRunEnded ? 'Delete Run' : LABELS[item.action]

            const hints: Record<RowItem, string> = {
              Agents: `${agents.length} agents`,
              Output: 'peek across all agents',
              OpenTabs: isRunEnded ? 'run is ended' : 'switch to tmux tabs for this run',
              AddWorker: isRunEnded ? 'run is ended' : 'add an agent to this run',
              StopRun: isRunEnded ? 'delete stopped run' : 'stop the run and move it to history',
              Back: 'return to all runs',
              '__section__': '',
            }
            const isDisabledOpenTabs = item.action === 'OpenTabs' && isRunEnded

            return (
              <Row
                key={item.action}
                selected={isSelected}
                primary={primary}
                primaryWidth={ACTION_LABEL_WIDTH}
                hint={hints[item.action]}
                disabled={isDisabledAddWorker || isDisabledOpenTabs}
                danger={item.action === 'StopRun'}
              />
            )
          })}
          <SectionEnd />
        </Box>
      )}
    </Frame>
  )
}
