// Agent close: confirm dialog to close a worker window. Root agent cannot be closed alone.
// Shows error message for root; shows Dialog for workers.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../../components/Frame.js'
import { Row } from '../../../components/Row.js'
import { Dialog } from '../../../components/Dialog.js'
import { useRouter } from '../../../router.js'
import { colors } from '../../../utils/tokens.js'
import { findAgent, readRun } from '../../../state/runs.js'
import { killAgent } from '../../../launcher/runtime.js'
import type { AgentRecord } from '../../../state/types.js'

export function AgentKill() {
  const { selectedAgentId, pop } = useRouter()
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<any | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )

  function handleBackClicked(): void {
    pop()
  }

  function handleConfirm(): void {
    if (agent) {
      killAgent(agent.id)
      pop()
    }
  }

  useInput((_input, key) => {
    if (key.return && (!agent || !run)) {
      pop()
      return
    }
    if (key.return && agent && agent.role === 'root') {
      handleBackClicked()
      return
    }
    if (key.escape || key.backspace) {
      pop()
      return
    }
  })

  if (!agent || !run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs']}
        statusContext="Agent not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Agent not found.</Text>
          <Box marginTop={1}>
            <Row
              selected={true}
              primary="Back"
              hint="return to agent detail"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  if (agent.role === 'root') {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname, 'Close']}
        statusKeys="enter back · esc cancel"
      >
        <Box flexDirection="column">
          <Text color={colors.status.warn}>Cannot close root agent alone. Use Return & Stop Run instead.</Text>
          <Box marginTop={2}>
            <Row
              selected={true}
              primary="Back"
              hint="return to agent detail"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname, 'Close']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={`Close ${agent.nickname}?`}
        body="Closes this worker's tmux window and marks the agent ended. The root and other workers continue."
        intent="danger"
        confirmLabel="Close"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={pop}
      />
    </Frame>
  )
}
