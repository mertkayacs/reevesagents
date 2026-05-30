// Agent detail overview: summary plus output, task, open, close, and back actions.
// Actions: Open Agent, Close Agent (workers only), Back.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { findAgent, readRun } from '../state/runs.js'
import { openAgent } from '../launcher/runtime.js'
import type { AgentRecord } from '../state/types.js'

type RowItem = 'Output' | 'Task' | '__section__' | 'OpenCLI' | 'CloseAgent' | 'Back'
const LABELS: Record<RowItem, string> = {
  Output: 'Output',
  Task: 'Task',
  OpenCLI: 'Open Agent',
  CloseAgent: 'Close Agent',
  Back: 'Back',
  '__section__': '',
}
const ACTION_LABEL_WIDTH = Math.max(...Object.values(LABELS).map(label => label.length), 'Open Terminal'.length, 'Close Terminal'.length)

interface SelectableItem {
  type: 'action'
  action: RowItem
}

export function AgentDetail() {
  const { selectedAgentId, push, pop } = useRouter()
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<any | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )
  const [selectedIdx, setSelectedIdx] = useState(0)

  const items: SelectableItem[] = [
    { type: 'action', action: 'Output' },
    { type: 'action', action: 'Task' },
    { type: 'action', action: '__section__' },
    { type: 'action', action: 'OpenCLI' },
    { type: 'action', action: 'CloseAgent' },
    { type: 'action', action: 'Back' },
  ]

  const selected = items[selectedIdx]

  function handleActivate(): void {
    if (!selected || !agent) return

    switch (selected.action) {
      case 'Output':
        push('AgentOutput')
        break
      case 'Task':
        push('AgentTask')
        break
      case 'OpenCLI':
        if (agent.headless) return
        openAgent(agent.id)
        break
      case 'CloseAgent':
        if (agent.role === 'root' || agent.ended_at !== null) return
        push('AgentKill')
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
      if (!agent || !run) { pop(); return }
      handleActivate()
      return
    }
    if (key.escape || key.backspace) {
      pop()
      return
    }
  })

  if (!agent || !run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs']}
        statusContext="Agent not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Agent not found.</Text>
          <Box marginTop={1}>
            <Row
              selected={selectedIdx === 0}
              primary="Back"
              hint="return to agents list"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  // Inline one-line summary. Skips empty fields. Truncates at terminal width.
  const summaryParts: string[] = []
  if (agent.model) summaryParts.push(`model ${agent.model}`)
  if (agent.task_note) summaryParts.push(`note ${agent.task_note}`)
  summaryParts.push(`workdir ${agent.working_dir}`)
  const summaryLine = summaryParts.join(' · ')
  const isSpawner = run.mode === 'spawner'
  const isCloseAgentDisabled = (!isSpawner && agent.role === 'root') || agent.ended_at !== null
  const isHeadless = !!agent.headless

  let statusContext = `${agent.nickname} · ${agent.provider} · ${agent.task_status}`
  if (selected && selected.action !== '__section__') {
    const actionLabels: Record<RowItem, string> = {
      Output: 'view recent output',
      Task: isSpawner ? 'view initial prompt and status' : 'view task status',
      OpenCLI: isHeadless ? 'headless root has no tmux window' : isSpawner ? 'switch to this terminal window' : 'switch to this agent window',
      CloseAgent: isCloseAgentDisabled ? 'not available' : isSpawner ? 'close this terminal window' : 'close this worker window',
      Back: 'return to agents list',
      '__section__': '',
    }
    statusContext = actionLabels[selected.action] || ''
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isSpawner ? 'Terminals' : 'Agents', agent.nickname]}
      meta={[
        { label: 'provider', value: agent.provider },
        ...(isSpawner ? [] : [{ label: 'role', value: agent.role }]),
        { label: 'status', value: agent.task_status },
      ]}
      tagline={isSpawner
        ? `${agent.provider} terminal in ${run.name}. It is independent and has no ReevesAgents context.`
        : isHeadless
          ? `${agent.provider} root managed via MCP. No tmux window.`
          : `${agent.provider} agent in ${run.name}. Open Agent to enter the tmux window.`}
      statusContext={statusContext}
      statusKeys="↑↓ move · enter select · esc back"
    >
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color={colors.text.dim} wrap="truncate-end">{summaryLine}</Text>
        </Box>
        <Section label="Agent" />
        {items.map((item, idx) => {
          const isSelected = selectedIdx === idx

          if (item.action === '__section__') {
            return (
              <React.Fragment key="__section__">
                <SectionEnd />
                <Section label="Actions" />
              </React.Fragment>
            )
          }

          const hints: Record<RowItem, string> = {
            Output: isHeadless ? 'no terminal output (headless root)' : 'live peek of the tmux pane',
            Task: isSpawner ? 'initial prompt and status' : 'task status and note',
            OpenCLI: isHeadless ? 'headless root - no tmux window' : isSpawner ? 'switch tmux to this terminal window' : 'switch tmux to this agent window',
            CloseAgent: !isSpawner && agent.role === 'root' ? 'not available for root' : isSpawner ? 'close this terminal window' : 'close this worker window',
            Back: isSpawner ? 'return to terminals list' : 'return to agents list',
            '__section__': '',
          }
          const primary = isSpawner && item.action === 'OpenCLI'
            ? 'Open Terminal'
            : isSpawner && item.action === 'CloseAgent'
              ? 'Close Terminal'
              : LABELS[item.action]

          return (
            <Row
              key={item.action}
              selected={isSelected}
              primary={primary}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={hints[item.action]}
              disabled={(item.action === 'CloseAgent' && isCloseAgentDisabled) || (item.action === 'OpenCLI' && isHeadless)}
              danger={item.action === 'CloseAgent'}
            />
          )
        })}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
