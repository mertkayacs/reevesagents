// Step 3/4: additional terminals list. Empty is valid.
// Selecting a row and pressing Enter opens it for inline editing in step 4b.

import React, { useState } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import { providerColor } from '../../utils/display.js'

type ActionId = 'add' | 'continue' | 'back' | 'cancel'

export function NewRunWorkers() {
  const { push, pop, setSelectedWorkerIdx } = useRouter()
  const { state, addWorker, reset } = useWizard()

  const workers = state.workers
  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'add', label: 'Add Terminal', hint: 'create another independent CLI terminal' },
    { id: 'continue', label: 'Continue', hint: 'to review' },
    { id: 'back', label: 'Back', hint: 'return to first terminal' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = workers.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)

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
      breadcrumb={['ReevesAgents', 'New Run', 'Terminals']}
      tagline="Add zero or more independent CLI terminals. The human coordinates them manually."
      statusKeys="enter select · ↑↓ move · esc back"
    >
      <StepIndicator step={3} total={4} name="Terminals" />

      {workers.length === 0 ? (
        <Row selected={false} primary="No extra terminals yet." trailing="choose Add Terminal below" disabled />
      ) : (
        workers.map((worker, idx) => (
          <Row
            key={`worker-${idx}`}
            selected={selectedIdx === idx}
            primary={worker.nickname || `terminal-${idx + 2}`}
            badge={{ label: worker.provider, color: providerColor(worker.provider) }}
            hint={worker.prompt ? worker.prompt.slice(0, 40) : '(no prompt set)'}
          />
        ))
      )}

      <Section label="Actions" />

      {actions.map((action, idx) => (
        <Row
          key={action.id}
          selected={selectedIdx === workers.length + idx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
