// Step 4/4: Review the full run config and start, edit, or cancel.
// Only the action rows are selectable; the summary above is read-only.

import React, { useState } from 'react'
import { useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../contexts/WizardContext.js'
import { useLanguage } from '../../contexts/LanguageContext.js'
import { agentCountLabel } from '../../../utils/agentLabel.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../../utils/display.js'
import { providerSupportsEffort } from '../../../core/providers.js'
import type { Permissions } from '../../../core/types.js'

type ActionId = 'start' | 'back' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Start Run'.length, 'Back to Edit'.length, 'Reset Wizard'.length)

function permissionDisplay(value: Permissions): string {
  return value === 'skip' ? 'Skip prompts' : 'Ask first'
}

export function NewRunReview() {
  const { push, pop } = useRouter()
  const { state, reset } = useWizard()
  const { t } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, false)
  const compactBody = bodyRows <= 14
  const showCompactSummary = bodyRows > 6

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'start', label: 'Start Run', hint: 'launch the run and its agents' },
    { id: 'back', label: 'Back to Edit', hint: 'return to agents step' },
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
  const showEffort = providerSupportsEffort(state.root.provider)
  const permissionsSummary = showEffort
    ? `${permissionDisplay(state.root.permissions)} · ${state.root.effort}`
    : permissionDisplay(state.root.permissions)

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Review']}
      tagline="Review the run and agents before starting."
      statusKeys="enter select · ↑↓ move · esc back"
    >
      {!compactBody && <StepIndicator step={4} total={4} name="Review" />}

      {compactBody ? (
        <>
          <Section label="Review" />
          {showCompactSummary && (
            <Row selected={false} primary={state.name || '(unset)'} trailing={agentCountLabel(t, state.workers.length + 1)} alwaysShowTrailing disabled />
          )}
          {actions.map((action, idx) => (
            <Row
              key={action.id}
              selected={selectedIdx === idx}
              primary={action.label}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={action.hint}
            />
          ))}
          <SectionEnd />
        </>
      ) : (
        <>
          <Section label="Run" />
          <Row selected={false} primary="Name" trailing={state.name || '(unset)'} />
          <Row selected={false} primary="Working Dir" trailing={state.workingDir || '(none)'} />
          <SectionEnd />

          <Section label="First Agent" />
          <Row selected={false} primary="Provider" badge={{ label: providerDisplayName(state.root.provider), color: providerColor(state.root.provider) }} />
          <Row selected={false} primary="Model" badge={{ label: modelBadgeLabel(state.root.model), color: modelColor(state.root.model, state.root.provider) }} />
          <Row selected={false} primary="Prompt" trailing={promptPreview || '(none)'} />
          <Row selected={false} primary={showEffort ? 'Permissions / Effort' : 'Permissions'} trailing={permissionsSummary} />
          {state.root.extraArgs.trim().length > 0 ? <Row selected={false} primary="Extra Args" trailing={state.root.extraArgs.trim()} /> : null}
          <SectionEnd />

          {state.workers.length > 0 && (
            <>
              <Section label={t('runtime.additionalAgentsCount', { count: state.workers.length })} />
              {state.workers.map((worker, idx) => (
                <Row
                  key={`worker-${idx}`}
                  selected={false}
                  primary={worker.nickname || `agent-${idx + 2}`}
                  badges={[
                    { label: providerDisplayName(worker.provider), color: providerColor(worker.provider) },
                    { label: modelBadgeLabel(worker.model), color: modelColor(worker.model, worker.provider) },
                  ]}
                  trailing={permissionDisplay(worker.permissions)}
                />
              ))}
              <SectionEnd />
            </>
          )}

          <Section label="Planned Tmux Windows" />
          <Row selected={false} primary={t('runtime.agentN', { n: 1 })} trailing={providerDisplayName(state.root.provider)} />
          {state.workers.map((worker, idx) => (
            <Row
              key={`tmux-${idx}`}
              selected={false}
              primary={t('runtime.agentN', { n: idx + 2 })}
              trailing={worker.nickname || providerDisplayName(worker.provider)}
            />
          ))}
          <SectionEnd />
        </>
      )}

      {!compactBody && (
        <>
          <Section label="Actions" />

          {actions.map((action, idx) => (
            <Row
              key={action.id}
              selected={selectedIdx === idx}
              primary={action.label}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={action.hint}
            />
          ))}
          <SectionEnd />
        </>
      )}
    </Frame>
  )
}
