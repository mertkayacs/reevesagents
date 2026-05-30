// Approval confirm page for approving a decision.
// Uses Dialog inside Frame with selectedApprovalId from router context.
// On confirm, calls resolveRunApproval and returns to prior screen.

import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Dialog } from '../../components/Dialog.js'
import { Row } from '../../components/Row.js'
import { useRouter } from '../../router.js'
import { listRunApprovals, resolveRunApproval } from '../../state/runs.js'
import { colors } from '../../utils/tokens.js'

export function ApprovalApprove() {
  const { pop, selectedApprovalId } = useRouter()

  const approval = useMemo(() => {
    if (!selectedApprovalId) return null
    const allApprovals = listRunApprovals()
    return allApprovals.find(a => a.id === selectedApprovalId) ?? null
  }, [selectedApprovalId])

  useInput((_input, key) => {
    if (!approval && (key.return || key.escape || key.backspace)) pop()
  })

  if (!approval) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Approvals', 'Approve']}>
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Approval not found.</Text>
          <Box marginY={1}>
            <Row selected={true} primary="Back" hint="return to approvals" />
          </Box>
        </Box>
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Approvals', approval.action, 'Approve']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={`Approve "${approval.action}"?`}
        body={`Marks approval ${approval.id.slice(0, 8)} as approved. The requesting agent receives the decision on its next check_approval call.`}
        intent="default"
        confirmLabel="Approve"
        cancelLabel="Cancel"
        onConfirm={() => {
          resolveRunApproval(approval.id, 'approved', 'approved from TUI')
          pop()
        }}
        onCancel={() => pop()}
      />
    </Frame>
  )
}
