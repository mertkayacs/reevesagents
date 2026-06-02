// Stop run confirmation dialog.
// User confirms to stop this run's tmux session and mark all agents ended.

import React from 'react'
import { Dialog } from '../../components/Dialog.js'
import { Frame } from '../../components/Frame.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../state/ToastContext.js'
import { archiveAndRemoveRun, readRun } from '../../state/runs.js'
import { openReeves, stopRun } from '../../launcher/runtime.js'

export function RunStop() {
  const { selectedRunId, pop, resetStack } = useRouter()
  const { toast } = useToast()

  const run = selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null

  if (!run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs', 'Stop']}
        statusKeys="←→ switch · enter select · esc cancel"
      >
        <Dialog
          title="No run selected"
          body="Cannot stop a run because no run is selected."
          intent="default"
          confirmLabel="Back"
          cancelLabel="Cancel"
          onConfirm={() => pop()}
          onCancel={() => pop()}
        />
      </Frame>
    )
  }

  function handleConfirm(): void {
    if (!run) return
    try {
      if (run.status === 'ended' || run.ended_at !== null) {
        archiveAndRemoveRun(run.id, 'ended')
        toast(`Deleted ${run.name} from active runs. History kept.`, 'info')
        resetStack('RunHistory')
        return
      }
      try { openReeves(selectedRunId!) } catch { /* no attached tmux client */ }
      stopRun(selectedRunId!)
      resetStack('Run')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const isRunEnded = run.status === 'ended' || run.ended_at !== null

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isRunEnded ? 'Delete' : 'Stop']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={isRunEnded ? `Delete stopped run "${run.name}"?` : `Return and stop "${run.name}"?`}
        body={isRunEnded
          ? 'Removes this stopped run from the active list and keeps a simple shared history record.'
          : "Switches back to Reeves, stops this run's tmux session and agent windows, then marks every agent ended. Local JSON state is preserved."}
        intent="danger"
        confirmLabel={isRunEnded ? 'Delete Run' : 'Return & Stop'}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => pop()}
      />
    </Frame>
  )
}
