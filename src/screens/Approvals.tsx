// Approvals page: pending requests an agent raised through the MCP. A human
// approves or denies them here, the same queue the web UI shows.

import React, { useEffect, useState } from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Dialog } from '../components/Dialog.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { useToast } from '../state/ToastContext.js'
import { listRunApprovals, resolveRunApproval, type RunApproval } from '../state/approvals.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'

const ACTIONS = ['Approve', 'Deny', 'Back', 'Main Menu'] as const
const ACTION_COPY: Record<typeof ACTIONS[number], { label: string; hint: string }> = {
  Approve: { label: 'Approve', hint: 'approve the selected request' },
  Deny: { label: 'Deny', hint: 'deny the selected request' },
  Back: { label: 'Back', hint: 'return to the previous screen' },
  'Main Menu': { label: 'Main Menu', hint: 'settings, doctor, reference, credits' },
}
const ACTION_LABEL_WIDTH = Math.max(...ACTIONS.map(action => ACTION_COPY[action].label.length))

function riskBadge(risk: RunApproval['risk']): { label: string; color: string } {
  if (risk === 'high') return { label: 'high', color: colors.status.error }
  if (risk === 'low') return { label: 'low', color: colors.status.ok }
  return { label: 'medium', color: colors.status.warn }
}

export function Approvals() {
  const { pop, resetStack } = useRouter()
  const { toast } = useToast()
  const [approvals, setApprovals] = useState<RunApproval[]>(() => listRunApprovals(undefined, 'pending'))
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(() => approvals[0]?.id ?? null)
  const [pending, setPending] = useState<{ approval: RunApproval; decision: 'approved' | 'denied' } | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setApprovals(listRunApprovals(undefined, 'pending')), 5000)
    return () => clearInterval(timer)
  }, [])

  const itemCount = approvals.length + ACTIONS.length
  const clampedIdx = Math.min(Math.max(0, selectedIdx), Math.max(0, itemCount - 1))
  const onApproval = clampedIdx < approvals.length
  const selectedApproval = onApproval ? approvals[clampedIdx] ?? null : null
  const selectedAction = onApproval ? null : ACTIONS[clampedIdx - approvals.length] ?? null
  // Approve/Deny act on the last-highlighted approval, so the choice persists while
  // the cursor sits on the action rows (mirrors how RunHistory deletes the selected record).
  const actionTarget = approvals.find(item => item.id === selectedApprovalId) ?? approvals[0] ?? null

  useEffect(() => {
    if (selectedApproval) setSelectedApprovalId(selectedApproval.id)
  }, [selectedApproval])

  function refresh(): void {
    const next = listRunApprovals(undefined, 'pending')
    setApprovals(next)
    setSelectedApprovalId(current => (current && next.some(item => item.id === current) ? current : next[0]?.id ?? null))
  }

  function resolve(approval: RunApproval, decision: 'approved' | 'denied'): void {
    resolveRunApproval(approval.id, decision)
    setPending(null)
    refresh()
    toast(`${decision === 'approved' ? 'Approved' : 'Denied'}: ${approval.action}`, 'info')
  }

  function handleActivate(): void {
    if (!selectedAction) return
    switch (selectedAction) {
      case 'Approve':
        if (actionTarget) setPending({ approval: actionTarget, decision: 'approved' })
        break
      case 'Deny':
        if (actionTarget) setPending({ approval: actionTarget, decision: 'denied' })
        break
      case 'Back': pop(); break
      case 'Main Menu': resetStack('Welcome', ['Welcome']); break
    }
  }

  useInput((_input, key) => {
    if (pending) return
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, Math.min(idx, itemCount - 1) - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(itemCount - 1, idx + 1)); return }
    if (key.return) { handleActivate(); return }
    if (key.escape || key.backspace) { pop(); return }
  })

  if (pending) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Approvals']} statusKeys="←→ switch · enter select · esc cancel">
        <Dialog
          title={pending.decision === 'approved' ? 'Approve this request?' : 'Deny this request?'}
          body={pending.approval.summary || pending.approval.action}
          intent={pending.decision === 'denied' ? 'danger' : 'default'}
          confirmLabel={pending.decision === 'approved' ? 'Approve' : 'Deny'}
          cancelLabel="Cancel"
          onConfirm={() => resolve(pending.approval, pending.decision)}
          onCancel={() => setPending(null)}
        />
      </Frame>
    )
  }

  let statusContext = ''
  if (selectedApproval) {
    statusContext = `${selectedApproval.action} · ${selectedApproval.risk} · ${selectedApproval.summary}`
  } else if (selectedAction) {
    statusContext = (selectedAction === 'Approve' || selectedAction === 'Deny') && actionTarget
      ? `${ACTION_COPY[selectedAction].hint} · ${actionTarget.action}`
      : ACTION_COPY[selectedAction].hint
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Approvals']}
      meta={[{ label: 'pending', value: String(approvals.length) }]}
      tagline="Pending approval requests raised by agents. Approve or deny them here."
      statusContext={statusContext}
      statusKeys="enter action · ↑↓ move · esc back"
    >
      <Box flexDirection="column">
        <Section label="Pending" />
        {approvals.length === 0 ? (
          <Row selected={false} primary="No pending approvals" trailing="requests appear here" disabled />
        ) : (
          approvals.map((approval, idx) => (
            <Row
              key={approval.id}
              selected={clampedIdx === idx}
              primary={approval.action}
              glyph={{ char: glyphs.status.warn, color: colors.status.warn }}
              badges={[riskBadge(approval.risk)]}
              hint={approval.summary}
              trailing={approval.agent_id.slice(0, 8)}
            />
          ))
        )}
        <SectionEnd />

        <Section label="Actions" />
        {ACTIONS.map((action, idx) => (
          <Row
            key={action}
            selected={clampedIdx === approvals.length + idx}
            primary={ACTION_COPY[action].label}
            primaryWidth={ACTION_LABEL_WIDTH}
            hint={ACTION_COPY[action].hint}
            disabled={(action === 'Approve' || action === 'Deny') && !actionTarget}
            danger={action === 'Deny'}
          />
        ))}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
