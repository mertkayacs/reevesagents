// Shared approval detail page. Displays full info and action buttons (Approve/Deny when pending).

import React, { useEffect, useMemo, useState } from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Row } from '../components/Row.js'
import { useRouter } from '../router.js'
import { findAgent, listRunApprovals, readRun } from '../state/runs.js'

export function Approval() {
  const { selectedApprovalId, push, pop } = useRouter()

  const approval = useMemo(() => {
    if (!selectedApprovalId) return null
    const all = listRunApprovals()
    return all.find(a => a.id === selectedApprovalId) ?? null
  }, [selectedApprovalId])
  const agent = useMemo(() => {
    if (!approval) return null
    try { return findAgent(approval.agent_id) } catch { return null }
  }, [approval])
  const run = useMemo(() => {
    if (!approval) return null
    try { return readRun(approval.run_id) } catch { return null }
  }, [approval])

  const isPending = approval?.status === 'pending'
  const dataRowCount = approval ? 6 + (approval.resolved_at ? 1 : 0) : 0
  const totalRows = approval ? dataRowCount + (isPending ? 3 : 1) : 1
  const firstActionIdx = approval ? dataRowCount : 0
  const [rowIdx, setRowIdx] = useState(firstActionIdx)

  useEffect(() => { setRowIdx(firstActionIdx) }, [firstActionIdx])

  useInput((_input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow) { setRowIdx(idx => Math.max(firstActionIdx, idx - 1)); return }
    if (key.downArrow) { setRowIdx(idx => Math.min(totalRows - 1, idx + 1)); return }
    if (key.return) {
      if (!approval) { pop(); return }
      if (isPending && rowIdx === dataRowCount) { push('ApprovalApprove'); return }
      if (isPending && rowIdx === dataRowCount + 1) { push('ApprovalDeny'); return }
      if (rowIdx === totalRows - 1) { pop(); return }
    }
  })

  if (!approval) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Approvals', 'Approval']}
        tagline="Approval not found."
      >
        <Row selected={false} primary="Approval not found." disabled />
        <Section label="Actions" />
        <Row selected={rowIdx === 0} primary="Back" hint="return to approvals" />
        <SectionEnd />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Approvals', approval.action]}
      meta={[
        { label: 'risk', value: approval.risk },
        { label: 'status', value: approval.status },
      ]}
      tagline={`Approval requested by ${agent?.nickname ?? approval.agent_id.slice(0, 8)} in ${run?.name ?? approval.run_id.slice(0, 8)}.`}
    >
      <Box flexDirection="column">
        {/* Data rows */}
        <Row
          selected={rowIdx === 0}
          primary="Action"
          trailing={approval.action}
        />
        <Row
          selected={rowIdx === 1}
          primary="Summary"
          trailing={approval.summary}
        />
        <Row
          selected={rowIdx === 2}
          primary="Details"
          trailing={JSON.stringify(approval.details)}
        />
        <Row
          selected={rowIdx === 3}
          primary="Risk"
          trailing={approval.risk}
        />
        <Row
          selected={rowIdx === 4}
          primary="Status"
          trailing={approval.status}
        />
        <Row
          selected={rowIdx === 5}
          primary="Requested"
          trailing={approval.requested_at}
        />

        {approval.resolved_at && (
          <Row
            selected={rowIdx === 6}
            primary="Resolved"
            trailing={approval.resolved_at}
          />
        )}

        <Section label="Actions" />

        {isPending && (
          <>
            <Row
              selected={rowIdx === dataRowCount}
              primary="Approve"
              hint="allow this request"
            />
            <Row
              selected={rowIdx === dataRowCount + 1}
              primary="Deny"
              hint="reject this request"
              danger
            />
          </>
        )}

        <Row
          selected={rowIdx === totalRows - 1}
          primary="Back"
          hint="return to approvals"
        />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
