// Agent detail overview: summary plus output, prompt, open, lifecycle, and back actions.

import React, { useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { useRouter } from '../../router.js'
import { colors } from '../../utils/tokens.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../../utils/display.js'
import { findAgent, listAgents, readRun } from '../../../core/runs.js'
import { openAgent } from '../../../core/runtime.js'
import { useToast } from '../../contexts/ToastContext.js'
import { useLanguage } from '../../contexts/LanguageContext.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import type { AgentRecord } from '../../../core/types.js'

type RowItem = 'Output' | 'Task' | '__section__' | 'OpenCLI' | 'AgentLifecycle' | 'Back'
const LABELS: Record<RowItem, string> = {
  Output: 'Output',
  Task: 'Prompt',
  OpenCLI: 'Open Agent',
  AgentLifecycle: 'Stop Agent',
  Back: 'Back',
  '__section__': '',
}
const ACTION_LABEL_WIDTH = Math.max(
  ...Object.values(LABELS).map(label => label.length),
  'Open Agent'.length,
  'Stop Agent'.length,
  'Delete Agent'.length,
)

interface SelectableItem {
  type: 'action'
  action: RowItem
}

export function AgentDetail() {
  const { selectedAgentId, push, pop } = useRouter()
  const { toast } = useToast()
  const { t, language } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 8
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
    { type: 'action', action: 'AgentLifecycle' },
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
    if (!selected || !agent) return

    switch (selected.action) {
      case 'Output':
        push('AgentOutput')
        break
      case 'Task':
        push('AgentTask')
        break
      case 'OpenCLI':
        if (!canOpenAgent) return
        try {
          openAgent(agent.id)
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), 'error')
        }
        break
      case 'AgentLifecycle':
        if (agent.role === 'root' && liveAgents.length > 1) return
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
          <Text color={colors.text.dim}>{translatePhrase(language, 'Agent not found.')}</Text>
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
  if (agent.task_note) summaryParts.push(`note ${agent.task_note}`)
  summaryParts.push(`workdir ${agent.working_dir}`)
  const summaryLine = summaryParts.join(' · ')
  const isAgentEnded = agent.ended_at !== null
  const isHeadless = !!agent.headless
  const canOpenAgent = !isAgentEnded && !isHeadless && !!agent.tmux_window_id
  const openDisabledHint = isAgentEnded ? 'agent has ended' : 'no tmux window'
  const providerLabel = providerDisplayName(agent.provider)
  const liveAgents = listAgents(agent.run_id).filter(item => item.ended_at === null)
  const isRootLocked = agent.role === 'root' && liveAgents.length > 1
  const agentLifecycleHint = isRootLocked ? 'stop workers first' : isAgentEnded ? 'delete stopped agent' : 'stop this agent'

  let statusContext = `${agent.nickname} · ${providerLabel} · ${agent.task_status}`
  if (selected && selected.action !== '__section__') {
    const actionLabels: Record<RowItem, string> = {
      Output: 'view recent output',
      Task: 'view initial prompt and status',
      OpenCLI: canOpenAgent ? 'switch to this agent window' : openDisabledHint,
      AgentLifecycle: agentLifecycleHint,
      Back: 'return to agents list',
      '__section__': '',
    }
    statusContext = actionLabels[selected.action] || ''
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname]}
      meta={[
        { label: 'provider', value: providerLabel },
        { label: 'status', value: agent.task_status },
      ]}
      tagline={t('agentDetail.tagline', { provider: providerLabel, name: run.name })}
      statusContext={statusContext}
      statusKeys="↑↓ move · enter select · esc back"
    >
      {compactBody ? (
        <Box flexDirection="column">
          <Section label={selectedIdx < 2 ? 'Agent' : 'Actions'} />
          {visibleCompactItems.map(({ item, itemIdx }) => {
            const hints: Record<RowItem, string> = {
              Output: isHeadless ? 'no output' : 'live peek of the tmux pane',
              Task: 'initial prompt and status',
              OpenCLI: canOpenAgent ? 'switch tmux to this agent window' : openDisabledHint,
              AgentLifecycle: agentLifecycleHint,
              Back: 'return to agents list',
              '__section__': '',
            }
            const primary = item.action === 'AgentLifecycle' && isAgentEnded ? 'Delete Agent' : LABELS[item.action]
            return (
              <Row
                key={item.action}
                selected={selectedIdx === itemIdx}
                primary={primary}
                primaryWidth={ACTION_LABEL_WIDTH}
                hint={hints[item.action]}
                disabled={(item.action === 'AgentLifecycle' && isRootLocked) || (item.action === 'OpenCLI' && !canOpenAgent)}
                danger={item.action === 'AgentLifecycle'}
              />
            )
          })}
          <SectionEnd />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box flexDirection="column" marginBottom={1}>
            <Text wrap="truncate-end">
              <Text color={colors.surface.border}>[</Text>
              <Text color={providerColor(agent.provider)}>{providerLabel}</Text>
              <Text color={colors.surface.border}>] [</Text>
              <Text color={modelColor(agent.model, agent.provider)}>{modelBadgeLabel(agent.model)}</Text>
              <Text color={colors.surface.border}>]</Text>
            </Text>
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
              Output: isHeadless ? 'no output' : 'live peek of the tmux pane',
              Task: 'initial prompt and status',
              OpenCLI: canOpenAgent ? 'switch tmux to this agent window' : openDisabledHint,
              AgentLifecycle: agentLifecycleHint,
              Back: 'return to agents list',
              '__section__': '',
            }
            const primary = item.action === 'AgentLifecycle' && isAgentEnded ? 'Delete Agent' : LABELS[item.action]
            return (
              <Row
                key={item.action}
                selected={isSelected}
                primary={primary}
                primaryWidth={ACTION_LABEL_WIDTH}
                hint={hints[item.action]}
                disabled={(item.action === 'AgentLifecycle' && isRootLocked) || (item.action === 'OpenCLI' && !canOpenAgent)}
                danger={item.action === 'AgentLifecycle'}
              />
            )
          })}
          <SectionEnd />
        </Box>
      )}
    </Frame>
  )
}
