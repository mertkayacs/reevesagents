// Terminal close: confirm dialog before closing a spawner terminal window.

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
    if (key.escape || key.backspace) {
      pop()
      return
    }
  })

  if (!agent || !run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs']}
        statusContext="Terminal not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Terminal not found.</Text>
          <Box marginTop={1}>
            <Row
              selected={true}
              primary="Back"
              hint="return to terminal detail"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Terminals', agent.nickname, 'Close']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={`Close ${agent.nickname}?`}
        body="Closes this terminal window and marks it ended. Other terminals continue."
        intent="danger"
        confirmLabel="Close"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={pop}
      />
    </Frame>
  )
}
