# The plan as an object: model, sync and surfaces

Status: **design** (block 11). Nothing in this document is implemented yet — the code arrives in blocks
12–17, listed in §10.

The flow engine today knows two things about work: a queue of block specs and a round counter
(`src/core/flow.ts:151-152`, `:140`). That answers "what is the dev doing right now", not "how much of the
project is left", and it gives the owner no way to drive a project by its plan. This document turns the
project's own `docs/implementation-plan.md` into an object the engine can reason about: the same document
the agents work from, mirrored in state, with statuses that only ACCEPT can move.

## 0. Decisions in three lines

1. **The mirror lives in `~/.reeves/flows/<run-id>/plan.json`**, beside the notes directory, not inside the
   flow state file — the state stays small and readable, and the plan carries its own `schema_version`.
2. **An item gets its brief by explicit attach** (`flow plan attach --item <id> --spec <file>`), which
   validates the spec with the existing `BlockSpec` validator and stores a *snapshot* of the record; no
   brief means `needs_brief`, and the tick escalates instead of inventing scope.
3. **`done` is only ever set by an ACCEPT of the commit that closed the item, or by an explicit human
   command** (`flow plan set --run <id> --item <id> --status done --yes --note <why>`); a partial result that satisfies some
   requirements is `in_work`, never `done`.

## 1. Inventory: what the plans actually look like

### 1.1 Plan A — milestone ids

A 477-line plan, 83 checked and 82 unchecked items. Three shapes coexist:

| what | where | note |
| --- | --- | --- |
| a hand-maintained progress table | lines 31–42 | `| <milestone> | <sprints> | <tasks> | <status> | 37/37 |`, with a total row such as `**65/137 (47%)**` — the owner already wants "how much is left", computed by hand |
| milestone headings | line 44 | `#` and not `##`, so a level-based parser must accept both |
| items with an explicit id | lines 46–57 | `- [x] **T0.1.1** — <text>`, then prose; ids of the `T0.1.1` / `P0.1.1` kind |
| status emojis in prose | line 3, lines 31–42 | ✅ / 🔄 / ⬜ / ⛔ are human shorthand, not a status field |

The item line is regular: `^- \[( |x)\] \*\*(ID)\*\* — (text)$`. The progress table is *derived* data the
owner maintains by hand — a known source of drift, and the reason the engine should compute it instead.

### 1.2 Plan B — stage headings, no ids

141 lines, 33 checked and 2 unchecked items, **and no ids at all**:

| what | where | note |
| --- | --- | --- |
| stage headings | lines 3, 14, 23, 49, 57, 128 | `## <Stage> N — …` — a localised word and a different structure |
| items without ids | lines 5–8, 16–20 | `- [x] <text>.` — no bold id, no em dash |
| multi-line open items | lines 29, 103 | `- [ ] <text> — **<decision` continues on the following line |
| result notes | lines 10–12 | `> <results>: …` — a blockquote that belongs to the stage, not to an item |

So the two real documents agree on the checkbox and disagree on everything else. Neither is named here on
purpose: the design is about the *shapes*, and a plan is a project's private document. The model therefore
cannot require an id in the document; it needs a rule that produces stable ids (§3.2).

### 1.3 What the flow already has

| need | existing module (`file:line`) | what is missing |
| --- | --- | --- |
| a validated unit of work | `src/core/spec.ts:13` `BlockSpec` (`id`, `title`, `goal`, `requirements`, `checks`, `report`, `body?`, `source_path?`, `unstructured?`), `:50` `SPEC_ID_PATTERN`, `:52` `SPEC_LIMITS` | nothing — a plan item's brief **is** a `BlockSpec` |
| a queue | `src/core/flow.ts:151` `specs`, `:152` `dispatched_specs`, `:725` `nextSpec()` (first spec not yet dispatched) | the queue is flat and one-shot: no ids from a document, no ordering beyond insertion, no `skipped`, no "why is this not queued" |
| queuing over a surface | `src/core/flow-control.ts:174` `addFlowSpecs`, `:159` `AddSpecsInput`; CLI `add-spec` `src/surfaces/cli/flow.ts:239` | attaching a spec to an *item* (today a spec arrives with its own id and is queued immediately) |
| the commit under review | `src/core/flow.ts:148` `claim` (`head`, `verdict`, `verdict_count`) | the claim is per flow; nothing records "which item this head belongs to" |
| rounds | `src/core/flow.ts:140` `rounds`, `:141` `max_rounds` | rounds are per flow, not per item — the plan needs a per-item count for "how hard was this one" |
| review notes per round | `src/core/flow-notes.ts:102` `notesRef`, layout `flows/<run-id>/notes/…`; `NOTES_KEEP_HEADS` `:42` | a per-item pointer to the round that closed it |
| state files | `src/core/flow-store.ts:61` `flowPath()` → `flows/<run-id>.json`; notes cascade `:103` | a second file per flow, and its cascade on `delete-history` |
| status vocabulary | `src/core/flow.ts:24` `FlowStatus`, `:35` `FLOW_TRANSITIONS` | plan statuses are a *different* space (§2.2) and must not be confused with the flow's lifecycle |
| status payload | `src/core/flow-view.ts:34` `FlowStatusPayload` (`queue` `:58`, `dispatched_specs` `:59`, `last_notes` `:51`, `last_evidence` `:48`) | plan progress in the payload |
| journal | `src/core/flow.ts:84` `FLOW_LOG_LIMIT` = 50, `log` in `FlowState` | plan events (import, attach, status change) need a place; the flow's journal is bounded at 50 and shared |
| run card badge | `src/surfaces/webui/state.ts:73` `WebRun.flow`, `src/core/flow-label.ts` (`flowLabel`) | a `plan 12/23` chip |
| surfaces | CLI `src/surfaces/cli/flow.ts:65-76` (`status` printer), `:403` `logs`, `:340` `notes`; MCP `flow_status`/`flow_step`/`flow_control` | no `plan` verb anywhere |

## 2. The model

```
Plan {
  schema_version: 1
  run_id: string
  source_path: string          // repository-relative, e.g. "docs/implementation-plan.md"
  source_hash: string          // sha256 of the normalised document (§3.4)
  imported_at: string          // ISO, last successful import
  items: PlanItem[]            // document order, always
  conflicts: PlanConflict[]    // bounded at 50, newest last
}

PlanItem {
  id: string                   // "P1.7.1" or "auto:3f9c1a2b" (§3.2)
  title: string                // the item text with the id prefix removed, whitespace collapsed
  status: PlanStatus
  spec: BlockSpec | null       // snapshot at attach time (§4.2)
  spec_path: string | null     // where it came from, repository-relative
  spec_hash: string | null     // sha256 of the spec file at attach time
  head: string | null          // the commit that closed the item
  rounds: number               // rounds spent on this item
  notes_ref: string | null     // "<head>-r<N>" of the round that produced the closing verdict
  updated_at: string
  owner_action: boolean        // true when the item cannot move without a human
  missing_since: string | null // the document no longer lists it (§3.3)
  line: number | null          // 1-based line in the document at import time
}

PlanConflict {
  at: string                   // ISO
  item_id: string
  kind: "unticked" | "ticked_by_hand" | "duplicate_id" | "spec_changed"
  detail: string               // one line, no document text beyond the item id and line number
}
```

`items` is an array in document order, not a map: order **is** the priority, and `flow plan next` takes the
first eligible item (§5).

### 2.1 Why `owner_action` is a field, not a status

`needs_brief` and `blocked_owner` both mean "a human has to do something", and both should light up the same
`waiting for you` counter. Keeping the *cause* in `status` and the *fact* in `owner_action` means a new
blocking status added later does not need a new counter, and a surface can ask one boolean instead of
enumerating statuses. `owner_action` is derived on write, never accepted from a caller.

### 2.2 Statuses

| status | meaning | who sets it |
| --- | --- | --- |
| `pending` | in the plan, not queued (no brief yet or not reached) | import; `plan set` (triage, or un-setting `needs_brief`) |
| `needs_brief` | has no brief; the engine will not guess | `plan next` when the first eligible item has no snapshot spec; `plan set` |
| `queued` | brief attached, dispatch expected | `plan attach`, `plan next`, the engine re-queuing after a refused dispatch |
| `in_work` | a dispatch for it is in flight or the dev is fixing | **engine only** (claim of a dispatch, fix decisions, and the close of an accepted round that arrived before the item was marked `reviewing`) |
| `reviewing` | a review of its head is running | **engine only** (`request_review`) |
| `done` | ACCEPT of the closing commit, or a human said so | engine **only** on a substantiated ACCEPT (`closeItemOnAccept`); `plan set --status done --yes [--note <why>]` |
| `blocked_owner` | the dev or the reviewer reported a decision only the owner can take | the engine, from an escalation carrying `owner_decision`; `plan set` |
| `skipped` | deliberately not doing it | `plan set --status skipped --yes` |

The "who sets it" column is deliberately not a "leaves to" column: the legal moves live in exactly two places
below (the engine table and the human table), and duplicating them here is how the two drifted apart once
already — this table used to claim `blocked_owner` could only reach `queued`/`skipped`, while the human table
allowed `blocked_owner → pending`, `→ needs_brief` and `→ done`.

Rationale for the two terminal states: `done` and `skipped` both stop `flow plan next` from looking at the
item, and both count toward "the plan is complete" (§6) — but only one of them claims work was delivered. A
single `closed` status would lose that, and the UI needs to show `12/23` (delivered) separately from
`14/23 closed`.

**The transitions are a table, not a free-for-all** (`PLAN_TRANSITIONS` in `src/core/plan.ts`, the same shape
as the flow's `FLOW_TRANSITIONS`), and there are **two** of them: what the engine may do, and the smaller set a
human command may do (`HUMAN_TRANSITIONS`). The engine table:

| from | may become |
| --- | --- |
| `pending` | `needs_brief`, `queued`, `skipped`, `blocked_owner`, `done` (a manual close for work finished before the flow existed) |
| `needs_brief` | `pending`, `queued`, `skipped`, `blocked_owner`, `done` |
| `queued` | `pending`, `needs_brief`, `in_work`, `done`, `skipped`, `blocked_owner` |
| `in_work` | `queued`, `reviewing`, `done`, `blocked_owner` |
| `reviewing` | `in_work`, `queued`, `done`, `blocked_owner` |
| `blocked_owner` | `pending`, `needs_brief`, `queued`, `skipped`, `done` |
| `done`, `skipped` | — terminal |

The **human** table is what `plan set` follows, and it is a strict subset:

| from | a human may set |
| --- | --- |
| `pending` | `needs_brief`, `queued`, `skipped`, `blocked_owner`, `done` |
| `needs_brief` | `pending`, `queued`, `skipped`, `blocked_owner`, `done` |
| `queued` | `pending`, `needs_brief`, `skipped`, `blocked_owner`, `done` |
| `in_work`, `reviewing` | — (the engine's own statuses) |
| `blocked_owner` | `pending`, `needs_brief`, `queued`, `skipped`, `done` |
| `done`, `skipped` | — terminal |

Three rules fall out, and each was a review finding before it was written down:

- **a blocked item stops the picker; an unbriefed one does not.** `blocked_owner` is a decision the owner has
  already taken about that point of the plan, so the picker stops on it rather than routing around it; an item
  without a brief is work not yet described and is reported instead. A spec queued by hand (`add-spec`) outranks
  both: it is an explicit instruction and the plan fills the queue only when the queue is empty.
- **a human cannot claim or release a round in flight.** `queued → in_work` is the engine's transition when
  it claims a dispatch; done by hand it would make an item look active while nothing was ever sent. Worse in
  the other direction: `in_work → queued` would free an item whose round is still running, and the next
  `plan next` would dispatch a second brief on top of the first. So `in_work` and `reviewing` have no human
  edges at all — the operator pauses or stops the flow, which is a decision about the pipeline, not about one
  row of the plan.
- **an item whose round is in flight cannot be closed by a human.** The engine table has `reviewing → done`
  because `closeItemOnAccept` closes the item when the round's verdict accepts the commit; a manual `done`
  there would claim a review that may be about to ask for changes.
- **terminal means terminal.** `done` and `skipped` have no outgoing edge: `done` is a claim about a reviewed
  commit, and flipping a checkbox or a status later must not create a claim the engine never made. Reopening
  is a deliberate non-feature; a wrong close is corrected in the document and re-imported as a conflict, not
  by rewriting history.

`missing` and `conflict` are **flags**, not statuses (§3.3): an item that vanished from the document keeps its
status and gains `missing_since`, so an import typo cannot silently turn delivered work into nothing.

## 3. Source of truth and synchronisation

### 3.1 Where the mirror lives

`~/.reeves/flows/<run-id>/plan.json` — a sibling of the notes directory that already exists
(`flows/<run-id>/notes/…`, `src/core/flow-store.ts:103`), not a field inside `flows/<run-id>.json`.

Sizes, measured on the two real plans: the id-bearing one has 165 items; a `PlanItem` with a title, an id, a
status and timestamps is ~260 bytes of JSON, so 165 items ≈ 43 KB, and a plan that also carries snapshot
specs (`BlockSpec` with `requirements`/`checks`: 0.5–3 KB each) reaches 150–400 KB. The flow state file is
read and rewritten under a lock on **every tick** (`withRunsLock`, `flow-store.ts` `saveFlow`), and
`docs/flows-design.md` promises it stays a readable document. Putting a few hundred kilobytes of stable
plan data into it would triple every write and bury the ten interesting fields under the plan.

The flow state keeps only a **summary pointer**, never the items:

```
FlowState.plan: { imported_at, source_hash, done, total, waiting } | null
```

so `flow status`, the TUI list and the Web run card can draw `plan 12/23` from the state they already read,
without opening `plan.json` on every tick or every render. `waiting` is the count of `owner_action` items —
one number, not a list.

**How the pointer is kept in step.** Every command that changes the plan goes through one function,
`mutatePlan(runId, mutator)`: it takes `withRunsLock`, reads `plan.json` **inside** the lock, hands the plan to
the mutator, writes `plan.json` and then updates `FlowState.plan` — all in that one critical section, so under
normal operation the two cannot disagree. The read-modify-write is inside the lock on purpose: a CLI that read
the plan, changed it and saved it in separate steps raced another CLI (or an MCP call) and lost one of the two
updates, and the summary could describe a plan that no longer existed. What `flow plan import` does **not** touch is the *rest* of the
flow state: `specs`, `claim`, `rounds`, `log`, the notes. That is what "writes only `plan.json`" means — the
plan's record plus its one-line summary, never the pipeline's own fields.

The two writes can still be torn apart by a crash between them, which is exactly why the pointer is a
**cache**: any plan command that reads it recomputes the summary from `plan.json` and rewrites the flow file
when the numbers differ, and a reader that cannot take the lock (`flow status` on a busy run) answers from
`plan.json` alone rather than printing stale counters. `source_hash` in the summary is what makes the check
cheap: equal hash and equal counts means nothing to repair.

So: two files, two owners, two `schema_version`s, one lock. `deleteRunHistory` cascades over both (§9).

Caps: `PLAN_MAX_ITEMS` = 1000, `PLAN_MAX_BYTES` = 512 KiB for `plan.json`, `PLAN_MAX_DOCUMENT_BYTES` = 1 MiB
for the source document. Over the cap the import refuses with the actual number and changes nothing.

### 3.2 Item identity

1. If the line matches `^- \[( |x)\] \*\*(ID)\*\* — (text)` — the id-bearing shape — the id is the bold
   token, validated against `SPEC_ID_PATTERN` (`src/core/spec.ts:50`) so it can double as a spec id.
2. Otherwise — the id-less shape — the id is `auto:` + the first 8 hex of `sha256(normalised title)`. It
   survives moving the line, reordering stages, and re-ticking; it does not survive rewording, which
   produces a *new* item and leaves the old one `missing`.
3. Two items with the same id in one document is a **refused import** with both line numbers; the alternative
   (suffix `-2`) would silently invent identity.

### 3.3 Import rules (`flow plan import`, and every re-import)

| case | what happens | why |
| --- | --- | --- |
| new item in the document | appended in document order as `pending`, or `needs_brief` when no brief is attached | the plan may grow; the owner should see it |
| item gone from the document | `missing_since = now`, status kept, excluded from `next`, counted as `missing` in `flow plan` | a typo or a restructure must not erase delivered work |
| `done` item now unchecked in the document | status stays `done`, a `PlanConflict` (`kind: "unticked"`, `line`, `at`) is appended and shown by `flow plan` — the engine's own write-back (§3.5) is what keeps this from happening in the first place | the human may be right, but a re-import does not silently rewrite an ACCEPT — §3.5 |
| item text edited | `title` updated, id unchanged (id-bearing plans) or a new `auto:` id (id-less plans), `spec` untouched | the brief was attached to an id, not to a sentence |
| `[x]` in the document, mirror says `pending` | **not** promoted to `done`; on a **re-import** a `PlanConflict` (`kind: "ticked_by_hand"`) is logged. A first import logs nothing: there is no record to disagree with, and the id-bearing real plan opens with 83 ticked items — 83 conflicts would bury the one that matters | a checkbox is not evidence; only ACCEPT is (§2.2) |
| `source_hash` unchanged | nothing at all is written, `imported_at` untouched | a re-import must be a no-op on an unchanged file |
| document format not recognised | refuse with `unsupported_format`, the offending line number and the two accepted shapes | guessing a format is how a plan silently becomes empty |

### 3.4 `source_hash`

`sha256` over the document with `\r\n` → `\n` and trailing whitespace stripped from every line, joined with
`\n` and no trailing newline. This makes a CRLF checkout, a trailing space or a final-newline edit a no-op —
and a real text change a real change. (Two projects, two checkouts, one of them on Windows: the hash must
not depend on which one imported first.)

### 3.5 Who wins

The document is the **list of work**; the mirror is the **record of what happened**. They cannot be merged
into one authority without losing something, so the rule is per field:

- membership (which items exist, in what order) — the document wins;
- status of an item that the engine moved (`in_work` … `done`) — the mirror wins, and a document that
  disagrees produces a conflict entry, never a silent rewrite;
- `pending` / `skipped` — either may set it, the latest human action wins.

Consequence to state plainly: **editing the document is not a way to close work** — a ticked box is logged as
`ticked_by_hand` and ignored — and the one direction the engine does write is the other one: closing an item in the mirror
ticks its line in the document (block 72).

**The write-back** (`src/core/plan-mark.ts`). When an item reaches `done` — by an ACCEPT or by an explicit
`flow plan set --status done --yes --note` — the engine rewrites exactly that line, `- [ ] **<ID>**` → `- [x] **<ID>**`,
byte for byte otherwise: no re-formatting, no re-assembly of the document, and a line that belongs to another id is refused
rather than ticked. Then it commits, because an uncommitted tick would leave the tree dirty and stop the very dispatch it
was recording: one `chore(flow): mark <ID>[, <ID>] done in the plan` commit per pass, `git add -- <the plan document>` and
nothing else — the only place the engine writes to the repository, and the only files it commits.

That commit is docs-only by construction, so the existing path takes it: `docs_only_since_claim` → `reanchor` moves the
claim onto the mark commit, asks for no review and spends no round. It also closes the `unticked` conflict: a document the
engine keeps in step cannot disagree with the mirror about an item the mirror closed.

Guards, because the close outranks the mark: a dirty tree defers the write (`plan_mark_deferred: tree_dirty`, one journal
line) and the next clean pass writes it; a missing document, an unreadable one, a path outside the project or a git that
refuses to commit is journalled as `plan_mark_failed <reason>`, the file is put back as it was if the commit failed, and the
item stays `done` in the mirror. A line that already says `[x]` is reported and never re-written or re-committed. Success is
`plan_item_marked <ID> <sha>` in the flow's journal, plus one `plan.item_marked` notification so the panel's journal says
it too.

## 4. Plan ↔ brief ↔ commit

### 4.1 Attaching

`flow plan attach --run <id> --item P1.7.1 --spec docs/briefs/P1.7.1.json [--queue] [--dry-run]`

- reads and validates the file with the existing `BlockSpec` validator (JSON or markdown, the same two
  readers `add-spec` uses), so a broken brief fails in front of the person who wrote it — the documented
  invariant of `src/core/spec.ts:1-11`;
- **the spec id must equal the item id**; a mismatch is refused (`spec_id_mismatch`, both values printed),
  because the queue's dedupe key is the spec id (`flow.ts:152`). A *markdown* brief is the exception and the
  reason is structural: its id is derived from the heading, and no slug can equal an item id such as `P1.7.1`
  (`p1-7-1` ≠ `P1.7.1`), so a markdown brief takes the item id it was attached to. A JSON brief still carries
  its own id, and a mismatch there stays an error;
- stores `spec` (the snapshot), `spec_path`, `spec_hash`, and moves the item `pending` / `needs_brief` →
  `queued` **in the plan**. That status means exactly "has a brief and is eligible for `plan next`"; it is a
  fact about the plan, not about the flow's queue;
- with `--queue` it *also* puts the spec into the flow's `specs` (`addFlowSpecs`) so the next tick can
  dispatch it without a `plan next`. Without the flag the flow's `specs` is untouched and `flow plan next`
  (§5) is what moves the item from eligible to queued-for-dispatch.

An item that is `in_work` or `reviewing` cannot take a new brief: the round in flight is rendering the
snapshot it started with, and swapping the record underneath it would dispatch one brief and review another.
That attach is refused (`item_busy`) until the item comes back to `queued`.

Two different things carry the word "queued" and the doc keeps them apart: the **plan status** `queued`
(brief attached, eligible) and the **flow's `specs` entry** (a block the engine may dispatch next). Attach
without `--queue` produces the first and not the second.

### 4.2 Snapshot, not a pointer

`spec` is the validated record as it was at attach time, plus `spec_hash` of the file. At dispatch the
engine uses the snapshot, so a dispatch stays reproducible from state alone — the same reason `BlockSpec`
replaced "a path in the prompt". If the file changes after the attach, `flow plan` shows `brief edited`
(next to the item) and `flow plan next` refuses with `spec_changed` until the owner re-attaches
(`--re-attach`); it never picks up the edit silently.

### 4.3 No brief, no work

An item without a snapshot spec is `needs_brief`. The tick's reaction is an **escalation**
(`plan_needs_brief`, detail `needs a brief for P1.7.1`) when the item is what `flow plan next` would take,
and a `hold('plan_needs_brief')` otherwise. The engine never derives requirements from the item's title: the
title is a sentence the owner wrote for a human.

### 4.4 Closing

When a round ends in a substantiated ACCEPT (`isVerdictSubstantiated`, `flow.ts`), the item whose dispatch
produced that round gets `status: done`, `head` = the accepted commit, `rounds` = rounds spent, `notes_ref` =
the notes key of the closing round. This is the only automatic path to `done`, and it is the same evidence
the engine already requires before it closes a flow — no second, weaker gate.

## 5. Auto-advance

**Rounds belong to the item, not to the flow** (block 13's decision, answering O2):

- `max_rounds` is the budget of **one item** — how many fix rounds that item may spend before it blocks. A flow
  carries dozens of items; one counter for all of them either cuts a healthy item or lets a bad one eat the
  budget.
- `max_total_rounds` (default `4 × max_rounds`, capped at 100) is the flow's fuse, so a pathological reviewer
  cannot keep it walking from item to item for ever.
- a flow **without** a plan keeps the old meaning exactly: `max_rounds` is its round budget and
  `max_total_rounds` is not read. That is the schema-v1 compatibility rule, and it has its own regression test.
- an item that spends its budget becomes `blocked_owner` with `block_reason: rounds_exhausted`; the flow does
  **not** move to the next item (otherwise a bad item is silently buried in the list). A human decides: `flow
  plan set --item <id> --status queued` to continue, or `--status skipped`.
- spending `max_total_rounds` escalates the **flow** (`total_rounds_exhausted`), and the boundary is the round
  itself: a fuse of 5 permits rounds 1–5 and escalates on the sixth attempt, not before the fifth;
- a plan file that exists but cannot be parsed is an **error**, not "no plan": the tick refuses instead of
  taking the legacy branch, because that branch would let an ACCEPT close the flow with items still open. The
  same holds one level down — only `ENOENT` means "there is no plan"; a permission or I/O error while checking
  the file is reported, never read as absence.

`flow plan next` is the **only** automatic way an item becomes work:

1. skip `done`, `skipped`, `missing`;
2. take the first item in document order with `status: queued` (brief attached);
3. an item without a brief is **reported, not dispatched and not blocking**: the picker skips it and takes the
   first item after it that has a brief, while every unbriefed item stays visible in the "waiting for a brief"
   line. Block 13 settled this: a plan of twenty items where the fourth has no brief must not freeze the other
   sixteen. `blocked_owner` is different — it is a decision the owner already made to stop this item, and the
   picker stops on it rather than routing around it;
4. one active item per flow: if any item is `in_work`/`reviewing`, `next` returns `busy` and does nothing.

`--dry-run` prints the item and the rendered prompt without queuing or sending.

### 5.1 Who ticks, and what a blocker looks like

The plan decides *what* moves; the external driver decides *when* (`docs/flows-design.md` §2.3). `tickAllFlows()` is
called from exactly one place: the external pass, `flow tick --all`, run by `reeves-flow-tick.timer` (or cron). The Web
UI's SSE hub and `GET /api/state` do **not** tick (an API poll must not paste into a pane, and a browser tab is not a
driver), and neither does the TUI: both only report the receipt the last real pass left in `~/.reeves/tick-status.json`.
The engine still holds no timer, and there is no `flow_tick_ms` setting any more (block 68).

A blocker is a **view** value, never a field written into `task_status`: `flowBadge()` takes the plan's first
unmovable item — a `blocked_owner` row, or an open row with no brief — and reports `attention: 'plan_waiting'` with
`{ reason: 'needs_brief' | 'blocked_owner', item }`,
which the badge renders as `plan: waiting for a brief (P1.7.2)`. The same hold emits one warning notification per
item (`plan.item_needs_brief` / `plan.item_blocked`, keyed by the item), and `flow status` prints the list of
waiting items plus when the last move happened and when the next tick is due.

## 6. Progress and completion

`flow plan` prints `done/total`, the remaining count per status, and the two "waiting for a human" buckets:

```
plan      docs/implementation-plan.md  (imported 2026-11-02T09:14Z, hash 9f3c1a2b)
progress  12/23 done · 2 skipped · 5 pending · 3 needs_brief · 1 blocked_owner · 1 missing
waiting   needs_brief: P1.7.1, P1.7.2, P2.1.4 · blocked_owner: P1.4.2 · brief edited: P2.2.1
next      P1.7.3 — "Wire the booking edge port"  (brief docs/briefs/P1.7.3.json)
```

Completion: the flow may reach `done` only when every item is `done` or `skipped`; while anything is open the
tick holds with `plan_incomplete` and a detail that names what it is waiting for (the open ids, the items
needing a brief, the blocked ones). An item without a brief is a **hold**, not an escalation: a half-written
document is not a broken pipeline, and the owner's rule is that such an item shows up in the report. Otherwise the tick
returns `hold('plan_incomplete')` with the counts, and `flow stop --yes` remains the manual close (it needs
no plan state). `missing` items count as incomplete and are named — an import that lost half the document
must not let a flow declare itself finished.

## 7. CLI

Six commands. `plan`, `import`, `attach`, `next` and `set` take `--run <id>` (resolved the way
`resolveFlowRunId` already does); `plan status` is the exception — it takes `--item <id>` plus an *optional*
`--run <id>` and, without it, finds the flow that owns the item, because an item id is only unique inside a
plan. All six accept `--json`; `import`, `attach`, `next` and `set` accept `--dry-run`, which prints the
same output without writing (for `next` that means "do not queue, do not send").

| command | stdout (human) | `--json` | exit codes |
| --- | --- | --- | --- |
| `flow plan --run <id>` | the block above | `{run_id, source_path, imported_at, source_hash, progress:{done,total,skipped,by_status}, waiting:{needs_brief:[id],blocked_owner:[id],missing:[id],conflicts:n}, next:{id,title,spec_path}|null, items:[…]}` | 0; 3 when a conflict exists (so a script notices) |
| `flow plan import --run <id> --file <path> [--dry-run]` | `imported 23 items: 3 new, 1 missing, 1 conflict` | `{added:[id],missing:[id],conflicts:[…],unchanged:bool,source_hash}` | 0; 1 usage/bad path; 2 not found; 3 refused (too big, duplicate ids, unsupported format) — nothing written |
| `flow plan attach --run <id> --item <id> --spec <file> [--queue] [--dry-run]` | without `--queue`: `attached P1.7.1 → docs/briefs/P1.7.1.json (brief ready; flow plan next queues it)`; with `--queue`: `attached P1.7.1 → docs/briefs/P1.7.1.json (queued for dispatch)` | `{item:{id,status,spec_path,spec_hash}, queued:bool}` — `queued` is the flow queue, `item.status` is the plan status | 0; 2 unknown item; 3 refused (invalid spec, id mismatch, item already `in_work`/`reviewing`) |
| `flow plan next --run <id> [--dry-run]` | the item plus the rendered prompt head | `{item:{id,title},prompt:string|null,queued:bool,reason:"busy"|"plan_needs_brief"|"plan_blocked_owner"|null}` | 0; 0 with `reason` when it does nothing (a no-op is not an error); 2 no plan |
| `flow plan status --item <id> [--run <id>]` | one item: status, head, rounds, notes ref, spec path, `updated_at` | the `PlanItem` | 0; 2 unknown item, or the id exists in more than one flow (both run ids printed — pass `--run` to disambiguate) |
| `flow plan set --run <id> --item <id> --status <status> [--yes] [--note <text>] [--dry-run]` | `P1.4.2 blocked_owner → queued (manual, note: unblocked after the vendor call)` | `{item:{id,status,previous,owner_action,updated_at}}` | 0; 1 usage; 2 unknown item; 3 refused — `done` and `skipped` need `--yes`, `done` on an item with no accepted head needs `--yes` **and** a `--note`, and an unknown status is refused with the eight accepted values |

`flow plan set` is the only command that moves an item by hand, and it is the only path that can set `done`
without an ACCEPT (§2.2): that is why it needs `--yes` and a `--note`, and why the note lands in the journal
next to the previous status. Nothing else in the engine may write `done`.

`--json` never carries the spec `body`, its `requirements`/`checks`/`report` or the notes text — the payload
is a transcript, the file is the record (the rule from `docs/notifications-design.md` §11.3). An item is
rendered through `planItemView`: id, title, status, the *shape* of the brief (`id`, `title`, `unstructured`),
its path and hash, the closing commit, rounds, the notes reference and the timestamps. A surface that needs
the text opens `spec_path`.

## 8. UI

`docs/notifications-design.md` §5 designs a **global** Logs dialog: notifications across runs, filterable by
run (`:952-1000`). The plan is the opposite shape — one plan belongs to exactly one flow, and it is
meaningless without one. So:

- **entry point**: the run card's `plan 12/23` chip (`src/surfaces/webui/state.ts:73` `WebRun.flow`, styled
  next to the existing flow badge `src/core/flow-label.ts`), opening a **run-scoped** `Plan` dialog;
- **not** a second tab in the Logs dialog, and not a second global menu button: the Logs dialog has a run
  filter because it spans runs, and the Plan has no meaning across runs. Two entry points, one visual
  language — same `.mcp-panel` shell, same badge and row CSS (`notifications-design.md` §1.2);
- **content**: a `12/23` progress bar, the status counts, a `waiting for you` block (needs_brief, blocked,
  brief edited, conflicts), and the item list with status badges; a filter `all / open / waiting`; a click on
  an item opens its detail — `head`, `rounds`, `notes_ref`, and the last review notes rendered from the notes
  file (block 09), plus `attach brief` / `set status` actions guarded like `stop` (`--yes` equivalent, a
  confirm dialog);
- the chip is a *count*, not a notification: it does not pulse. The pulse belongs to the agent card
  (notifications design §2.5) and mixing the two would make both unreadable.

## 9. Contract risks

| risk | rule |
| --- | --- |
| a plan with hundreds of items | caps in §3.1; over the cap the import refuses with the real number and writes nothing |
| duplicate ids | refused import listing both line numbers (§3.2) |
| a document rewritten into another format | only the two shapes in §1 are accepted; anything else is `unsupported_format` with a sample line — an empty plan is never the fallback |
| CRLF / trailing whitespace / final newline | normalised before hashing (§3.4), so a checkout difference is a no-op |
| multi-line items (plan B, lines 29 and 103) | a line starting with `- [` opens an item; following lines that are indented or start with `**` are appended to its title until the next item, heading or blank line; the folded text is what `title` holds |
| ids that are not spec-safe (`P1.7.1` is fine; `1.2 a/b` is not) | an id-bearing document with an invalid id is refused, naming the line — the id must be usable as a `BlockSpec.id` |
| a path outside the repository (`--file`/`--spec` from the home directory) | refused (`outside the repository`, exit 3), not shortened: `~/…` in `source_path` names the operator's home in every later payload, and a shortened path cannot be re-imported. The path is resolved against the **run's working directory**, so the command works from any cwd |
| a file inside the checkout that is a **symlink** to one outside it | refused: containment is decided on `realpathSync` of both the file and the project root, and the caller reads the *resolved* path, so the name cannot be swapped between the check and the read. A lexical comparison would pass the link and then read the outside file |
| a plan edited while a round is running | import is allowed, but an item that is `in_work`/`reviewing` keeps its status even if its line vanished (`missing_since` is set, status untouched) — §3.3 |
| `delete-history` on a run | the cascade removes `flows/<run-id>/` including `plan.json` (the notes directory is already handled this way, `flow-store.ts:103`) |

## 10. Blocks 12–17

| block | scope | done when | verified by |
| --- | --- | --- | --- |
| **12 — model + import + CLI** | `src/core/plan.ts` (`Plan`, `PlanItem`, statuses, normalisation, hashing, parser for the two shapes), `plan.json` store beside the flow store, `flow plan`, `flow plan import`, `flow plan status`, `flow plan attach`, `flow plan set`; MCP `flow_plan` (read) and `flow_plan_import` | a real import of both projects' plans produces the ids and statuses of §1; a re-import of an unchanged file writes nothing; a conflict is reported, not applied; `plan set` is the only manual status path and refuses `done` without `--yes --note`; CLI exits per §7 | unit tests on the two real documents (fixtures copied into `test/fixtures/`), `flow plan --json` golden payloads, a dry-run on a temp registry; `pnpm run typecheck`, `lint`, full `vitest`, `check:package` |
| **13 — advance + completion** | `flow plan next`, the tick taking the next queued item instead of `nextSpec`, `plan_incomplete` hold, `done` on a substantiated ACCEPT, per-item `rounds`/`head`/`notes_ref`, `plan_needs_brief` / `plan_blocked_owner` escalations | a flow with a three-item plan walks them in document order, one at a time; an item cannot become `done` without ACCEPT; a plan with a `needs_brief` item escalates instead of inventing scope; the flow refuses `done` while any item is open | engine tests with a faked plan + the existing `FlowPorts`; a live two-item smoke on a temp registry (dev pane idle, review pane idle) showing two dispatches and one `plan_incomplete`; full gate |
| **14 — notification journal** | `src/core/notifications.ts`, `GET/POST /api/notifications`, `POST /api/notifications/read`, `agent_pulse_ms`, `flow.escalated`/`flow.review_timeout` emission with the `flow_id:kind:episode` key | the journal survives a restart, dedupes an episode, rotates by count and size, and `flow.escalated` arrives once per escalation | `notifications-design.md` §3 tests (append under the lock, ring, dedupe index, first run), HTTP tests against a temp config, a restart test that re-reads the file; full gate |
| **15 — UI: plan + logs + badge** | the Plan dialog of §8, the Logs dialog of `notifications-design.md` §5, the `plan 12/23` chip and the pulse on the agent card | the chip opens the plan, the progress bar matches `flow plan --json`, an item opens its notes, the Logs dialog filters by run and marks all read, and neither dialog is reachable without a backend | DOM tests on the built client (`test/webui-*.test.ts`), a payload golden test, manual check on a throwaway server with a temp registry — **no probe on the shared tmux server** |
| **16 — TUI and escalation** | runs-list plan chip, `plan_incomplete`/`plan_needs_brief` in the attention line, `flow plan` equivalents in the TUI | the TUI shows `plan 12/23` and the attention reason from the same payload the Web UI uses | TUI render tests (`src/surfaces/tui/…`), `flow-label` tests, full gate |
| **17 — final package** | `docs/GUIDE.md`, `docs/mcp.md`, `PR_BODY.md`, §4.6 refresh, migration notes | every shipped surface is documented with a runnable example; §4.6 has no `planned` row left for blocks 12–16 | doc review against the shipped `--help` output, `check:package`, full gate |

## Open questions for the owner

- **O1. Write-back into the document?** — **settled by block 72**, and not as an option: the engine ticks the
  line of every item it closes and commits that tick itself (`src/core/plan-mark.ts`, §3.5). The dirty-tree
  objection is answered by the commit — the mark leaves the tree clean — and the docs-only path already
  re-anchors over such a commit without asking for a review. The remaining half of the question, editing
  prose, is deliberately out of scope: only the checkbox changes, one character per closed item, and a line
  that belongs to another id is refused.
- **O2. Per-item rounds budget?** `max_rounds` is per flow today. A plan with 20 items needs a budget per
  item (otherwise the first hard item eats the flow's allowance), or the counter must reset per item.
  Recommendation: per item, `PLAN_ITEM_MAX_ROUNDS` default 3, and the flow's `max_rounds` becomes a
  safety net for the whole run. This changes an existing field's meaning, so it needs an explicit decision
  before block 13.
- **O3. Does the plan own the queue, or sit beside it?** Block 12 keeps `add-spec` exactly as it is (a spec
  queued without a plan), and `flow plan next` queues through `addFlowSpecs`. If the owner wants every
  dispatch to come from a plan item, `add-spec` should eventually refuse when a plan is imported — that is a
  behaviour change for the existing CLI, so it is a decision, not a default.
