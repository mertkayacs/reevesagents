// Step 3/4: additional agents list. Empty is valid.
// Selecting a row and pressing Enter opens it for inline editing in step 4b.

import { useState } from 'react'
import { useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../contexts/WizardContext.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../../../utils/display.js'

type ActionId = 'add' | 'continue' | 'back' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Add Agent'.length, 'Continue'.length, 'Back'.length, 'Reset Wizard'.length)

export function NewRunWorkers() {
  const { push, pop, setSelectedWorkerIdx } = useRouter()
  const { state, addWorker, reset } = useWizard()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, false)
  const compactBody = bodyRows <= 10

  const workers = state.workers
  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'add', label: 'Add Agent', hint: 'add another agent to this run' },
    { id: 'continue', label: 'Continue', hint: 'to review' },
    { id: 'back', label: 'Back', hint: 'return to first agent' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = workers.length + actions.length
  const visibleRowCount = Math.max(1, bodyRows - 3)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const firstVisible = Math.min(
    Math.max(0, selectedIdx - visibleRowCount + 1),
    Math.max(0, totalRows - visibleRowCount),
  )
  const visibleRows = Array.from(
    { length: Math.min(visibleRowCount, totalRows - firstVisible) },
    (_, idx) => firstVisible + idx,
  )
  const providerBadgeWidth = Math.max(...workers.map(worker => providerDisplayName(worker.provider).length), 1)
  const modelBadgeWidth = Math.max(...workers.map(worker => modelBadgeLabel(worker.model).length), 'default'.length)
  const agentLabelWidth = Math.max(
    ...workers.map((worker, idx) => (worker.nickname || `agent-${idx + 2}`).length),
    ACTION_LABEL_WIDTH,
  )
  if (selectedIdx >= totalRows && totalRows > 0) {
    setSelectedIdx(totalRows - 1)
  }

  function handleAction(id: ActionId): void {
    if (id === 'add') {
      const newIdx = addWorker()
      setSelectedWorkerIdx(newIdx)
      push('NewRunWorker')
    } else if (id === 'continue') {
      push('NewRunReview')
    } else if (id === 'back') {
      pop()
    } else if (id === 'cancel') {
      reset()
      pop()
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) {
      if (selectedIdx < workers.length) {
        setSelectedWorkerIdx(selectedIdx)
        push('NewRunWorker')
      } else {
        handleAction(actions[selectedIdx - workers.length]!.id)
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Agents']}
      tagline="Add optional extra agents for the same run."
      statusKeys="enter select · ↑↓ move · esc back"
    >
      {!compactBody && <StepIndicator step={3} total={4} name="Agents" />}

      {compactBody ? (
        <>
          <Section label={selectedIdx < workers.length ? 'Additional Agents' : 'Actions'} />
          {workers.length === 0 && firstVisible === 0 && (
            <Row selected={false} primary="No extra agents yet." trailing="choose Add Agent" disabled />
          )}
          {visibleRows.map(idx => {
            if (idx >= workers.length) {
              const action = actions[idx - workers.length]!
              return (
                <Row
                  key={action.id}
                  selected={selectedIdx === idx}
                  primary={action.label}
                  primaryWidth={agentLabelWidth}
                  hint={action.hint}
                />
              )
            }
            const worker = workers[idx]!
            const providerLabel = providerDisplayName(worker.provider)
            return (
              <Row
                key={`worker-${idx}`}
                selected={selectedIdx === idx}
                primary={worker.nickname || `agent-${idx + 2}`}
                primaryWidth={agentLabelWidth}
                badges={[
                  { label: providerLabel, color: providerColor(worker.provider), width: providerBadgeWidth },
                  { label: modelBadgeLabel(worker.model), color: modelColor(worker.model, worker.provider), width: modelBadgeWidth },
                ]}
                hint={worker.prompt ? worker.prompt.slice(0, 40) : '(no prompt set)'}
              />
            )
          })}
          <SectionEnd />
        </>
      ) : (
        <>
          <Section label="Additional Agents" />
          {workers.length === 0 ? (
            <Row selected={false} primary="No extra agents yet." trailing="choose Add Agent below" disabled />
          ) : (
            workers.map((worker, idx) => {
              const providerLabel = providerDisplayName(worker.provider)
              return (
                <Row
                  key={`worker-${idx}`}
                  selected={selectedIdx === idx}
                  primary={worker.nickname || `agent-${idx + 2}`}
                  primaryWidth={agentLabelWidth}
                  badges={[
                    { label: providerLabel, color: providerColor(worker.provider), width: providerBadgeWidth },
                    { label: modelBadgeLabel(worker.model), color: modelColor(worker.model, worker.provider), width: modelBadgeWidth },
                  ]}
                  hint={worker.prompt ? worker.prompt.slice(0, 40) : '(no prompt set)'}
                />
              )
            })
          )}
          <SectionEnd />

          <Section label="Actions" />

          {actions.map((action, idx) => (
            <Row
              key={action.id}
              selected={selectedIdx === workers.length + idx}
              primary={action.label}
              primaryWidth={agentLabelWidth}
              hint={action.hint}
            />
          ))}
          <SectionEnd />
        </>
      )}
    </Frame>
  )
}
