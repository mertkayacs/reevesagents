// Runs list page: displays live runs with optional selection-driven detail.
// Auto-cleanup of ended/stale runs on mount and every 2s refresh. Frame + List template.
// Paginates run rows when the list exceeds the available terminal height.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput, useApp, useWindowSize } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Legend } from '../components/Legend.js'
import { Pagination } from '../components/Pagination.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { modelBadgeLabel, modelColor, providerColor } from '../utils/display.js'
import { autoCleanupRuns, computeRunStatus, listAgents, listRuns, runHasLiveTmuxTarget } from '../state/runs.js'
import type { RunRecord } from '../state/types.js'

const ACTIONS = ['NewRun', 'Main Menu', 'Quit'] as const
const CHROME_ROWS = 17
const ACTION_COPY: Record<typeof ACTIONS[number], { label: string; hint: string }> = {
  NewRun: { label: 'New Run', hint: 'create a spawner workspace' },
  'Main Menu': { label: 'Main Menu', hint: 'settings, doctor, reference, credits' },
  Quit: { label: 'Quit', hint: 'exit the TUI' },
}
const ACTION_LABEL_WIDTH = Math.max(...ACTIONS.map(action => ACTION_COPY[action].label.length))

interface SelectableItem {
  type: 'run' | 'pagination' | 'action'
  run?: RunRecord
  action?: string
}

function statusGlyph(status: string): { char: string; color: string } {
  if (status === 'running') return { char: glyphs.status.ok, color: colors.status.ok }
  if (status === 'stale') return { char: glyphs.status.warn, color: colors.status.warn }
  return { char: glyphs.status.fail, color: colors.status.error }
}

export function Runs() {
  const { exit } = useApp()
  const { push, resetStack, setSelectedRunId } = useRouter()
  const { rows: termRows } = useWindowSize()
  const pageSize = Math.max(2, termRows - CHROME_ROWS)

  const [runs, setRuns] = useState<RunRecord[]>(() => {
    autoCleanupRuns()
    return listRuns()
  })
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [page, setPage] = useState(1)

  function refresh(): void {
    autoCleanupRuns()
    const next = listRuns()
    setRuns(prev => {
      if (prev.length !== next.length) return next
      for (let i = 0; i < prev.length; i++) {
        const p = prev[i]!, n = next[i]!
        if (p.id !== n.id || p.status !== n.status || p.ended_at !== n.ended_at) return next
      }
      return prev
    })
    setSelectedIdx(idx => Math.min(idx, Math.max(0, next.length + ACTIONS.length)))
  }

  useEffect(() => {
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { setPage(1) }, [runs.length])

  const totalPages = Math.max(1, Math.ceil(runs.length / pageSize))
  const pagedRuns = runs.slice((page - 1) * pageSize, page * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0
  const firstSelectableIdx = pagedRuns.length > 0 ? 0 : pagedRuns.length + paginOffset + 1

  const items: SelectableItem[] = [
    ...pagedRuns.map(run => ({ type: 'run' as const, run })),
    ...(totalPages > 1 ? [{ type: 'pagination' as const }] : []),
    { type: 'action' as const, action: '__section__' },
    ...ACTIONS.map(action => ({ type: 'action' as const, action })),
  ]

  const selected = items[selectedIdx]
  const selectedRun = selected?.type === 'run' ? selected.run : null
  const runStatuses = useMemo(
    () => new Map(runs.map(run => [run.id, computeRunStatus(run, runHasLiveTmuxTarget(run))])),
    [runs],
  )
  const runStatus = (run: RunRecord) => runStatuses.get(run.id) ?? computeRunStatus(run)
  const runningCount = runs.filter(run => runStatus(run) === 'running').length
  const staleCount = runs.filter(run => runStatus(run) === 'stale').length

  function handleActivate(): void {
    if (!selected) return
    if (selected.type === 'pagination') return

    if (selected.type === 'run' && selected.run) {
      setSelectedRunId(selected.run.id)
      push('Run')
      return
    }

    if (selected.type === 'action') {
      switch (selected.action) {
        case 'NewRun': push('NewRun'); break
        case 'Main Menu': resetStack('Welcome', ['Welcome']); break
        case 'Quit': exit(); break
      }
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => {
        let next = idx - 1
        while (next >= 0 && items[next]?.type === 'action' && items[next]?.action === '__section__') next--
        return Math.max(0, next)
      })
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => {
        let next = idx + 1
        while (next < items.length && items[next]?.type === 'action' && items[next]?.action === '__section__') next++
        return Math.min(items.length - 1, next)
      })
      return
    }
    if (key.return) { handleActivate(); return }
    if (key.escape || key.backspace) { resetStack('Welcome', ['Welcome']); return }
  })

  useEffect(() => { setSelectedIdx(firstSelectableIdx) }, [firstSelectableIdx, page])
  useEffect(() => {
    setSelectedIdx(idx => {
      const clamped = Math.min(idx, Math.max(0, items.length - 1))
      const item = items[clamped]
      return item?.type === 'action' && item.action === '__section__' ? firstSelectableIdx : clamped
    })
  }, [items.length, firstSelectableIdx])

  let statusContext = ''
  if (selectedRun) {
    const agents = listAgents(selectedRun.id)
    statusContext = `${selectedRun.name} · ${runStatus(selectedRun)} · ${agents.length} ${selectedRun.mode === 'spawner' ? 'terminals' : 'entries'} · ${selectedRun.working_dir}`
  } else if (selected?.type === 'action' && selected.action && selected.action !== '__section__') {
    statusContext = ACTION_COPY[selected.action as typeof ACTIONS[number]]?.hint ?? selected.action
  } else if (selected?.type === 'pagination') {
    statusContext = `page ${page} of ${totalPages} · ← → turn page`
  }


  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs']}
      meta={[
        { label: 'running', value: String(runningCount) },
        { label: 'stale', value: String(staleCount) },
      ]}
      tagline="Manage local tmux workspaces. Spawner runs are independent provider CLI terminals."
      statusContext={statusContext}
      statusKeys="enter open · ↑↓ move · esc main menu"
    >
      <Box flexDirection="column">
        <Section label="Runs" />
        {runs.length === 0 ? (
          <Row
            selected={false}
            primary="No runs yet"
            trailing="choose New Run below"
            disabled
          />
        ) : (
          pagedRuns.map((run, idx) => {
            const agents = listAgents(run.id)
            const root = agents.find(a => a.role === 'root')
            const isSpawner = run.mode === 'spawner'
            const badges = [
              ...(isSpawner ? [{ label: 'spawn', color: colors.accent.primary }] : []),
              ...(root
                ? [
                  { label: root.provider, color: providerColor(root.provider) },
                  { label: modelBadgeLabel(root.model), color: modelColor(root.model, root.provider) },
                ]
                : []),
            ]
            return (
              <Row
                key={run.id}
                selected={selectedIdx === idx}
                primary={run.name}
                glyph={statusGlyph(runStatus(run))}
                badges={badges}
                hint={`${agents.length} ${isSpawner ? 'terminals' : 'entries'}`}
              />
            )
          })
        )}

        {totalPages > 1 && (
          <Pagination
            page={page}
            total={totalPages}
            focused={selectedIdx === pagedRuns.length}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        )}
        <SectionEnd />

        <Legend
          items={[
            { glyph: glyphs.status.ok, label: 'running', color: colors.status.ok },
            { glyph: glyphs.status.warn, label: 'stale', color: colors.status.warn },
          ]}
        />

        <Section label="Actions" />

        {ACTIONS.map((action, idx) => (
          <Row
            key={action}
            selected={selectedIdx === pagedRuns.length + paginOffset + 1 + idx}
            primary={ACTION_COPY[action].label}
            primaryWidth={ACTION_LABEL_WIDTH}
            hint={ACTION_COPY[action].hint}
          />
        ))}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
