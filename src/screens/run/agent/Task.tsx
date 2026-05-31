// Terminal prompt/status: read-only view of the saved initial prompt and status.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../../components/Frame.js'
import { Row } from '../../../components/Row.js'
import { Section, SectionEnd } from '../../../components/Section.js'
import { useRouter } from '../../../router.js'
import { colors } from '../../../utils/tokens.js'
import { findAgent, readRun } from '../../../state/runs.js'
import type { AgentRecord } from '../../../state/types.js'

export function AgentTask() {
  const { selectedAgentId, pop } = useRouter()
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<{ name: string; mode?: string } | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )

  useInput((_input, key) => {
    if (key.return || key.escape || key.backspace) {
      pop()
    }
  })

  if (!agent || !run) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Runs']} statusContext="Terminal not found">
        <Box flexDirection="column">
          <Text color={colors.text.dim}>Terminal not found.</Text>
          <Box marginTop={1}>
            <Row selected={true} primary="Back" hint="return to terminal detail" />
          </Box>
        </Box>
      </Frame>
    )
  }

  const isSpawner = run.mode === 'spawner'

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isSpawner ? 'Terminals' : 'Entries', agent.nickname, isSpawner ? 'Prompt' : 'Task']}
      meta={[{ label: 'status', value: agent.task_status }]}
      tagline={isSpawner
        ? 'Read-only. This terminal received only the initial prompt shown here.'
        : 'Read-only. This run type is not managed by the spawner package.'}
      statusKeys="enter back · esc back"
    >
      <Box flexDirection="column">
        <Section label={isSpawner ? 'Prompt' : 'Task'} />
        <Row selected={false} primary="Prompt" trailing={agent.task || '(no task)'} />
        <Row selected={false} primary="Status" trailing={agent.task_status} />
        <Row selected={false} primary="Note" trailing={agent.task_note || '(no note)'} />
        <Row
          selected={false}
          primary="Last seen"
          trailing={agent.last_seen
            ? `${Math.round((Date.now() - agent.last_seen) / 1000)}s ago`
            : 'never'}
        />
        <SectionEnd />

        <Box marginTop={2}>
          <Section label="Actions" />
        </Box>

        <Box marginTop={1}>
          <Row selected={true} primary="Back" hint="press enter or esc" />
        </Box>
        <SectionEnd />
      </Box>
    </Frame>
  )
}
