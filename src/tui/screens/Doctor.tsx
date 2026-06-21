// Setup and environment health list. Shows status glyphs, refresh actions.
// Recheck shows a spinner during work. Enter on check navigates to detail page.
// Paginates check rows when the list exceeds available terminal height.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Primary } from '../components/Primary.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Legend } from '../components/Legend.js'
import { Spinner } from '../components/Spinner.js'
import { Pagination } from '../components/Pagination.js'
import { useRouter } from '../router.js'
import { colors } from '../../utils/tokens.js'
import { glyphs } from '../../utils/glyphs.js'
import { runDoctor } from '../../core/doctor.js'

const CHROME_ROWS = 17

function statusGlyph(status: 'ok' | 'warn' | 'fail'): { char: string; color: string } {
  if (status === 'ok') return { char: glyphs.status.ok, color: colors.status.ok }
  if (status === 'warn') return { char: glyphs.status.warn, color: colors.status.warn }
  return { char: glyphs.status.fail, color: colors.status.error }
}

export function Doctor() {
  const { pop, push, setSelectedCheckName } = useRouter()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 10
  const pageSize = Math.max(1, compactBody ? bodyRows - 3 : Math.min(termRows - CHROME_ROWS, bodyRows - 7))

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [page, setPage] = useState(1)
  const result = useMemo(() => runDoctor(), [refreshKey])

  const checks = result.checks
  const counts = {
    ok: checks.filter(c => c.status === 'ok').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
  }

  useEffect(() => { setPage(1); setSelectedIdx(0) }, [checks.length])
  useEffect(() => { setSelectedIdx(0) }, [page])

  const totalPages = Math.max(1, Math.ceil(checks.length / pageSize))
  const pagedChecks = checks.slice((page - 1) * pageSize, page * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0
  const actionOffset = pagedChecks.length + paginOffset
  const totalItems = actionOffset + 2  // Recheck, Back
  const compactEntryCount = Math.max(1, bodyRows - 2)
  const compactFirstEntry = Math.min(
    Math.max(0, selectedIdx - compactEntryCount + 1),
    Math.max(0, totalItems - compactEntryCount),
  )
  const compactEntryIndexes = Array.from(
    { length: Math.min(compactEntryCount, totalItems - compactFirstEntry) },
    (_, idx) => compactFirstEntry + idx,
  )

  const selectedCheck = selectedIdx < pagedChecks.length ? pagedChecks[selectedIdx] : null
  const checkLabelWidth = Math.max(...checks.map(check => check.name.length), 'Recheck'.length, 'Back'.length)

  const handleRecheck = () => {
    setIsSpinning(true)
    setTimeout(() => { setRefreshKey(k => k + 1); setIsSpinning(false) }, 200)
  }

  useInput((_input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(totalItems - 1, idx + 1)); return }
    if (key.return) {
      if (selectedIdx < pagedChecks.length) {
        setSelectedCheckName(pagedChecks[selectedIdx]?.name ?? null)
        push('DoctorCheck')
        return
      }
      if (selectedIdx === pagedChecks.length && totalPages > 1) return  // pagination row
      if (selectedIdx === actionOffset) { handleRecheck(); return }
      if (selectedIdx === actionOffset + 1) { pop(); return }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Doctor']}
      meta={[
        { label: 'ok', value: String(counts.ok) },
        { label: 'warn', value: String(counts.warn) },
        { label: 'fail', value: String(counts.fail) },
      ]}
      tagline="Setup and environment health for TUI, CLI, Web UI, and tmux."
      statusContext={selectedCheck ? `${selectedCheck.name}: ${selectedCheck.detail}` : ''}
    >
      {compactBody ? (
        <Primary>
          <Section label={selectedIdx < pagedChecks.length ? 'Checks' : 'Actions'} />
          {isSpinning ? (
            <Spinner label="checking..." color={colors.accent.bright} />
          ) : compactEntryIndexes.map(idx => {
            if (idx < pagedChecks.length) {
              const check = pagedChecks[idx]!
              return (
                <Row
                  key={check.name}
                  selected={idx === selectedIdx}
                  glyph={statusGlyph(check.status)}
                  primary={check.name}
                  primaryWidth={checkLabelWidth}
                  hint={check.detail}
                />
              )
            }
            if (totalPages > 1 && idx === pagedChecks.length) {
              return (
                <Pagination
                  key="pagination"
                  page={page}
                  total={totalPages}
                  focused={selectedIdx === pagedChecks.length}
                  onPrev={() => setPage(p => Math.max(1, p - 1))}
                  onNext={() => setPage(p => Math.min(totalPages, p + 1))}
                />
              )
            }
            if (idx === actionOffset) {
              return <Row key="recheck" selected={selectedIdx === actionOffset} primary="Recheck" primaryWidth={checkLabelWidth} hint="run doctor again" />
            }
            return <Row key="back" selected={selectedIdx === actionOffset + 1} primary="Back" primaryWidth={checkLabelWidth} hint="return to previous page" />
          })}
          <SectionEnd />
        </Primary>
      ) : (
        <Primary>
          {isSpinning && <Spinner label="checking..." color={colors.accent.bright} />}
          {!isSpinning && pagedChecks.map((check, idx) => (
            <Row
              key={check.name}
              selected={idx === selectedIdx}
              glyph={statusGlyph(check.status)}
              primary={check.name}
              primaryWidth={checkLabelWidth}
              hint={check.detail}
            />
          ))}

          {!isSpinning && totalPages > 1 && (
            <Pagination
              page={page}
              total={totalPages}
              focused={selectedIdx === pagedChecks.length}
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
          )}

          {!isSpinning && (
            <>
              <Box marginTop={1} />
              <Legend
                items={[
                  { glyph: glyphs.status.ok, label: 'ok', color: colors.status.ok },
                  { glyph: glyphs.status.warn, label: 'warn', color: colors.status.warn },
                  { glyph: glyphs.status.fail, label: 'fail', color: colors.status.error },
                ]}
              />
            </>
          )}

          <Box marginTop={1} />
          <Section label="Actions" />
          <Row selected={selectedIdx === actionOffset} primary="Recheck" primaryWidth={checkLabelWidth} hint="run doctor again" />
          <Row selected={selectedIdx === actionOffset + 1} primary="Back" primaryWidth={checkLabelWidth} hint="return to previous page" />
          <SectionEnd />
        </Primary>
      )}
    </Frame>
  )
}
