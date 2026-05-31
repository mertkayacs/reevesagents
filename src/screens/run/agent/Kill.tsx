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
    if (key.return && agent && run?.mode !== 'spawner') {
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

  const isSpawner = run.mode === 'spawner'

  if (!isSpawner) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs', run.name, 'Entries', agent.nickname, 'Close']}
        statusKeys="enter back · esc cancel"
      >
        <Box flexDirection="column">
          <Text color={colors.status.warn}>This run type is not managed by the spawner package.</Text>
          <Box marginTop={2}>
            <Row
              selected={true}
              primary="Back"
              hint="return to entry detail"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isSpawner ? 'Terminals' : 'Entries', agent.nickname, 'Close']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={`Close ${agent.nickname}?`}
        body={isSpawner
          ? 'Closes this terminal window and marks it ended. Other terminals continue.'
          : 'This run type is not managed by the spawner package.'}
        intent="danger"
        confirmLabel="Close"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={pop}
      />
    </Frame>
  )
}
