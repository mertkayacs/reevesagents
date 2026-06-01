// Run terminal list: displays tmux-backed entries in this run.
// Paginates rows when the list exceeds available terminal height.

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { Pagination } from '../../components/Pagination.js'
import { useRouter } from '../../router.js'
import { colors } from '../../utils/tokens.js'
import { glyphs } from '../../utils/glyphs.js'
import { modelBadgeLabel, modelColor, providerColor } from '../../utils/display.js'
import { listAgents, readRun } from '../../state/runs.js'
import type { AgentRecord, RunRecord } from '../../state/types.js'

const CHROME_ROWS = 13
const REFRESH_INTERVAL_MS = 5000

type RowItem = 'agent' | '__section__' | 'pagination' | 'AddWorker' | 'Back'
const ACTION_LABEL_WIDTH = Math.max('Add Terminal'.length, 'Add Entry'.length, 'Back'.length)

interface SelectableItem {
  type: 'agent' | 'pagination' | 'action'
  agent?: AgentRecord
  action?: RowItem
}

function statusGlyph(status: string): { char: string; color: string } {
  if (status === 'working') return { char: glyphs.status.ok, color: colors.status.ok }
  if (status === 'blocked') return { char: glyphs.status.warn, color: colors.status.warn }
  if (status === 'failed') return { char: glyphs.status.fail, color: colors.status.error }
  if (status === 'done') return { char: glyphs.status.ok, color: colors.text.muted }
  return { char: glyphs.status.pending, color: colors.text.muted }
}

export function RunAgents() {
  const { selectedRunId, setSelectedAgentId, push, pop } = useRouter()
  const { rows: termRows } = useWindowSize()
  const pageSize = Math.max(2, termRows - CHROME_ROWS)

  const [run, setRun] = useState<RunRecord | null>(() =>
    selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  )
  const [agents, setAgents] = useState<AgentRecord[]>(() =>
    selectedRunId ? listAgents(selectedRunId) : []
  )
  const [selectedIdx, setSelectedIdx] = useState(() => (agents.length > 0 ? 0 : 1))
  const [page, setPage] = useState(1)
  const isSpawner = run?.mode === 'spawner'

  const dataItems: SelectableItem[] = agents.map(agent => ({ type: 'agent' as const, agent }))

  useEffect(() => {
    if (!selectedRunId) { setRun(null); setAgents([]); return }
    const refresh = () => {
      try {
        setRun(readRun(selectedRunId))
        const next = listAgents(selectedRunId)
        setAgents(next)
        setSelectedIdx(idx => Math.min(idx, Math.max(0, next.length + 2)))
      } catch { setRun(null); setAgents([]) }
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [selectedRunId])

  useEffect(() => { setPage(1); setSelectedIdx(agents.length > 0 ? 0 : 1) }, [agents.length])

  const totalPages = Math.max(1, Math.ceil(dataItems.length / pageSize))
  const pagedData = dataItems.slice((page - 1) * pageSize, page * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0

  const items: SelectableItem[] = [
    ...pagedData,
    ...(totalPages > 1 ? [{ type: 'pagination' as const }] : []),
    { type: 'action', action: '__section__' },
    { type: 'action', action: 'AddWorker' },
    { type: 'action', action: 'Back' },
  ]

  const selected = items[selectedIdx]

  function handleActivate(): void {
    if (!selected) return
    if (selected.type === 'pagination') return
    if (selected.type === 'agent' && selected.agent) {
      setSelectedAgentId(selected.agent.id)
      push('AgentDetail')
      return
    }

    if (selected.type === 'action') {
      switch (selected.action) {
        case 'AddWorker':
          if (!isSpawner || run?.status === 'ended' || run?.ended_at !== null) return
          push('AddWorker')
          break
        case 'Back': pop(); break
      }
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => {
        let next = idx - 1
        while (next >= 0 && items[next]?.type === 'action' && items[next].action === '__section__') next--
        return Math.max(0, next)
      })
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => {
        let next = idx + 1
        while (next < items.length && items[next]?.type === 'action' && items[next].action === '__section__') next++
        return Math.min(items.length - 1, next)
      })
      return
    }
    if (key.return) { if (!run) { pop(); return } handleActivate(); return }
    if (key.escape || key.backspace) { pop(); return }
  })

  if (!run) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Runs']} statusContext="Run not found">
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Run not found.</Text>
          <Box marginTop={1}>
            <Row selected={true} primary="Back" hint="return to all runs" />
          </Box>
        </Box>
      </Frame>
    )
  }

  const isRunEnded = run.status === 'ended' || run.ended_at !== null
  let statusContext = `${run.name} · ${agents.length} ${isSpawner ? 'terminals' : 'entries'}`
  if (selected?.type === 'pagination') statusContext = `page ${page} of ${totalPages} · ← → turn page`
  if (selected?.type === 'action' && selected.action === 'AddWorker') statusContext = isRunEnded ? 'run is ended' : isSpawner ? 'spawn new terminal' : 'not available for this run type'
  if (selected?.type === 'action' && selected.action === 'Back') statusContext = 'return to run hub'

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isSpawner ? 'Terminals' : 'Entries']}
      meta={[
        { label: 'count', value: String(agents.length) },
        { label: 'status', value: run.status },
      ]}
      tagline={isSpawner
        ? 'Independent CLI terminals in this spawner run.'
        : 'This run type is read-only in the spawner package.'}
      statusContext={statusContext}
      statusKeys="enter open · ↑↓ move · esc back"
    >
      <Box flexDirection="column">
        <Section label={isSpawner ? 'Terminals' : 'Entries'} />
        {agents.length === 0 && (
          <Row selected={false} primary={isSpawner ? 'No terminals' : 'No entries'} trailing={isSpawner ? 'add a terminal below' : 'not managed here'} disabled />
        )}
        {pagedData.map((item, idx) => {
          const isSelected = selectedIdx === idx

          if (item.type === 'agent' && item.agent) {
            const agent = item.agent
            const isRoot = !isSpawner && agent.role === 'root'
            const badges = [
              ...(isRoot ? [{ label: 'root', color: colors.accent.primary }] : []),
              { label: agent.provider, color: providerColor(agent.provider) },
              { label: modelBadgeLabel(agent.model), color: modelColor(agent.model, agent.provider) },
            ]
            return (
              <Row
                key={agent.id}
                selected={isSelected}
                primary={agent.nickname}
                glyph={statusGlyph(agent.task_status)}
                badges={badges}
                hint={agent.task_note || agent.task_status}
              />
            )
          }
          return null
        })}

        {totalPages > 1 && (
          <Pagination
            page={page}
            total={totalPages}
            focused={selectedIdx === pagedData.length}
            onPrev={() => { setPage(p => Math.max(1, p - 1)); setSelectedIdx(0) }}
            onNext={() => { setPage(p => Math.min(totalPages, p + 1)); setSelectedIdx(0) }}
          />
        )}
        <SectionEnd />

        <Section label="Actions" />

        <Row
          selected={selectedIdx === pagedData.length + paginOffset + 1}
          primary={isSpawner ? 'Add Terminal' : 'Add Entry'}
          primaryWidth={ACTION_LABEL_WIDTH}
          hint={isRunEnded ? 'run is ended' : isSpawner ? 'spawn new terminal' : 'not available for this run type'}
          disabled={isRunEnded || !isSpawner}
        />
        <Row
          selected={selectedIdx === pagedData.length + paginOffset + 2}
          primary="Back"
          primaryWidth={ACTION_LABEL_WIDTH}
          hint="return to run hub"
        />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
