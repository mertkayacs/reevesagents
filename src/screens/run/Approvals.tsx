// Run-scoped approvals list. Same structure as global but filtered to one run.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { Row } from '../../components/Row.js'
import { Legend } from '../../components/Legend.js'
import { Pagination } from '../../components/Pagination.js'
import { useRouter } from '../../router.js'
import { colors } from '../../utils/tokens.js'
import { glyphs } from '../../utils/glyphs.js'
import { findAgent, listRunApprovals, readRun } from '../../state/runs.js'

const CHROME_ROWS = 13

function agentLabel(agentId: string): string {
  try { return findAgent(agentId).nickname } catch { return agentId.slice(0, 8) }
}

export function RunApprovals() {
  const { selectedRunId, push, pop, setSelectedApprovalId } = useRouter()
  const { rows: termRows } = useWindowSize()
  const pageSize = Math.max(2, termRows - CHROME_ROWS)
  const run = selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  const [rowIdx, setRowIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    if (!selectedRunId) return []
    return listRunApprovals(selectedRunId, showAll ? undefined : 'pending')
  }, [selectedRunId, showAll])

  const pendingCount = useMemo(() => {
    if (!selectedRunId) return 0
    return listRunApprovals(selectedRunId, 'pending').length
  }, [selectedRunId])

  const highRiskCount = useMemo(() => {
    if (!selectedRunId) return 0
    return listRunApprovals(selectedRunId, 'pending').filter(a => a.risk === 'high').length
  }, [selectedRunId])

  useEffect(() => { setPage(1); setRowIdx(0) }, [filtered.length])
  useEffect(() => { setRowIdx(0) }, [page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const activePage = Math.min(page, totalPages)
  const pagedFiltered = filtered.slice((activePage - 1) * pageSize, activePage * pageSize)
  const paginOffset = totalPages > 1 ? 1 : 0
  const totalRows = pagedFiltered.length + paginOffset + 2  // + Show All + Back

  useEffect(() => { setPage(p => Math.min(p, totalPages)) }, [totalPages])

  useInput((_input, key) => {
    if (key.escape || key.backspace) {
      pop()
      return
    }
    if (key.upArrow) {
      setRowIdx(idx => {
        if (idx > 0) return idx - 1
        return totalRows - 1
      })
      return
    }
    if (key.downArrow) {
      setRowIdx(idx => {
        if (idx < totalRows - 1) return idx + 1
        return 0
      })
      return
    }
    if (key.return) {
      const dataRowCount = pagedFiltered.length
      if (rowIdx < dataRowCount) {
        // Clicked on an approval row
        const approval = pagedFiltered[rowIdx]
        if (approval) {
          setSelectedApprovalId(approval.id)
          push('Approval')
        }
        return
      }
      if (rowIdx === dataRowCount && totalPages > 1) return
      const actionIdx = rowIdx - dataRowCount - paginOffset
      if (actionIdx === 0) {
        // Show All / Hide Resolved
        setShowAll(!showAll)
        return
      }
      if (actionIdx === 1) {
        // Back
        pop()
        return
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', run?.name ?? 'Run', 'Approvals']}
      meta={[
        { label: 'pending', value: String(pendingCount) },
        { label: 'high risk', value: String(highRiskCount) },
      ]}
      tagline={`Approvals for ${run?.name ?? 'this run'}. Pending shown by default.`}
      statusContext={rowIdx === pagedFiltered.length && totalPages > 1
        ? `page ${activePage} of ${totalPages} · ← → turn page`
        : pagedFiltered[rowIdx] ? agentLabel(pagedFiltered[rowIdx]!.agent_id) : undefined}
    >
      <Box flexDirection="column">
        {filtered.length === 0 ? (
          <Row
            selected={false}
            primary={showAll ? 'No approvals' : 'No pending approvals'}
            trailing="nothing to review in this run"
            disabled
          />
        ) : (
          <>
            <Legend items={[
              { glyph: glyphs.status.ok, label: 'low', color: colors.status.ok },
              { glyph: glyphs.status.warn, label: 'medium', color: colors.status.warn },
              { glyph: glyphs.status.fail, label: 'high', color: colors.status.error },
            ]} />
            {pagedFiltered.map((approval, idx) => {
              const riskColor = approval.risk === 'high' ? colors.status.error : approval.risk === 'medium' ? colors.status.warn : colors.status.ok
              const statusColor = approval.status === 'pending' ? colors.accent.bright : approval.status === 'approved' ? colors.status.ok : approval.status === 'denied' ? colors.status.error : colors.text.muted

              return (
                <Row
                  key={approval.id}
                  selected={rowIdx === idx}
                  primary={approval.action}
                  glyph={{ char: glyphs.bullet, color: riskColor }}
                  badge={{ label: approval.status, color: statusColor }}
                  hint={agentLabel(approval.agent_id)}
                />
              )
            })}
          </>
        )}

        {totalPages > 1 && (
          <Pagination
            page={activePage}
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
          hint="return to run hub"
        />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
