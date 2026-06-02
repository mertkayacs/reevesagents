// Runs list page: displays live runs with optional selection-driven detail.
// Auto-cleanup of ended/stale runs on mount and every 2s refresh. Frame + List template.
// Scrolls run rows when the list exceeds the available terminal height.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput, useApp, useWindowSize } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Legend } from '../components/Legend.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../utils/display.js'
import { autoCleanupRuns, computeRunStatus, listAgents, listRuns, runHasLiveTmuxTarget } from '../state/runs.js'
import type { RunRecord } from '../state/types.js'

const ACTIONS = ['NewRun', 'History', 'Main Menu', 'Quit'] as const
const CHROME_ROWS = 18
const ACTION_COPY: Record<typeof ACTIONS[number], { label: string; hint: string }> = {
  NewRun: { label: 'New Run', hint: 'create a spawner workspace' },
  History: { label: 'History', hint: 'view ended and stale runs' },
  'Main Menu': { label: 'Main Menu', hint: 'settings, doctor, reference, credits' },
  Quit: { label: 'Quit', hint: 'exit the TUI' },
}
const ACTION_LABEL_WIDTH = Math.max(...ACTIONS.map(action => ACTION_COPY[action].label.length))

interface SelectableItem {
  type: 'run' | 'section' | 'action'
  run?: RunRecord
  action?: typeof ACTIONS[number]
}

function statusGlyph(status: string): { char: string; color: string } {
  if (status === 'running') return { char: glyphs.status.ok, color: colors.status.ok }
  if (status === 'stale') return { char: glyphs.status.warn, color: colors.status.warn }
  return { char: glyphs.status.fail, color: colors.status.error }
}

function normalizeSelectedIndex(idx: number, runCount: number): number {
  const firstActionIdx = runCount + 1
  const maxIdx = firstActionIdx + ACTIONS.length - 1
  if (runCount === 0) return Math.min(Math.max(firstActionIdx, idx), maxIdx)
  const clamped = Math.min(Math.max(0, idx), maxIdx)
  return clamped === runCount ? firstActionIdx : clamped
}

function moveSelectedIndex(idx: number, delta: number, runCount: number): number {
  const firstActionIdx = runCount + 1
  const maxIdx = firstActionIdx + ACTIONS.length - 1
  if (runCount === 0) return Math.min(Math.max(firstActionIdx, idx + delta), maxIdx)
  let next = idx + delta
  if (next === runCount) next += delta
  return Math.min(Math.max(0, next), maxIdx)
}

export function Runs() {
  const { exit } = useApp()
  const { push, resetStack, setSelectedRunId } = useRouter()
  const { rows: termRows } = useWindowSize()
  const visibleRunCount = Math.max(2, termRows - CHROME_ROWS)

  const [runs, setRuns] = useState<RunRecord[]>(() => {
    autoCleanupRuns()
    return listRuns()
  })
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [runScroll, setRunScroll] = useState(0)

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
    setSelectedIdx(idx => normalizeSelectedIndex(idx, next.length))
  }

  useEffect(() => {
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { setSelectedIdx(idx => normalizeSelectedIndex(idx, runs.length)) }, [runs.length])

  const items: SelectableItem[] = [
    ...runs.map(run => ({ type: 'run' as const, run })),
    { type: 'section' as const },
    ...ACTIONS.map(action => ({ type: 'action' as const, action })),
  ]

  const activeIdx = normalizeSelectedIndex(selectedIdx, runs.length)
  const selected = items[activeIdx]
  const selectedRun = selected?.type === 'run' ? selected.run : null
  const runStatuses = useMemo(
    () => new Map(runs.map(run => [run.id, computeRunStatus(run, runHasLiveTmuxTarget(run))])),
    [runs],
  )
  const runStatus = (run: RunRecord) => runStatuses.get(run.id) ?? computeRunStatus(run)
  const runningCount = runs.filter(run => runStatus(run) === 'running').length
  const staleCount = runs.filter(run => runStatus(run) === 'stale').length
  const maxRunScroll = Math.max(0, runs.length - visibleRunCount)
  const visibleRuns = runs.slice(runScroll, runScroll + visibleRunCount)
  const runNameWidth = Math.max(8, ...visibleRuns.map(run => run.name.length))
  const actionStartIdx = runs.length + 1

  useEffect(() => {
    setRunScroll(offset => {
      const clampedOffset = Math.min(offset, maxRunScroll)
      if (activeIdx >= runs.length) return clampedOffset
      if (activeIdx < clampedOffset) return activeIdx
      if (activeIdx >= clampedOffset + visibleRunCount) return Math.min(maxRunScroll, activeIdx - visibleRunCount + 1)
      return clampedOffset
    })
  }, [activeIdx, runs.length, maxRunScroll, visibleRunCount])

  function handleActivate(): void {
    if (!selected) return

    if (selected.type === 'run' && selected.run) {
      setSelectedRunId(selected.run.id)
      push('Run')
      return
    }

    if (selected.type === 'action') {
      switch (selected.action) {
        case 'NewRun': push('NewRun'); break
        case 'History': push('RunHistory'); break
        case 'Main Menu': resetStack('Welcome', ['Welcome']); break
        case 'Quit': exit(); break
      }
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => moveSelectedIndex(normalizeSelectedIndex(idx, runs.length), -1, runs.length))
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => moveSelectedIndex(normalizeSelectedIndex(idx, runs.length), 1, runs.length))
      return
    }
    if (key.return) { handleActivate(); return }
    if (key.escape || key.backspace) { resetStack('Welcome', ['Welcome']); return }
  })

  let statusContext = ''
  if (selectedRun) {
    const agents = listAgents(selectedRun.id)
    statusContext = `${selectedRun.name} · ${runStatus(selectedRun)} · ${agents.length} agents · ${selectedRun.working_dir}`
  } else if (selected?.type === 'action' && selected.action) {
    statusContext = ACTION_COPY[selected.action]?.hint ?? selected.action
  }


  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs']}
      meta={[
        { label: 'running', value: String(runningCount) },
        { label: 'stale', value: String(staleCount) },
      ]}
      tagline="Manage local tmux workspaces. Spawner runs are independent provider CLI agents."
      statusContext={statusContext}
      statusKeys="enter open · ↑↓ scroll · esc main menu"
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
          visibleRuns.map((run, idx) => {
            const absoluteIdx = runScroll + idx
            const agents = listAgents(run.id)
            const root = agents.find(a => a.role === 'root')
            const badges = [
              { label: 'spawn', color: colors.accent.primary },
              ...(root
                ? [
                  { label: providerDisplayName(root.provider), color: providerColor(root.provider) },
                  { label: modelBadgeLabel(root.model), color: modelColor(root.model, root.provider) },
                ]
                : []),
            ]
            return (
              <Row
                key={run.id}
                selected={activeIdx === absoluteIdx}
                primary={run.name}
                primaryWidth={runNameWidth}
                glyph={statusGlyph(runStatus(run))}
                badges={badges}
                hint={`${agents.length} agents`}
              />
            )
          })
        )}
        {runs.length > visibleRunCount && (
          <Row
            selected={false}
            primary={`${runScroll + 1}-${runScroll + visibleRuns.length} of ${runs.length}`}
            trailing="scroll with arrows"
            disabled
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
            selected={activeIdx === actionStartIdx + idx}
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
