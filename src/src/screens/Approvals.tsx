// Global approvals list across all runs. Pending by default; Show All toggle includes resolved.
// Paginates approval rows when the list exceeds available terminal height.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame } from '../components/Frame.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Row } from '../components/Row.js'
import { Legend } from '../components/Legend.js'
import { Pagination } from '../components/Pagination.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { findAgent, listRunApprovals, readRun } from '../state/runs.js'

const CHROME_ROWS = 13

function agentLabel(agentId: string): string {
  try { return findAgent(agentId).nickname } catch { return agentId.slice(0, 8) }
}

export function Approvals() {
  const { push, pop, setSelectedApprovalId } = useRouter()
  const { rows: termRows } = useWindowSize()
  const pageSize = Math.max(2, termRows - CHROME_ROWS)

  const [rowIdx, setRowIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => listRunApprovals(undefined, showAll ? undefined : 'pending'), [showAll])
  const pendingCount = useMemo(() => listRunApprovals(undefined, 'pending').length, [])
  const highRiskCount = useMemo(() => listRunApprovals(undefined, 'pending').filter(a => a.risk === 'high').length, [])

  useEffect(() => { setPage(1); setRowIdx(0) }, [filtered.length])
  useEffect(() => { setRowIdx(0) }, [page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pagedFiltered = filtered.slice((page - 1) * pageSize, page * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0
  const totalRows = pagedFiltered.length + paginOffset + 2  // + Show All + Back

  const selected = pagedFiltered[rowIdx] ?? null
  const selectedRun = selected ? (() => { try { return readRun(selected.run_id) } catch { return null } })() : null

  useInput((_input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow) {
      setRowIdx(idx => (idx > 0 ? idx - 1 : totalRows - 1))
      return
    }
    if (key.downArrow) {
      setRowIdx(idx => (idx < totalRows - 1 ? idx + 1 : 0))
      return
    }
    if (key.return) {
      if (rowIdx < pagedFiltered.length) {
        const approval = pagedFiltered[rowIdx]
        if (approval) { setSelectedApprovalId(approval.id); push('Approval') }
        return
      }
      // pagination row: Enter does nothing (← → handled by Pagination component)
      if (rowIdx === pagedFiltered.length && totalPages > 1) return
      const actionIdx = rowIdx - pagedFiltered.length - paginOffset
      if (actionIdx === 0) { setShowAll(v => !v); return }
      if (actionIdx === 1) { pop(); return }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Approvals']}
      meta={[
        { label: 'pending', value: String(pendingCount) },
        { label: 'high risk', value: String(highRiskCount) },
      ]}
      tagline="Review pending approval requests across all runs."
      statusContext={selected && selectedRun ? `${selectedRun.name} · ${agentLabel(selected.agent_id)}` : undefined}
    >
      <Box flexDirection="column">
        {filtered.length === 0 ? (
          <Row selected={false} primary={showAll ? 'No approvals' : 'No pending approvals'} trailing="nothing to review" disabled />
        ) : (
          <>
            <Legend items={[
              { glyph: glyphs.status.ok, label: 'low', color: colors.status.ok },
              { glyph: glyphs.status.warn, label: 'medium', color: colors.status.warn },
              { glyph: glyphs.status.fail, label: 'high', color: colors.status.error },
            ]} />
            {pagedFiltered.map((approval, idx) => {
              const rowRun = (() => { try { return readRun(approval.run_id) } catch { return null } })()
              const riskColor = approval.risk === 'high' ? colors.status.error : approval.risk === 'medium' ? colors.status.warn : colors.status.ok
              const statusColor = approval.status === 'pending' ? colors.accent.bright : approval.status === 'approved' ? colors.status.ok : approval.status === 'denied' ? colors.status.error : colors.text.muted
              return (
                <Row
                  key={approval.id}
                  selected={rowIdx === idx}
                  primary={approval.action}
                  glyph={{ char: glyphs.bullet, color: riskColor }}
                  badge={{ label: approval.status, color: statusColor }}
                  hint={`${rowRun?.name ?? approval.run_id.slice(0, 8)} · ${agentLabel(approval.agent_id)}`}
                />
              )
            })}
          </>
        )}

        {totalPages > 1 && (
          <Pagination
            page={page}
            total={totalPages}
            focused={rowIdx === pagedFiltered.length}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        )}

        <Section label="Actions" />

        <Row
          selected={rowIdx === pagedFiltered.length + paginOffset}
          primary={showAll ? 'Hide Resolved' : 'Show All'}
          hint={showAll ? 'hide resolved approvals' : 'include resolved approvals'}
        />
        <Row
          selected={rowIdx === pagedFiltered.length + paginOffset + 1}
          primary="Back"
          hint="return to previous page"
        />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
