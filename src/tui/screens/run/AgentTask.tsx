// Agent prompt/status: read-only view of the saved initial prompt and status.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { useRouter } from '../../router.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import { useLanguage } from '../../contexts/LanguageContext.js'
import { colors } from '../../../utils/tokens.js'
import { findAgent, readRun } from '../../../core/runs.js'
import type { AgentRecord } from '../../../core/types.js'

export function AgentTask() {
  const { selectedAgentId, pop } = useRouter()
  const { language } = useLanguage()
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<{ name: string } | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )

  useInput((_input, key) => {
    if (key.return || key.escape || key.backspace) {
      pop()
    }
  })

  if (!agent || !run) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Runs']} statusContext="Agent not found">
        <Box flexDirection="column">
          <Text color={colors.text.dim}>{translatePhrase(language, 'Agent not found.')}</Text>
          <Box marginTop={1}>
            <Row selected={true} primary="Back" hint="return to agent detail" />
          </Box>
        </Box>
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname, 'Prompt']}
      meta={[{ label: 'status', value: agent.task_status }]}
      tagline="Read-only view of this agent's initial prompt and current status."
      statusKeys="enter/esc back"
    >
      <Box flexDirection="column">
        <Section label="Prompt" />
        <Row selected={false} primary="Prompt" trailing={agent.task || '(no prompt)'} />
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

        <Section label="Actions" />
        <Row selected={true} primary="Back" hint="return to agent detail" />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
