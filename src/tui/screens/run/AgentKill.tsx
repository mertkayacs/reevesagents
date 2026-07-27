// Agent lifecycle confirmation: stop live agents, delete stopped agents.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Dialog } from '../../components/Dialog.js'
import { useRouter } from '../../router.js'
import { colors } from '../../utils/tokens.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import { useLanguage } from '../../contexts/LanguageContext.js'
import { deleteAgent, findAgent, listAgents, readRun } from '../../../core/runs.js'
import { killAgent } from '../../../core/runtime.js'
import type { AgentRecord } from '../../../core/types.js'

export function AgentKill() {
  const { selectedAgentId, pop, resetStack } = useRouter()
  const { language, t } = useLanguage()
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<any | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )

  function handleConfirm(): void {
    if (agent) {
      if (agent.ended_at) {
        deleteAgent(agent.id)
        resetStack('RunAgents')
      } else {
        const wasLastLiveAgent = listAgents(agent.run_id).filter(item => !item.ended_at).length <= 1
        killAgent(agent.id)
        if (wasLastLiveAgent) resetStack('RunHistory')
        else pop()
      }
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
        statusContext="Agent not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>{translatePhrase(language, 'Agent not found.')}</Text>
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

  const isAgentEnded = agent.ended_at !== null
  const isLastLiveAgent = !isAgentEnded && listAgents(agent.run_id).filter(item => !item.ended_at).length <= 1

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname, isAgentEnded ? 'Delete' : 'Stop']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={t(isAgentEnded ? 'agentKill.deleteTitle' : 'agentKill.stopTitle', { name: agent.nickname })}
        body={t(isAgentEnded ? 'agentKill.deleteBody' : isLastLiveAgent ? 'agentKill.stopLastBody' : 'agentKill.stopBody')}
        intent="danger"
        confirmLabel={translatePhrase(language, isAgentEnded ? 'Delete Agent' : 'Stop Agent')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirm}
        onCancel={pop}
      />
    </Frame>
  )
}
