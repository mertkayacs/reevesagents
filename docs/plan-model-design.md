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

| status | meaning | set by | leaves to |
| --- | --- | --- | --- |
| `pending` | in the plan, not queued (no brief yet or not reached) | import, `plan next`, a fix that reopened it | `needs_brief`, `queued`, `skipped` |
| `needs_brief` | has no brief; the engine will not guess | import/attach bookkeeping, `plan next` | `queued` (after attach), `skipped` |
| `queued` | brief attached, dispatch expected | `plan attach`, `plan next` | `in_work`, `needs_brief` |
| `in_work` | a dispatch for it is in flight or the dev is fixing | engine (dispatch/fix decisions) | `reviewing`, `blocked_owner` |
| `reviewing` | a review of its head is running | engine (`request_review`) | `done`, `in_work` (changes), `blocked_owner` |
| `done` | ACCEPT of the closing commit, or a human said so | engine **only** on a substantiated ACCEPT; `plan set --status done --yes --note <why>` | — (terminal for the run) |
| `blocked_owner` | the dev or the reviewer reported a decision only the owner can take | engine, from an escalation carrying `owner_decision`; or `plan set` | `queued`, `skipped` |
| `skipped` | deliberately not doing it | `plan set --status skipped` (needs `--yes`) | — (terminal) |

Rationale for the two terminal states: `done` and `skipped` both stop `flow plan next` from looking at the
item, and both count toward "the plan is complete" (§6) — but only one of them claims work was delivered. A
single `closed` status would lose that, and the UI needs to show `12/23` (delivered) separately from
`14/23 closed`.

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
one number, not a list. The summary is written by whoever writes the plan, in the same locked step, and a
`plan.json` that disagrees with it is repaired from the file (the file is the record, the pointer is a cache).

So: two files, two owners, two `schema_version`s. `deleteRunHistory` cascades over both (§9), and
`flow plan import` writes only `plan.json`.

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
| `done` item now unchecked in the document | status stays `done`, a `PlanConflict` (`kind: "unticked"`, `line`, `at`) is appended and shown by `flow plan` | the human may be right, but the engine does not silently rewrite an ACCEPT — §3.5 |
| item text edited | `title` updated, id unchanged (id-bearing plans) or a new `auto:` id (id-less plans), `spec` untouched | the brief was attached to an id, not to a sentence |
| `[x]` in the document, mirror says `pending` | **not** promoted to `done`; a `PlanConflict` (`kind: "ticked_by_hand"`) is logged | a checkbox is not evidence; only ACCEPT is (§2.2) |
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

Consequence to state plainly: **editing the document is not a way to close work**, and closing work is not a
way to edit the document. A write-back (ticking the document when the engine reaches `done`) is a separate
opt-in, deliberately deferred — it touches the working tree, and the engine refuses to dispatch on a dirty
tree (`tree_dirty`), so a write-back that fires mid-round would block the flow. Open question O1.

## 4. Plan ↔ brief ↔ commit

### 4.1 Attaching

`flow plan attach --run <id> --item P1.7.1 --spec docs/briefs/P1.7.1.json`

- reads and validates the file with the existing `BlockSpec` validator (JSON or markdown, the same two
  readers `add-spec` uses), so a broken brief fails in front of the person who wrote it — the documented
  invariant of `src/core/spec.ts:1-11`;
- **the spec id must equal the item id**; a mismatch is refused (`spec_id_mismatch`, both values printed),
  because the queue's dedupe key is the spec id (`flow.ts:152`);
- stores `spec` (the snapshot), `spec_path`, `spec_hash`, and sets the item `queued` if the plan says
  `pending`/`needs_brief`;
- queues it in the flow's `specs` (`addFlowSpecs`) **only** when `--queue` is passed; by default attach is a
  plan-level act, and `flow plan next` does the queuing (§5).

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

`flow plan next` is the **only** automatic way an item becomes work:

1. skip `done`, `skipped`, `missing`;
2. take the first item in document order with `status: queued` (brief attached);
3. if the first non-terminal item is `needs_brief` or `blocked_owner`, **stop** — do not jump over it to a
   later item. A plan is an order; jumping around it silently reorders the project. The item is reported as
   `owner_action` and the flow holds (`plan_needs_brief` / `plan_blocked_owner`);
4. one active item per flow: if any item is `in_work`/`reviewing`, `next` returns `busy` and does nothing.

`--dry-run` prints the item and the rendered prompt without queuing or sending.

## 6. Progress and completion

`flow plan` prints `done/total`, the remaining count per status, and the two "waiting for a human" buckets:

```
plan      docs/implementation-plan.md  (imported 2026-11-02T09:14Z, hash 9f3c1a2b)
progress  12/23 done · 2 skipped · 5 pending · 3 needs_brief · 1 blocked_owner · 1 missing
waiting   needs_brief: P1.7.1, P1.7.2, P2.1.4 · blocked_owner: P1.4.2 · brief edited: P2.2.1
next      P1.7.3 — "Wire the booking edge port"  (brief docs/briefs/P1.7.3.json)
```

Completion: the flow may reach `done` only when every item is `done` or `skipped`. Otherwise the tick
returns `hold('plan_incomplete')` with the counts, and `flow stop --yes` remains the manual close (it needs
no plan state). `missing` items count as incomplete and are named — an import that lost half the document
must not let a flow declare itself finished.

## 7. CLI

Six commands. `plan`, `import`, `attach`, `next` and `set` take `--run <id>` (resolved the way
`resolveFlowRunId` already does); `plan status` is the exception — it takes `--item <id>` plus an *optional*
`--run <id>` and, without it, finds the flow that owns the item, because an item id is only unique inside a
plan. All six accept `--json`; `attach`, `set`
and `import` accept `--dry-run`, which prints the same output without writing.

| command | stdout (human) | `--json` | exit codes |
| --- | --- | --- | --- |
| `flow plan --run <id>` | the block above | `{run_id, source_path, imported_at, source_hash, progress:{done,total,skipped,by_status}, waiting:{needs_brief:[id],blocked_owner:[id],missing:[id],conflicts:n}, next:{id,title,spec_path}|null, items:[…]}` | 0; 3 when a conflict exists (so a script notices) |
| `flow plan import --run <id> --file <path> [--dry-run]` | `imported 23 items: 3 new, 1 missing, 1 conflict` | `{added:[id],missing:[id],conflicts:[…],unchanged:bool,source_hash}` | 0; 1 usage/bad path; 2 not found; 3 refused (too big, duplicate ids, unsupported format) — nothing written |
| `flow plan attach --run <id> --item <id> --spec <file>` | `attached P1.7.1 → docs/briefs/P1.7.1.json (queued)` | `{item:{id,status,spec_path,spec_hash}}` | 0; 2 unknown item; 3 refused (invalid spec, id mismatch) |
| `flow plan next --run <id> [--dry-run]` | the item plus the rendered prompt head | `{item:{id,title},prompt:string|null,queued:bool,reason:"busy"|"plan_needs_brief"|"plan_blocked_owner"|null}` | 0; 0 with `reason` when it does nothing (a no-op is not an error); 2 no plan |
| `flow plan status --item <id> [--run <id>]` | one item: status, head, rounds, notes ref, spec path, `updated_at` | the `PlanItem` | 0; 2 unknown item, or the id exists in more than one flow (both run ids printed — pass `--run` to disambiguate) |
| `flow plan set --run <id> --item <id> --status <status> [--yes] [--note <text>]` | `P1.4.2 blocked_owner → queued (manual, note: unblocked after the vendor call)` | `{item:{id,status,previous,owner_action,updated_at}}` | 0; 1 usage; 2 unknown item; 3 refused — `done` and `skipped` need `--yes`, `done` on an item with no accepted head needs `--yes` **and** a `--note`, and an unknown status is refused with the eight accepted values |

`flow plan set` is the only command that moves an item by hand, and it is the only path that can set `done`
without an ACCEPT (§2.2): that is why it needs `--yes` and a `--note`, and why the note lands in the journal
next to the previous status. Nothing else in the engine may write `done`.

`--json` never carries the spec `body` or the notes text — the payload is a transcript, the file is the
record (the rule from `docs/notifications-design.md` §11.3).

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

- **O1. Write-back into the document?** Ticking `- [x]` in `docs/implementation-plan.md` when an item
  reaches `done` would keep the repo document honest, but it makes the working tree dirty (which the engine
  refuses to dispatch on) and it puts the engine in the business of editing prose. Options: never (the
  mirror is the record), opt-in per flow (`--write-back`, applied on a tick when the tree is clean), or only
  on `flow plan import --write` (a human runs it). Recommendation: opt-in per flow, block 13 or later, not
  in 12.
- **O2. Per-item rounds budget?** `max_rounds` is per flow today. A plan with 20 items needs a budget per
  item (otherwise the first hard item eats the flow's allowance), or the counter must reset per item.
  Recommendation: per item, `PLAN_ITEM_MAX_ROUNDS` default 3, and the flow's `max_rounds` becomes a
  safety net for the whole run. This changes an existing field's meaning, so it needs an explicit decision
  before block 13.
- **O3. Does the plan own the queue, or sit beside it?** Block 12 keeps `add-spec` exactly as it is (a spec
  queued without a plan), and `flow plan next` queues through `addFlowSpecs`. If the owner wants every
  dispatch to come from a plan item, `add-spec` should eventually refuse when a plan is imported — that is a
  behaviour change for the existing CLI, so it is a decision, not a default.
