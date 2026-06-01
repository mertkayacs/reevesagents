// Run › Output: peek across all agents in this run.
// Polls peekAgent(agent.id, 5) every 5s; displays last 5 lines per agent in bordered boxes.
// Frame + Detail template (primary content is the detail itself).

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { Pagination } from '../../components/Pagination.js'
import { useRouter } from '../../router.js'
import { colors, space } from '../../utils/tokens.js'
import { modelBadgeLabel, modelColor, providerColor } from '../../utils/display.js'
import { listAgents, readRun } from '../../state/runs.js'
import { peekAgent } from '../../launcher/runtime.js'
import type { AgentRecord, RunRecord } from '../../state/types.js'

const PEEK_INTERVAL_MS = 5000
const PREVIEW_LINES = 5
const CHROME_ROWS = 16
const AGENT_CARD_ROWS = PREVIEW_LINES + 5
const ACTION_LABEL_WIDTH = Math.max('Refresh'.length, 'Back'.length)

interface SelectableItem {
  type: 'agent' | 'pagination' | 'action'
  agent?: AgentRecord
  action?: string
}

function safeListAgents(runId: string): AgentRecord[] {
  try { return listAgents(runId) } catch { return [] }
}

function peekAgents(agents: AgentRecord[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const agent of agents) {
    try {
      next[agent.id] = peekAgent(agent.id, PREVIEW_LINES)
    } catch {
      next[agent.id] = '(unable to peek)'
    }
  }
  return next
}

export function RunOutput() {
  const { selectedRunId, pop, push, setSelectedAgentId } = useRouter()
  const { rows: termRows } = useWindowSize()
  const pageSize = Math.max(1, Math.floor(Math.max(1, termRows - CHROME_ROWS) / AGENT_CARD_ROWS))
  const [run, setRun] = useState<RunRecord | null>(() =>
    selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  )
  const [agents, setAgents] = useState<AgentRecord[]>(() =>
    selectedRunId ? safeListAgents(selectedRunId) : []
  )
  const [peeks, setPeeks] = useState<Record<string, string>>(() => peekAgents(agents))
  const [lastPeekAt, setLastPeekAt] = useState<number>(Date.now())
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!selectedRunId) return
    try {
      const r = readRun(selectedRunId)
      setRun(r)
      const a = listAgents(selectedRunId)
      setAgents(a)
    } catch {
      setRun(null)
      setAgents([])
    }
  }, [selectedRunId])

  function refreshPeeks(): void {
    if (!selectedRunId) return
    let nextAgents: AgentRecord[]
    try {
      const r = readRun(selectedRunId)
      setRun(r)
      nextAgents = listAgents(selectedRunId)
      setAgents(nextAgents)
    } catch {
      setRun(null)
      setAgents([])
      setPeeks({})
      return
    }
    if (nextAgents.length === 0) return
    setPeeks(peekAgents(nextAgents))
    setLastPeekAt(Date.now())
  }

  useEffect(() => {
    refreshPeeks()
    const timer = setInterval(refreshPeeks, PEEK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [selectedRunId])

  const totalPages = Math.max(1, Math.ceil(agents.length / pageSize))
  const activePage = Math.min(page, totalPages)
  const pagedAgents = agents.slice((activePage - 1) * pageSize, activePage * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0

  const items: SelectableItem[] = [
    ...pagedAgents.map(agent => ({ type: 'agent' as const, agent })),
    ...(totalPages > 1 ? [{ type: 'pagination' as const }] : []),
    { type: 'action' as const, action: '__section__' },
    { type: 'action' as const, action: 'Refresh' },
    { type: 'action' as const, action: 'Back' },
  ]

  const selected = items[selectedIdx]

  useEffect(() => {
    setPage(p => Math.min(p, totalPages))
  }, [totalPages])

  useEffect(() => {
    setSelectedIdx(pagedAgents.length > 0 ? 0 : paginOffset + 1)
  }, [pagedAgents.length, paginOffset, page])

  function handleActivate(): void {
    if (!selected) return

    if (selected.type === 'pagination') return

    if (selected.type === 'agent' && selected.agent) {
      setSelectedAgentId(selected.agent.id)
      push('AgentOutput')
      return
    }

    if (selected.type === 'action') {
      switch (selected.action) {
        case 'Refresh':
          refreshPeeks()
          break
        case 'Back':
          pop()
          break
      }
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
    if (key.leftArrow && totalPages > 1) {
      setPage(p => Math.max(1, p - 1))
      setSelectedIdx(0)
      return
    }
    if (key.rightArrow && totalPages > 1) {
      setPage(p => Math.min(totalPages, p + 1))
      setSelectedIdx(0)
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
            <Row selected={true} primary="Back" hint="return to run" />
          </Box>
        </Box>
      </Frame>
    )
  }

  const secondsAgo = Math.floor((Date.now() - lastPeekAt) / 1000)
  const lastPeekLabel = secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`
  let statusContext = agents.length > 0 ? `${agents.length} terminal${agents.length === 1 ? '' : 's'}` : 'no terminals'
  if (selected?.type === 'agent' && selected.agent) statusContext = `${selected.agent.nickname} · enter opens detail`
  if (selected?.type === 'pagination') statusContext = `page ${activePage} of ${totalPages} · ← → turn page`

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Output']}
      meta={[
        { label: 'terminals', value: String(agents.length) },
        { label: 'last peek', value: lastPeekLabel },
      ]}
      tagline="Recent output from each independent terminal in this spawner run. Refreshes every 5 seconds."
      statusContext={statusContext}
      statusKeys="↑↓ move · ←→ page · enter open/refresh · esc back"
    >
      <Box flexDirection="column">
        {agents.length === 0 ? (
          <Text color={colors.text.dim}>No terminals in this run.</Text>
        ) : (
          pagedAgents.map((agent) => {
            const peek = peeks[agent.id] || ''
            const lines = peek ? peek.split('\n').slice(-PREVIEW_LINES) : []
            const isSelected = selected?.type === 'agent' && selected.agent?.id === agent.id
            const providerHue = providerColor(agent.provider)
            const modelHue = modelColor(agent.model, agent.provider)

            return (
              <Box key={agent.id} flexDirection="column" marginBottom={1}>
                <Box borderStyle="single" borderColor={isSelected ? colors.accent.bright : providerHue} paddingX={space.sm}>
                  <Box flexDirection="column">
                    <Text bold>
                      <Text color={isSelected ? colors.accent.bright : colors.text.primary}>{agent.nickname}</Text>
                      <Text color={colors.text.dim}> </Text>
                      <Text color={colors.surface.border}>[</Text>
                      <Text color={providerHue}>{agent.provider}</Text>
                      <Text color={colors.surface.border}>] [</Text>
                      <Text color={modelHue}>{modelBadgeLabel(agent.model)}</Text>
                      <Text color={colors.surface.border}>]</Text>
                    </Text>
                    <Box marginTop={space.sm}>
                      {lines.length === 0 ? (
                        <Text color={colors.text.dim}>(no output yet)</Text>
                      ) : (
                        <Box flexDirection="column">
                          {lines.map((line, lineIdx) => (
                            <Text key={lineIdx} color={colors.text.dim}>
                              {line}
                            </Text>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            )
          })
        )}

        {totalPages > 1 && (
          <Pagination
            page={activePage}
            total={totalPages}
            focused={selectedIdx === pagedAgents.length}
            onPrev={() => { setPage(p => Math.max(1, p - 1)); setSelectedIdx(0) }}
            onNext={() => { setPage(p => Math.min(totalPages, p + 1)); setSelectedIdx(0) }}
          />
        )}

        <Section label="Actions" />

        {['Refresh', 'Back'].map((action, idx) => {
          const actionRowIdx = pagedAgents.length + paginOffset + 1 + idx
          const isSelected = selectedIdx === actionRowIdx
          const hint = action === 'Refresh' ? 'peek all terminals now' : 'return to run hub'

          return (
            <Row
              key={action}
              selected={isSelected}
              primary={action}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={hint}
            />
          )
        })}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
