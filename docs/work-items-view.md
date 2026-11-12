# Work items as a derived view: one writer, no mirror

Status: **accepted** — revision 9, approved by lead_2 / Codex in review round 9 ("the finding is closed in
substance … no new blocking findings on the diff 6511ca8..d7d95e8"). Nine rounds total: Rounds 1–2 rejected the mirror
design; round 3 accepted the read-only model; rounds 4–7 kept sharpening the rules, each time confirming the
previous fixes ("the risk class of a second writer, migration and dispatch interference is not reintroduced",
"the unified phase order removes the reviewing/in_work ambiguity", "both round-6 findings closed in substance").
Round 7 left two wording-level findings about the end of `dispatching` and the empty-state text; this revision
answers them. Branch `feat/work-items` (worktree `~/projects/reevesagents-work-items`, base `dev/local`
`8d7f861`, v2.2.0).

## Problem

The engine has two ways to put work on a flow, and only one of them is visible as *work*:

1. a plan document mirrored into `~/.reeves/flows/<run-id>/plan.json` (`flow plan import`), whose items carry a
   `PlanStatus`, per-item rounds, brief snapshots and the commit that closed them;
2. the flat spec queue (`flow start --spec`, `flow add-spec`): `state.specs` + `state.dispatched_specs`
   (`src/core/flow.ts:248`), which records *that* a brief was queued or may sit in the dev's pane and nothing
   else.

Everything the panel says about "what is being worked on" hangs on channel 1: the run-card plan icon
(`planIconVisible: Boolean(flow.plan)`, `src/surfaces/webui/client/app.js:1316`), the `N/M` badge
(`flowBadgeView` → `plan_progress`, otherwise a bare `spec_queue_progress` count, `src/core/flow-label.ts`), the
Plan tab (`GET /api/plan` → `{plan: null}`, `src/surfaces/webui/server.ts:640`) and the progress bar
(`planProgressOf` → `null`, `src/core/flow-view.ts:355`).

So a spec-only flow — the normal case when an orchestrator hands over two blocks — can report how many briefs
wait, never *which* task is in work, who holds it, or which commit closed it.

## How the design got here

Revision 1 mirrored every queued spec into `plan.json`; round 2 showed that two writers of one truth reproduce
the same defect class (binding restoration, locks, reconciliation). Revision 3 removed the second writer: one
record (`state.specs` / `state.claim` / the journal), no migration, no locking, one read-only projection feeding
every surface — accepted in round 3. Revisions 4–7 only sharpen the derivation.

| round-6 finding | answer in this revision |
| --- | --- |
| HIGH `:121` `flowDispatchNote` does not cover `pending`: it reads only the journal, skips `dispatch_claimed` and returns a note only for `dispatch_unconfirmed`/`dispatch_retry_enter` (`flow-view.ts:104`), so a first send with `pending A` yields `null` while acceptance demands `dispatching` | §2.3: the predicate is a **disjunction** — `pending.spec_id === row.id` (the first send, and `pending` carries `spec_id`, `flow.ts:136`) **or** an unsettled dispatch note **bound to this row** |
| MEDIUM `:122` the helper returns whole-flow `{state, reason, at}` without `spec_id`, so "for this row" was not established; for an off-plan unconfirmed dispatch `pending` may already be cleared, `claim.spec_id` stays `null`, and the last confirmed `dispatch_spec` belongs to the previous task | §2.3: the binding rule — recover the id from the journal (nearest preceding `dispatch_claimed`/`dispatch_spec` detail, or the row whose interval contains the `request_review` head), and when it cannot be recovered, degrade explicitly: no row is `dispatching`, `WorkView.dispatch_unknown` is set, and the flow-level `dispatch_unconfirmed` stays the operator's signal |

| round-7 finding | answer in this revision |
| --- | --- |
| MEDIUM `:135` "`dispatching` ends only on a settled event" is false for the pending branch: a dispatch can be refused before the paste, `releaseDispatch` clears `pending` and journals `dispatch_refused` (`flow.ts:2671`), so no settled event ever arrives | §2.3: two named endings — **settled** (decision event → next phase) and **refused** (`dispatch_refused` → back to `queued`, note dropped). Clearing `pending` alone decides nothing; the journal entry does |
| MEDIUM `:180` with `dispatch_unknown` and `current = null` the card claims "nothing in work", although only the absence of a binding is established — the retained `dispatch_unconfirmed` signal next to it does not resolve the contradiction | §3: three separate empty states — `nothing in work` (no current, no uncertainty), `dispatch not confirmed — task unknown` (uncertainty), `paused`/`escalated` (gate). Acceptance asserts the wording for each |

| round-8 finding | answer in this revision |
| --- | --- |
| MEDIUM `:147` "back to `queued` and drop the note" is only valid for a refused **first** handover; a refused review/fix dispatch does not cancel a handover that already happened, and a refused later attempt does not clear an earlier unconfirmed signal (`flowDispatchNote` deliberately skips `dispatch_refused`) | §2.3: the refusal rule is scoped **per attempt** with an explicit three-row table (first handover → `queued`; review/fix refusal → task phase untouched; later retry → stays `dispatching` with `attempt refused; handover still unconfirmed`). A warning is never dropped unconditionally |

## 1. The model: one pure derivation

New module `src/core/work-items.ts`:

```ts
export type WorkItemStatus =
  | 'queued' | 'dispatching' | 'in_work' | 'reviewing' | 'handed_over'        // spec rows
  | 'pending' | 'needs_brief' | 'queued' | 'in_work' | 'reviewing' | 'done' | 'blocked_owner' | 'skipped' // plan rows

export interface WorkItemHolder {
  role: 'dev' | 'reviewer'
  agent_id: string          // state.roles.dev / state.roles.review (flow.ts:220) — the real agent, not just a role
}

export interface WorkItem {
  id: string
  title: string
  origin: 'plan' | 'spec'   // a view field: where the row came from; never written into plan.json
  status: WorkItemStatus    // effective status for the panel
  plan_status: WorkItemStatus | null   // plan rows only: what plan.json says, untouched by the gate
  holder: WorkItemHolder | null
  head: string | null       // the commit this row's current round is about, when known
  note: string | null       // why the status is what it is, e.g. 'flow paused: ownership unknown'
}

export interface WorkView {
  total: number
  items: WorkItem[]
  current: WorkItem | null     // recomputed after phases; only a dispatching/in_work/reviewing row, or null
  dispatch_unknown: boolean    // an unsettled dispatch exists but cannot be attributed to any row
}

export function workItems(
  state: FlowState,
  options?: { plan?: Plan | null, notes?: NotesIndex, at?: number },
): WorkView
```

Pure by construction: the flow state, the plan (when one exists) and an index of the notes directory in, rows
out. No writes, no locking, no dispatch decision — unit-testable from fixtures, and a read can be proven not to
change a byte on disk.

## 2. Derivation rules

### 2.0 Ownership gate

A flow owns work only in `idle`, `reviewing` and `fixing`. In `paused`, `escalated`, `orphaned` and `done` the
projection reports no owner anywhere: `holder` is `null` for every row, `current` is `null`, and each row that
would otherwise be active keeps its status with a note naming the state (`flow paused: ownership unknown`).

### 2.1 The phase order (one pass, first match wins)

1. **done** — completion evidence for this row's dispatch interval (§2.2).
2. **dispatching** — an unsettled dispatch attributed to this row (§2.3).
3. **reviewing** — `state.state === 'reviewing'` and this row is the review's subject (the claim, or the id whose
   dispatch the current `request_review` head follows). Notes are **not** part of this test: a review with no
   answer yet is still a review.
4. **in_work** — `state.state` is `idle` or `fixing` **and** this row is the settled current handover. A claim that
   survives into `reviewing` therefore cannot produce `in_work`.
5. **handed_over** — dispatched at some point, none of the above.
6. **queued** — still in `state.specs`, never dispatched.

### 2.2 `done`: a chain of rounds inside one dispatch interval

Walk the journal for `dispatch_spec` entries whose detail names the id (the live shape is
`spec_dispatched <ID>`). A dispatch's **interval** runs from its timestamp to the next `dispatch_spec`,
`flow_done`, or now — a `dispatch_fix` stays *inside* the interval, because a fix belongs to the same item.

Inside the interval, `request_review <head>` and `dispatch_fix <head>` alternate as the item's rounds. The item
is `done` when the **last** round of the chain holds a valid `ACCEPT`: `readNewestNotes(runId, head)`
(`flow-notes.ts:283`) validated by `validateNotesText` (`flow-notes.ts:190`) — verdict accepted at the start or
the end of the file, newest `r*.md` wins.

One more source counts as that evidence, and it is the reason the live check on a finished flow works: the journal
entry that **ended** the interval (`dispatch_spec <next id>` or `flow_done`) carries `notes_ref` when the engine
consumed an answer in it, so an `ACCEPT` recorded there is completion evidence even after the notes directory has
been pruned (`NOTES_KEEP_HEADS`). The projection therefore accepts `notes.answer(head) === 'ACCEPT' || consumedAccept(entry, head)`;
the invariant it rests on — `notes_ref` on `dispatch_spec`/`flow_done` appears only for an accepted answer — is a
property of the engine's own write path (`flow.ts`), not something this view infers. A `CHANGES_REQUESTED` in the middle of the chain is normal progress,
not ambiguity. No `request_review` in the interval means the dev is still working; an interval the rotated
journal can no longer reconstruct is `handed_over`.

### 2.3 `dispatching`: the paste is not the handover

`state.pending` (`FlowPendingDispatch`, `flow.ts:136`) and, after it, `applyUnconfirmedDispatch` (`flow.ts:2623`)
both carry intent without proof: an Enter that was never confirmed still applies a claim. `flowDispatchNote`
(`flow-view.ts:104`) is the engine's flow-level answer, but it reads only the journal, ignores `dispatch_claimed`
and reports only `dispatch_unconfirmed` / `dispatch_retry_enter` — so it is a **signal**, not the row predicate.

A row is `dispatching` when either holds:

- **A — the send is in flight:** `state.pending !== null && state.pending.spec_id === row.id`. `pending` carries
  `spec_id` (`flow.ts:136`), so the first dispatch needs no journal entry and no helper: the row is shown as
  "dispatching" from the moment the engine claims the paste.
- **B — an unsettled dispatch is attributed to it:** `flowDispatchNote(state) !== null` **and** the id recovered
  from the journal is this row's. Recovery: take the newest `dispatch_unconfirmed` / `dispatch_retry_enter` entry
  and read the nearest preceding `dispatch_claimed` or `dispatch_spec` entry — its detail names the spec
  (`spec_dispatched <ID>`) — or, when that entry is `request_review <head>`, use the row whose interval (§2.2)
  contains that head. This is the same journal walk `done` uses, applied to the unsettled case.

Either way the row gets `holder: null` and the note `dispatch in flight, not confirmed`; it is not in work and no
agent is named.

`dispatching` ends in exactly two ways:

- **settled** — a decision event: `request_review`, `dispatch_fix`, `dispatch_spec`, `dispatch_stall_retry`,
  `plan_item_dispatched`. The row moves on to the next phase in the order of §2.1.
- **refused** — a dispatch that never reached the pane: `releaseDispatch` clears `pending` and journals
  `dispatch_refused` (`flow.ts:2671`), and no settled event will ever arrive for it.

A refusal is scoped to the **attempt**, not to the row. Which refusal it is decides what happens:

| refused attempt | result for the row |
| --- | --- |
| the row's **first handover** (spec dispatch to the dev, no settled dispatch for this row yet) | back to `queued` — it was never handed over — and the note is dropped |
| a **review request** or a **fix dispatch** (the task handover already happened) | phase from the surviving evidence (§2.1); the refusal of that attempt changes nothing about the task itself |
| a **later retry** after an earlier unconfirmed attempt | the earlier signal is **not** cleared — `flowDispatchNote` deliberately skips `dispatch_refused` — so the row stays `dispatching` with the note `attempt refused; handover still unconfirmed` |

Clearing `pending` on its own therefore proves nothing: the journal entry decides between *refused* (scope per
the table) and *unconfirmed* (stay `dispatching` until a settled event or an explicit retry). A warning is never
dropped unconditionally.

**Unattributable is reported, not guessed.** If an unsettled dispatch exists and the journal does not yield an id
(rotated log, a claim with no preceding dispatch entry), no row becomes `dispatching`; `WorkView.dispatch_unknown`
is set and the surface keeps the flow-level `dispatch_unconfirmed` signal (the same one the badge already shows).
The projection never parks the uncertainty on whichever row looks convenient.

### 2.4 Current work is recomputed last, and never guessed

`current` is chosen **after** every row's status is known, from rows whose status is `dispatching`, `in_work` or
`reviewing`. Two hard rules:

- a row that resolved to `done` never becomes `current`, and neither does a `queued` one: once the active row
  closes, **`current` is `null`** until a confirmed candidate appears. The card says "nothing in work" rather
  than presenting future work as current;
- if two non-null source candidates (`pending.spec_id`, `claim.spec_id`, the last `dispatch_spec` id) name
  different ids, no row is active: every candidate becomes `handed_over` with the note `ambiguous current work`.

The badge and the Plan tab both read `current`, so they can never disagree with the row list.

### 2.5 Plan rows keep their stored status, and are gated too

A plan row's `plan_status` is what `plan.json` says and is never rewritten by the projection. Its effective
`status` equals `plan_status` while the flow owns work (§2.0); when the gate trips, the status stays but
`holder` becomes `null`, `note` names the state, and the surface renders `reviewing (paused)`. An off-plan spec
in a flow that also has a plan is appended as a derived `origin: 'spec'` row; neither kind is written into the
other's file.

### 2.6 Degradation has a priority order

1. A live binding that the engine itself still trusts (`pending`, a settled claim, an attributed dispatch note)
   wins over lost history: a rotated `dispatch_spec` entry does not demote a row the state still points at.
2. No `request_review` in the interval is the ordinary "the dev is working" case, not degradation.
3. A `request_review` with no notes yet is `reviewing` with the note `awaiting the reviewer's answer` — not
   `handed_over`.
4. An unsettled dispatch with no recoverable id is `dispatch_unknown` at the view level (§2.3), not a status on a
   row.
5. `handed_over` is the last resort: no live binding and no completion evidence. The view never invents a
   completion and never promotes an old dispatch to `in_work`.

## 3. Surfaces read the same projection

- **Run-card icon**: shown when a plan exists **or** `work.total > 0`.
- **Badge**: the active segment always comes from `work.current` — `dispatching: <id>`, `in work: <id>`,
  `review: <id>`. Three distinct empty states, never one blur:
  `nothing in work` only when `current` is `null` **and** `work.dispatch_unknown` is false;
  `dispatch not confirmed — task unknown` when `dispatch_unknown` is set (absence of a reliable binding is not
  the same fact as an idle flow);
  `paused` / `escalated` when the ownership gate (§2.0) removed the owner. `detail` names the holder's role and agent id when there is one. The plan's progress stays available as
  a **separate** segment (`plan 3/7`). New strings are translation keys with parity in every locale catalog.
- **Plan tab**: `GET /api/plan` returns `{ plan: <plan|null>, work: WorkView }`; the tab renders plan rows and
  spec rows in one list, labels the latter "from the spec queue", marks `current`, shows `plan_status` beside a
  gated effective status when they differ, and carries a caption that spec rows are derived rather than a plan
  document. When `work.dispatch_unknown` is set it says so above the list.
- **Empty state**: only when there is neither a plan nor a single spec.

### 3.1 Holder per status

| effective status | holder |
| --- | --- |
| `in_work` | `{ role: 'dev', agent_id: state.roles.dev }` |
| `reviewing` | `{ role: 'reviewer', agent_id: state.roles.review }` |
| `dispatching`, `queued`, `handed_over`, `pending`, `needs_brief`, `done`, `blocked_owner`, `skipped` | `null` |
| any row while `paused` / `escalated` / `orphaned` / `done` | `null`, state named in `note` |

`state.roles` is the flow's own record of which agent plays which part (`flow.ts:220`, set at
`flow start --dev/--review`), so the card names the same agent the engine dispatches to.

Work of agents outside a flow (a bare `reevesagents spawn` run) stays out of scope and is said so in the caption.

## 4. What must not change

- `nextSpec` (`src/core/flow.ts:1472`), `flow plan next`, `closeItemOnAccept`, `plan-mark.ts`, `flow-notes.ts`
  parsing, `flowDispatchNote`, the import path and every write protocol stay exactly as they are — the projection
  only *reads* them.
- The attention model, the composer-profile regex and the `reanchor` completion are local features kept on
  purpose in `dev/local`; this task does not touch them.
- No new dependencies, no new CLI flags; `state.specs`, `dispatched_specs` and `pending` keep their meaning.

## Acceptance

- Pure-function tests for `workItems`: `queued`; `dispatching`; `in_work`; `reviewing`; `done`; `handed_over`; plan
  rows passed through with `plan_status`; an off-plan spec beside a plan.
- **Dispatching by `pending`**: `pending.spec_id = A`, no journal entry yet, flow `idle` → A `dispatching`,
  `holder: null`.
- **Dispatching by an attributed note**: `pending` cleared after a failed submit, `claim.spec_id` null (off-plan),
  `flowDispatchNote` non-null and the preceding `dispatch_claimed` names `spec_dispatched A` → A still
  `dispatching`, not `in_work`.
- **Unattributable**: the same state with no recoverable id → no row is `dispatching`, `work.dispatch_unknown` is
  `true`, and no holder is invented; the badge says `dispatch not confirmed — task unknown`, not
  `nothing in work`.
- **Refused, first handover**: `pending → dispatch_refused` for the row's first spec dispatch → the row is
  `queued` again with no note and `current` stays `null`.
- **Refused, review or fix attempt**: a refused review request / fix dispatch leaves the task's own phase intact
  (it was already handed over) and does not touch an earlier unconfirmed signal.
- **Refused, later retry**: a refusal after an earlier unconfirmed attempt keeps the row `dispatching` with
  `attempt refused; handover still unconfirmed` — the warning is not cleared by the refusal.
- **Phase order**: with `state.state === 'reviewing'` and a claim still pointing at the row, the row is
  `reviewing` (never `in_work`); with `ACCEPT` in notes before the tick transitions, the row is `done`.
- **Fix cycle**: `dispatch A → request_review H1 → CHANGES_REQUESTED → dispatch_fix → request_review H2 → ACCEPT`
  leaves A `done` (one dispatch, a chain of rounds inside its interval).
- **False close**: `dispatch A → dispatch B → request_review B → ACCEPT B` leaves A `handed_over`, only B `done`.
- **Notes parsing**: `VERDICT` on the first line is accepted; `r1` and `r2` for one head — the newest round
  decides (through the existing `flow-notes` helpers).
- **Current never falls through**: after the only active row closes, `current` is `null` even though a `queued`
  row exists, and the badge says "nothing in work".
- **Ambiguity**: `pending.spec_id` disagreeing with `claim.spec_id` yields `current = null` and both rows
  `handed_over` with the ambiguity note.
- **Ownership gate**: in `paused` / `escalated` / `orphaned` / `done`, no row has a holder, `current` is `null`,
  and a plan row stored as `reviewing` renders `reviewing (paused)` with `plan_status: 'reviewing'`.
- **Degradation priority**: a retained settled claim with a rotated `dispatch_spec` entry stays `in_work` (not
  `handed_over`); a `request_review` with no notes yet shows `awaiting the reviewer's answer`.
- **Holder**: ids come from `state.roles`; `dispatching`/`queued`/`done`/`handed_over` carry `null`.
- **Badge on a mixed flow**: an off-plan spec in work is named in the active segment while the plan's `N/M` shows
  as a separate segment.
- **No writes**: hashing the flow state, the plan and the notes directory before and after a read yields identical
  values; queueing two specs on a scratch run creates no `plan.json`.
- Live checks: a scratch run with two specs shows the first `dispatching` → `in_work` (dev) → `reviewing`
  (reviewer) → `done`, the second `queued`; flow `cca769f4` shows `UI-143` and `UI-144` as `done`, nothing
  active, state file unchanged.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke:cli && pnpm check:package` green.
- Web UI read from the DOM against a second server (`node dist/cli.js web --port <free> --no-open`): icon
  present, badge names the current item and its holder, Plan tab lists both rows and marks the current one.

## Rollout

Install into the dev channel (`reevesagents-dev-update --deploy-verified`) **between** blocks: the script stops
`reeves-flow-tick.timer` for the swap, and a tick in flight during a running review would lose its round. The
live panes are separate processes and survive the swap.
