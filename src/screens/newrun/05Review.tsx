// Step 5/5: Review the full run config and start, edit, or cancel.
// Only the action rows are selectable; the summary above is read-only.

import React, { useState } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'

type ActionId = 'start' | 'back' | 'cancel'

export function NewRunReview() {
  const { push, pop } = useRouter()
  const { state, reset } = useWizard()

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'start', label: 'Start Run', hint: 'launch tmux windows for the agents' },
    { id: 'back', label: 'Back to Edit', hint: 'return to workers step' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const [selectedIdx, setSelectedIdx] = useState(0)

  function handleAction(id: ActionId): void {
    if (id === 'start') push('NewRunStarting')
    else if (id === 'back') pop()
    else if (id === 'cancel') { reset(); pop() }
  }

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSelectedIdx(i => Math.min(actions.length - 1, i + 1)); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) { handleAction(actions[selectedIdx]!.id) }
  })

  const promptPreview = state.root.prompt.length > 40
    ? state.root.prompt.slice(0, 40) + '...'
    : state.root.prompt
  const showEffort = state.root.provider === 'cc' || state.root.provider === 'codex'
  const permissionsSummary = showEffort
    ? `${state.root.permissions} · ${state.root.effort}`
    : state.root.permissions

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Review']}
      tagline="Review the planned run, then start."
      statusKeys="enter select · ↑↓ move · esc back"
    >
      <StepIndicator step={5} total={5} name="Review" />

      <Section label="Run" />
      <Row selected={false} primary="Name" trailing={state.name || '(unset)'} />
      <Row selected={false} primary="Working Dir" trailing={state.workingDir} />
      <SectionEnd />

      <Section label="Root" />
      <Row selected={false} primary="Provider" trailing={state.root.provider} />
      <Row selected={false} primary="Model" trailing={state.root.model || '(default)'} />
      <Row selected={false} primary="Prompt" trailing={promptPreview || '(none)'} />
      <Row selected={false} primary={showEffort ? 'Permissions / Effort' : 'Permissions'} trailing={permissionsSummary} />
      <SectionEnd />

      {state.workers.length > 0 && (
        <>
          <Section label={`Workers (${state.workers.length})`} />
          {state.workers.map((worker, idx) => (
            <Row
              key={`worker-${idx}`}
              selected={false}
              primary={worker.nickname || `worker-${idx + 1}`}
              trailing={`${worker.provider} / ${worker.model || '(default)'} / ${worker.permissions}`}
            />
          ))}
          <SectionEnd />
        </>
      )}

      <Section label="Planned Run Windows" />
      <Row selected={false} primary="root" trailing={`root-${state.root.provider}`} />
      {state.workers.map((worker, idx) => (
        <Row
          key={`tmux-${idx}`}
          selected={false}
          primary={`worker ${idx + 1}`}
          trailing={worker.nickname || `${worker.provider}-worker-${idx + 1}`}
        />
      ))}
      <SectionEnd />

      <Section label="Actions" />

      {actions.map((action, idx) => (
        <Row
          key={action.id}
          selected={selectedIdx === idx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
