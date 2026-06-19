// Transient screen: synchronously launches the run via startRun, then either
// navigates to the Run hub or shows a recoverable error with Retry / Back.
// startRun is synchronous, so intermediate status messages would not be visible
// due to React batching; a single status line is shown until the call returns.

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Spinner } from '../../components/Spinner.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import { startRun } from '../../launcher/runtime.js'
import type { StartRunRequest } from '../../launcher/runtime.js'

type ActionId = 'retry' | 'back'
const ACTION_LABEL_WIDTH = Math.max('Retry'.length, 'Back to Review'.length)

export function NewRunStarting() {
  const { pop, resetStack, setSelectedRunId } = useRouter()
  const { state, reset } = useWizard()
  const [error, setError] = useState<string | null>(null)
  const [actionIdx, setActionIdx] = useState(0)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const req: StartRunRequest = {
      name: state.name,
      working_dir: state.workingDir,
      root: {
        provider: state.root.provider,
        model: state.root.model,
        auth_mode: state.root.authMode,
        effort: state.root.effort,
        task: state.root.prompt,
        permissions: state.root.permissions,
      },
      workers: state.workers.map(w => ({
        nickname: w.nickname,
        provider: w.provider,
        model: w.model,
        auth_mode: w.authMode,
        effort: w.effort,
        task: w.prompt,
        working_dir: w.workingDir,
        permissions: w.permissions,
      })),
      preset_name: state.presetName,
    }

    try {
      const result = startRun(req)
      const runId = result.run.id
      const timer = setTimeout(() => {
        setSelectedRunId(runId)
        reset()
        resetStack('Run')
      }, 200)
      return () => clearTimeout(timer)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [retryCount, state, resetStack, setSelectedRunId, reset])

  const errorActions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'retry', label: 'Retry', hint: 'launch again with the same config' },
    { id: 'back', label: 'Back to Review', hint: 'edit and try again' },
  ]

  useInput((_input, key) => {
    if (!error) {
      if (key.escape || key.backspace) pop()
      return
    }
    if (key.upArrow) { setActionIdx(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setActionIdx(i => Math.min(errorActions.length - 1, i + 1)); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) {
      const action = errorActions[actionIdx]!
      if (action.id === 'retry') {
        setError(null)
        setRetryCount(c => c + 1)
      } else if (action.id === 'back') {
        pop()
      }
    }
  })

  if (error) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'New Run', 'Starting']}
        tagline="Run failed to start."
        statusKeys="enter select · ↑↓ move · esc back"
      >
        <Box flexDirection="column" marginY={1}>
          <Text>Error: {error}</Text>
        </Box>

        <Section label="Actions" />

        {errorActions.map((action, idx) => (
          <Row
            key={action.id}
            selected={actionIdx === idx}
            primary={action.label}
            primaryWidth={ACTION_LABEL_WIDTH}
            hint={action.hint}
          />
        ))}
        <SectionEnd />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Starting']}
      tagline="Creating the run and launching its agents."
    >
      <Box flexDirection="row" marginY={1}>
        <Spinner />
        <Text> Launching {state.name}...</Text>
      </Box>
    </Frame>
  )
}
