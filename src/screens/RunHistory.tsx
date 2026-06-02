// Run history page: read-only list of archived ended or stale runs.

import React, { useEffect, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { listRunHistory } from '../state/runs.js'
import type { RunHistoryRecord } from '../state/types.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { providerColor, providerDisplayName } from '../utils/display.js'

const ACTIONS = ['Back', 'Main Menu'] as const
const ACTION_COPY: Record<typeof ACTIONS[number], { label: string; hint: string }> = {
  Back: { label: 'Back', hint: 'return to active runs' },
  'Main Menu': { label: 'Main Menu', hint: 'settings, doctor, reference, credits' },
}
const ACTION_LABEL_WIDTH = Math.max(...ACTIONS.map(action => ACTION_COPY[action].label.length))
const CHROME_ROWS = 15

interface SelectableItem {
  type: 'record' | 'section' | 'action'
  record?: RunHistoryRecord
  action?: typeof ACTIONS[number]
}

function normalizeSelectedIndex(idx: number, recordCount: number): number {
  const firstActionIdx = recordCount + 1
  const maxIdx = firstActionIdx + ACTIONS.length - 1
  if (recordCount === 0) return Math.min(Math.max(firstActionIdx, idx), maxIdx)
  const clamped = Math.min(Math.max(0, idx), maxIdx)
  return clamped === recordCount ? firstActionIdx : clamped
}

function moveSelectedIndex(idx: number, delta: number, recordCount: number): number {
  const firstActionIdx = recordCount + 1
  const maxIdx = firstActionIdx + ACTIONS.length - 1
  if (recordCount === 0) return Math.min(Math.max(firstActionIdx, idx + delta), maxIdx)
  let next = idx + delta
  if (next === recordCount) next += delta
  return Math.min(Math.max(0, next), maxIdx)
}

function statusGlyph(status: RunHistoryRecord['status']): { char: string; color: string } {
  if (status === 'stale') return { char: glyphs.status.warn, color: colors.status.warn }
  return { char: glyphs.status.fail, color: colors.status.error }
}

function shortIso(value: string | null): string {
  if (!value) return 'unknown'
  return `${value.replace('T', ' ').slice(0, 16)}Z`
}

export function RunHistory() {
  const { pop, resetStack } = useRouter()
  const { rows: termRows } = useWindowSize()
  const visibleRecordCount = Math.max(3, termRows - CHROME_ROWS)
  const [records, setRecords] = useState<RunHistoryRecord[]>(() => listRunHistory())
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [recordScroll, setRecordScroll] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setRecords(listRunHistory()), 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { setSelectedIdx(idx => normalizeSelectedIndex(idx, records.length)) }, [records.length])

  const items: SelectableItem[] = [
    ...records.map(record => ({ type: 'record' as const, record })),
    { type: 'section' as const },
    ...ACTIONS.map(action => ({ type: 'action' as const, action })),
  ]
  const activeIdx = normalizeSelectedIndex(selectedIdx, records.length)
  const selected = items[activeIdx]
  const selectedRecord = selected?.type === 'record' ? selected.record : null
  const maxRecordScroll = Math.max(0, records.length - visibleRecordCount)
  const visibleRecords = records.slice(recordScroll, recordScroll + visibleRecordCount)
  const recordNameWidth = Math.max(8, ...visibleRecords.map(record => record.name.length))
  const actionStartIdx = records.length + 1

  useEffect(() => {
    setRecordScroll(offset => {
      const clampedOffset = Math.min(offset, maxRecordScroll)
      if (activeIdx >= records.length) return clampedOffset
      if (activeIdx < clampedOffset) return activeIdx
      if (activeIdx >= clampedOffset + visibleRecordCount) return Math.min(maxRecordScroll, activeIdx - visibleRecordCount + 1)
      return clampedOffset
    })
  }, [activeIdx, records.length, maxRecordScroll, visibleRecordCount])

  function handleActivate(): void {
    if (selected?.type !== 'action') return
    switch (selected.action) {
      case 'Back': pop(); break
      case 'Main Menu': resetStack('Welcome', ['Welcome']); break
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => moveSelectedIndex(normalizeSelectedIndex(idx, records.length), -1, records.length))
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => moveSelectedIndex(normalizeSelectedIndex(idx, records.length), 1, records.length))
      return
    }
    if (key.return) { handleActivate(); return }
    if (key.escape || key.backspace) { pop(); return }
  })

  let statusContext = ''
  if (selectedRecord) {
    const provider = selectedRecord.root_provider ? providerDisplayName(selectedRecord.root_provider) : 'no root provider'
    statusContext = `${selectedRecord.name} · ${selectedRecord.status} · ${selectedRecord.agent_count} agents · ${provider} · ${selectedRecord.working_dir}`
  } else if (selected?.type === 'action' && selected.action) {
    statusContext = ACTION_COPY[selected.action].hint
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', 'History']}
      meta={[
        { label: 'entries', value: String(records.length) },
      ]}
      tagline="Ended and stale runs are archived here with simple shared history."
      statusContext={statusContext}
      statusKeys="enter action · ↑↓ scroll · esc back"
    >
      <Box flexDirection="column">
        <Section label="History" />
        {records.length === 0 ? (
          <Row
            selected={false}
            primary="No history yet"
            trailing="ended runs appear here"
            disabled
          />
        ) : (
          visibleRecords.map((record, idx) => {
            const absoluteIdx = recordScroll + idx
            const badges = [
              { label: record.status, color: record.status === 'stale' ? colors.status.warn : colors.status.error },
              ...(record.root_provider
                ? [{ label: providerDisplayName(record.root_provider), color: providerColor(record.root_provider) }]
                : []),
            ]
            return (
              <Row
                key={record.id}
                selected={activeIdx === absoluteIdx}
                primary={record.name}
                primaryWidth={recordNameWidth}
                glyph={statusGlyph(record.status)}
                badges={badges}
                hint={`${record.agent_count} agents`}
                trailing={shortIso(record.ended_at ?? record.archived_at)}
              />
            )
          })
        )}
        {records.length > visibleRecordCount && (
          <Row
            selected={false}
            primary={`${recordScroll + 1}-${recordScroll + visibleRecords.length} of ${records.length}`}
            trailing="scroll with arrows"
            disabled
          />
        )}
        <SectionEnd />

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
