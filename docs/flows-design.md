# Flow engine — design draft (block 01 recon)

**Status:** decisions resolved (see §7) — block 01 closed, implementation starts in block 02.
No code is written against this document yet.
**Scope:** how to build the `flow` pipeline (dev → review → fix) *inside* the existing
ReevesAgents architecture instead of beside it.
**Branch:** `feature/flow-engine`, worktree `~/projects/reevesagents-flow`.

Every claim below is a reference into this tree at `origin/master` + this branch's
uncommitted docs work. Line numbers are exact; if a file moves, the reference is stale
and the design must be re-checked, not trusted.

---

## 1. What already exists and gets reused

| What the pipeline needs | Existing mechanism | Reference | What is missing |
| --- | --- | --- | --- |
| Durable per-run state, atomic writes, a lock | `stateRoot()`, `withRunsLock()`, `atomicWriteJson()`, `writeRun/updateRun`, `writeAgent/updateAgent` | `src/core/runs.ts:37`, `:82`, `:117`, `:267`, `:275`, `:378`, `:386` | Nothing for a pipeline; the lock and the write path are reusable as-is |
| Where state lives | `~/.reeves/runs/<run-id>/{run.json,agents/<id>.json}` | `src/core/runs.ts:41`, `:49`, `:57`, `:61` | No place for pipeline state (see §3) |
| Paste text into an agent | `sendText()` (load-buffer + paste-buffer), `sendKey()`, `pasteTextToPane()` | `src/core/runtime.ts:598`, `:621`, `:146` | **No busy guard**: both are public and will happily write into a working pane |
| Is the agent busy? | `paneLooksReady()` is a *startup* heuristic only | `src/core/runtime.ts:137` | **No busy detector at all**. `attention` (branch `web/attention-badges`, not in `master`: `src/core/attention.ts:17`, `:190`) detects human-blocking modals, which is a different question |
| Read what the agent printed | `peekAgent()` — capture-pane, ANSI-stripped and secret-redacted | `src/core/runtime.ts:579` | No verdict parser; and redaction makes it unusable as a parser input (see §5) |
| A periodic tick to hang the step on | `Runs.tsx` refresh on `setInterval(…, 2000)`; Web SSE poller; MCP `list`; the throttle pattern in the reaper | `src/surfaces/tui/screens/Runs.tsx:77`, `:95`; `src/surfaces/webui/server.ts:148`, `:170`, `:439`; `src/surfaces/mcp/server.ts:334`; `src/core/reaper.ts:170`, `:178` | No flow sweep, no throttle state for one |
| A set of roles inside a run | presets: `PresetSlot`, `savePresetFromRun`, `startRunFromPreset`, `start-preset` | `src/core/types.ts:87`, `src/core/store.ts:135`, `src/core/runtime.ts:429`, `src/surfaces/cli/presets.ts:58` | Presets capture a *run*, they do not designate "this agent is dev, that one is review" |
| Block spec (what a "block" is) | Nothing — block specs live as private files under `specs/`, which is gitignored (`.gitignore:21`) | — | A structured spec model: id, title, goal, requirements, checks, report (§3.2) |
| "A human is needed" signal | approvals: create / list / resolve, with TUI page and MCP tools | `src/core/approvals.ts:27`, `:141`, `:166`, `:192` | Nothing for a pipeline escalation. `attention` is pane-derived, so it cannot carry a flow state |
| CLI scaffolding | per-domain command files registered in one place, `resolveRun/resolveAgent`, `--yes` gate, `--json` idiom | `src/surfaces/cli/index.ts:13`, `:41`; `src/surfaces/cli/helpers.ts:7`, `:17`, `:31`; `src/surfaces/cli/agents.ts:117` | No `flow` commands |
| MCP surface | one `TOOLS` array of schema+handler, `MCP_TOOLS`, `handleAgentMcpTool` | `src/surfaces/mcp/server.ts:220`, `:624`, `:630` | Nothing for flows; the "no loops" wording of the contract needs an explicit amendment (§4.3, D3) |
| Run card / web view model | `WebRun`, `buildWebState()`, derived run status in the TUI list | `src/surfaces/webui/state.ts:42`, `:102`; `src/surfaces/tui/screens/Runs.tsx:111` | No flow field in the view model |
| Config keys with one validator for four surfaces | `DEFAULT_GLOBAL`, `CONFIG_FIELDS`, `setConfigValues` | `src/core/config.ts:12`, `:105`, `:155` | No `flow_*` keys. Note `peek_interval_ms` exists but **no screen reads it** — screens hardcode 5000 (`RunAgents.tsx:21`, `AgentOutput.tsx:20`) |
| i18n for new UI copy | `translate()`, `translatePhrase()`, `locales/en.ts` | `src/i18n/catalog.ts:41`, `:53`; `src/i18n/locales/en.ts:3` | New `flow.*` / `web.flow*` keys in 10 locales |
| Windows package parity | byte-identical copies of three core files, enforced | `packages/reevesagents-win/test/catalog-drift.test.ts:43`; `sync:shared` at `packages/reevesagents-win/package.json:21` | Any edit to `src/core/types.ts` must be synced (§5) |

Two mechanisms exist that are genuinely close to what a pipeline needs, and should be
extended rather than re-invented:

1. **The reaper's throttled-sweep pattern** (`src/core/reaper.ts:170`–`:192`): a module-level
   `lastSweepAt`, a `*Throttled(minIntervalMs, options)` wrapper, and a `reset…Throttle()`
   test seam. Its comment names the exact three tick sites the project considers periodic:
   *TUI refresh, web SSE tick, MCP list*. A flow runner should copy this shape, not invent a
   timer of its own.
2. **Approvals** (`src/core/approvals.ts`): an escalation is *literally* "a human must decide".
   The record, the TUI page, and `list_approvals` / `approve` / `deny` already exist, so an
   escalated flow should raise an approval instead of growing a second notification channel.

---

## 2. Integration points

### 2.1 New core modules (no change to existing behaviour)

| File | Contents | Why a separate module |
| --- | --- | --- |
| `src/core/activity.ts` | `detectPaneBusy(paneText, provider)` per-provider busy detectors (the runtime method of the same name wraps this one), a `DETECTORS` map like `src/core/attention.ts:190` (same unmerged branch) | Busy detection is provider knowledge; it belongs next to the other pane reader, not in the caller |
| `src/core/verdict.ts` | `parseVerdict(paneText)` → `{verdict, notes, count}` | Pure, unit-testable, no tmux |
| `src/core/flow.ts` | `FlowState`, `FlowDefinition`, `tickFlow(flow, ports)` — a pure step | The whole state machine is testable without tmux, git or a clock |
| `src/core/flow-store.ts` | `~/.reeves/flows/<id>.json` read/list/save/delete, atomic, versioned | Own file set and normalizer; it adds **no** second lock — claim/settle use the existing `withRunsLock` (§2.4) |
| `src/core/flow-runner.ts` | `FlowPorts` implemented over `runtime.ts` + git, `sweepFlows()`, `sweepFlowsThrottled()` | The only place that knows both the engine and the runtime |
| `src/core/spec.ts` | Block-spec model and validation, plus the deterministic dispatch-prompt renderer | A spec is data the owner authors; it is validated once at add time, never re-parsed at dispatch |

### 2.2 One required change in the existing runtime

`src/core/runtime.ts` is the project's single agent-I/O path (`sendText`, `sendKey`,
`peekAgent`, `killAgent`, `stopRun`). The missing capability — **"write only when the pane is
free"** — must land here, not in the flow caller:

```ts
type PaneBusyState = 'busy' | 'idle' | 'unknown'   // unknown = no verified detector for this provider
type SendOutcome =
  | { sent: true }
  | { sent: false; reason: 'busy' | 'unknown' | 'stale_pane' | 'unconfirmed' }

runtime.paneBusy(agentId): PaneBusyState        // reads via the injected driver
runtime.sendWhenIdle(agentId, text): SendOutcome // paste → Enter → confirm; never writes when busy or unknown
```

The tri-state is the whole point: a boolean would force the caller to guess what "not busy"
means for a provider nobody has verified, and the guess would be "free".

Rationale: today any caller (CLI `send`, MCP `send_text`, a future flow) can paste into a
working agent, and the paste lands in the provider's *queued input*, which the CLI will then
submit on its own next Enter. Guarding in the caller means the next surface forgets the guard
again. `sendText`/`sendKey` stay untouched for backward compatibility (and because `send` is
documented as "paste only, no submit" in `AGENTS.md`); `sendWhenIdle` becomes the only path
the engine uses.

The gate is **fail-closed**. `paneBusy(agentId)` returns `busy | idle | unknown`, and `unknown`
is treated as busy: `sendWhenIdle` refuses and reports `busy_unknown`. A provider whose busy
indicator has not been verified on a live pane cannot be declared idle from a heuristic, and a
gate that silently answers "free" for an unknown provider is worse than no gate — it looks like
protection. v1 therefore ships an allow-list of providers with a verified marker (the same shape
as `DETECTORS` in `src/core/attention.ts:190`); anything else needs an explicit opt-in
(`flow start --assume-idle`) and the flow records that it runs unguarded. The pane tail is
re-read immediately before the paste, not only at the start of the tick.

### 2.3 Where the step runs

The project already decided this in code: periodic work lives in the surfaces that are
always present, and the Web UI server starts on demand
(`src/surfaces/webui/tui-launch.ts`, referenced from `docs/testing.md` and the development
notes). Concretely:

| Tick site | Reference | Add |
| --- | --- | --- |
| TUI Runs page refresh | `src/surfaces/tui/screens/Runs.tsx:77`–`:98` (already calls `sweepAgentsThrottled`, `sweepOrphanSessionsThrottled`, `autoCleanupRuns`) | `sweepFlowsThrottled()` next to them — **not shipped**: the TUI renders the badge and ticks nothing |
| Web SSE snapshot + `/api/state` | `src/surfaces/webui/server.ts:153`–`:160`, `:439`–`:443` | the same call — **not shipped** either; the Web UI renders the badge and nothing else |
| CLI | `reevesagents flow tick --run <id>` | **shipped**: explicit, scriptable, cron-able, and **the only way to tick a flow today** |
| MCP `list` | `src/surfaces/mcp/server.ts:334` | **deliberately not wired** — see §4.3 |

The two dashboard rows above are the plan, not the branch: nothing in `src/surfaces/tui` or
`src/surfaces/webui` calls `stepFlow`, so neither surface can move a flow, and the guide says so
(review round 4, MINOR on `docs/GUIDE.md`). Wiring a throttled sweep there is the next block's job;
until then a flow that is not ticked from cron or by hand simply stands still.

`flow tick` itself must be idempotent and cheap when nothing changed: a UI tick would call it
every 2 s, so the throttle (a proposal: 15 s, matching `sweepAgentsThrottled`'s default at
`src/core/reaper.ts:179`) keeps `capture-pane` calls bounded once that wiring exists.

**No ticker, no movement.** The SSE hub only runs while a browser is connected
(`src/surfaces/webui/server.ts:170`–`:175`), and the TUI tick only runs while the dashboard is
open — and today neither drives a flow at all. With no cron, a flow simply stands still: it does
not break, and `flow status` shows the last event and the timestamp. `docs/GUIDE.md` says this
plainly and gives the headless recipe (`*/1 * * * * reevesagents flow tick`), because "the pipeline
stopped overnight" is otherwise indistinguishable from "the reviewer is slow". A background worker
is a separate, later decision, not a hidden requirement of this design.

### 2.4 Dispatch protocol — two phases, never a lock across a send

The lock is the **existing** one, `withRunsLock` (`src/core/runs.ts:82`) — the flow store adds no
second lock implementation, because two locks over the same state tree is how ordering bugs are
born. It is **not reentrant**: it creates a lock file, a nested acquisition spins, and after 5 s
(`staleMs`, `runs.ts:85`) it breaks the lock as stale. `sendText`
(`src/core/runtime.ts:598`) calls `updateAgent` (`:605` → `src/core/runs.ts:386`), which takes
that very lock. So "lock the flow → send → save" deadlocks and then resolves by stealing the
lock from itself. It also loses work: a crash between the paste and the save either forgets a
dispatch or lets the next ticker repeat it.

The dispatch is three steps with an explicit intent record in the flow file:

1. **claim** — short lock, no runtime calls: re-read the flow, decide the action, write
   `state.pending = { op_id, target, kind, head, spec_id?, at }`, release.
2. **act** — no lock: `sendWhenIdle(...)`, which may take the runs lock internally.
3. **settle** — short lock: on success write the post-state and clear `pending`; on refusal
   write `dispatch_unconfirmed` / `busy_unknown` and clear `pending`.

Recovery is by observation, never by a blind retry: a `pending` older than `PENDING_TTL`
(**shipped as `PENDING_TTL_SEC` = 120 s**) stops the flow and escalates it with
`dispatch_unresolved`, because the process that took the claim is gone and nobody can tell whether
the paste landed; a human reads the flow and restarts it. The earlier proposal settled such a claim
by looking at the pane ("working" = delivered, otherwise `dispatch_unconfirmed` + `flow resume
--retry`) — that needs the whole decision delta stored in the record to rebuild the post-state, so it
is not in this build: escalating is the answer that cannot send the same prompt twice.
`op_id` makes the settle idempotent, and a concurrent ticker that finds an unexpired `pending` does
nothing at all. This is the only concurrency rule the engine has, and it is what makes a cron
`flow tick` safe to run next to a manual one.

**The claim protects a ticker from another ticker; it does not protect the flow from a human.**
`flow pause` and `flow stop` drop the claim precisely so nothing lands in a pipeline the operator just
stopped, and a check-then-paste alone cannot stop them winning the window between the check and the
send (review round 6 added the check, round 7 closed the window). Three pieces make the act atomic:

1. The runner re-reads the flow **inside the dispatch gate** and pastes only when the `pending`
   `op_id` is still its own and the flow is still live. A claim that is gone, or a flow that is
   `paused`/`orphaned`/`done`, means nothing is pasted and the step answers `cancelled`; a claim that
   survived while the flow was parked is released with a journal line, so a resume cannot inherit a
   send that never happened.
2. The gate (`src/core/flow-dispatch-gate.ts`, `<state dir>/.flow-dispatch.lock`) is held for the
   whole act — verify, paste, settle — not only for a moment, so nothing can be inserted between the
   check and the paste.
3. `pause` and `stop` take the same gate before touching the flow, so they land either before the
   check (the runner sees the claim gone) or after the settle (there is nothing left to cancel),
   never in between. While a prompt is being typed they wait for it (bounded by
   `DISPATCH_GATE_TIMEOUT_MS`, 15 s) and answer "a dispatch is in flight — try again in a moment"
   rather than hanging or pretending they succeeded.

The gate exists because the runs lock cannot do this job: `sendWhenIdle` takes it internally and it is
not reentrant, so holding it across the paste deadlocks (§3.4). It is a **second lock domain with a
fixed ordering — gate first, runs lock second — and no path takes them the other way round**: the
runner writes its claim under the runs lock, releases it, and only then takes the gate; a control
command takes the gate and then the runs lock inside it. A tick that cannot take the gate pastes
nothing, releases its claim and answers `locked`.

**The gate is not a lock file with a takeover — it is Lamport's bakery over files** (rounds 8–12).
Every form of takeover produced the same defect one level down, because POSIX has no *conditional*
removal: stat-then-unlink, renaming the stale file aside, a token keyed by inode, an age-cleared token,
a pid-checked token, and a takeover serialised by a lock that itself expires by age all leave a check
that a second process can invalidate before the removal. So nothing is ever taken over and nothing is
ever removed by someone who did not create it:

- every contender publishes a **ticket** (`<state>/.flow-dispatch.cand.<pid>.<token>`, written to a
  temp file and renamed into place, so no reader sees half of it) whose `ts` is one more than the
  largest ticket it can see;
- before that it raises a live **choosing** marker
  (`<state>/.flow-dispatch.choosing.<pid>.<token>`), so nobody computes "the minimum" while a ticket
  is being selected — without it two contenders could each pick a `ts` the other never saw;
- a contender enters when its own ticket is the smallest live `(ts, pid, token)` and no live marker
  exists. Between that check and its entry nobody can obtain a smaller ticket, which is the mutual
  exclusion the runner and the control commands need;
- a participant that died leaves its files behind, and they are ignored and collected. "Died" is
  decided on the **process instance**, not on the pid alone (rounds 13–14): a recycled pid answers
  "alive" to `kill(pid, 0)`, so a dead contender's ticket could otherwise block the gate for ever and
  a stale choosing marker could make every operation wait out its timeout. Each entry records the pid
  plus a value that never changes for a live process and cannot be repeated by a later one, tagged
  with the probe that produced it: `linux:<starttime>` from `/proc/<pid>/stat` (field 22), or
  `ps:<lstart>` from `ps -o lstart= -p <pid>` on a host without `/proc` (macOS, the BSDs). The tag is
  part of the value, so an entry written under one probe is never read as a different process under
  another — those are simply not comparable and count as alive. One probe per pid per acquisition is
  cached, so a 25 ms poll loop does not spawn `ps` on every pass.
- an entry that records **no** instance at all (written by a build that did not record one) cannot be
  judged, and both guesses are wrong: alive blocks the gate for ever, dead admits a second holder. It
  is reported instead — `gate file … records no process instance (written by an older reevesagents);
  check that no dispatch is running, then remove …` — so the operator decides with the evidence in
  front of them;
- collecting a dead participant's file needs no coordination (it can neither read nor be waited on
  again), so it is the only removal anybody performs; a live contender's ticket and marker are never
  touched;
- the field is only usable if it can be **read** (round 13). A state directory this process can write
  but not list is not an empty field: publishing a ticket into it would enter the gate blind, next to
  a contender it cannot see. The gate probes the directory before writing anything and refuses with a
  named error; a failure after the bid starts withdraws the bid, so no half-finished entry is left.

Release removes this call's own ticket, which is why no token check is needed: the name is unique to
the call and nobody else can own it.

---

## 3. State model: where the pipeline lives

Three candidates were examined against the code, not against taste.

**(a) Fields inside `RunRecord` / `AgentRecord`** (`src/core/types.ts:33`, `:62`).
Rejected:

- those types are **byte-identical copies** in the Windows package
  (`packages/reevesagents-win/test/catalog-drift.test.ts:43` requires
  `src/core/types.ts` ≡ `src/shared/types.ts`), so every flow field becomes a two-repo change;
- run records are re-read on every UI render (`listRuns()` in `Runs.tsx:83`,
  `buildWebState()` in `state.ts:102`) — pipeline history does not belong on that hot path;
- `updateAgent` rewrites the whole record (`src/core/runs.ts:386`), so a tick that touches
  flow state would contend with the runtime on the same file;
- `archiveAndRemoveRun` / `autoCleanupRuns` (`src/core/runs.ts:437`, `:521`) delete the run
  directory wholesale: pipeline state stored there dies mid-flight.

**(b) A file inside the run directory** (`~/.reeves/runs/<id>/flow.json`). Rejected for the
last reason above alone: `autoCleanupRuns` removes stale run dirs on every UI tick, and a
flow whose agents died is exactly a stale run.

**(c) A separate store: `~/.reeves/flows/<flow-id>.json`** — **chosen**.

- Writes are flow-only: a tick never rewrites `run.json` or an agent record, so it cannot
  lose an inbox message (`appendAgentInbox`, `src/core/runs.ts:477`) to a read-modify-write race.
- The file format can evolve with a `version` field and a normalizer, exactly like
  `normalizeRun` (`src/core/runs.ts:159`) and `normalizePreset` (`src/core/store.ts:57`), without
  touching any shared type.
- It is a **child of the run**, not a peer: `run_id` + two agent ids are the foreign keys. A
  flow without live agents is parked, never ticked.
- Cost accepted: the flow dies with the **history record**, not with the run directory. The one
  cascade hook lives in `deleteRunHistory` (`src/core/runs.ts:377`); run archival
  (`src/core/runs.ts:451`) and `autoCleanupRuns` (`:535`) only make the flow `orphaned` (§3.3).

### 3.1 Shape (draft)

```jsonc
{
  "version": 1,
  "id": "…",                     // uuid; the file name
  "run_id": "…",
  "name": "feature-x",
  "roles": { "dev": "<agent-id>", "review": "<agent-id>" },
  "repo": "/abs/git/worktree",
  "max_rounds": 6,
  "review_timeout_sec": 900,
  "review_prompt_template": "…{{HEAD}}…{{COMMITS}}…",
  "specs": [ /* §3.2 */ ],
  "state": {
    "head": "abc1234", "req_head": "abc1234", "req_at": 1730000000000,
    "verdict_count_at_request": 3, "verdict_head": "abc1234",
    "verdict": "CHANGES_REQUESTED", "dispatched_head": "abc1234",
    "dispatched_specs": ["block_01"],
    "rounds_total": 3, "reviews_this_head": 1,
    "pending": { "op_id": "…", "target": "dev", "kind": "fix", "head": "abc1234", "at": 1730000000000 },
    "status": "dispatching"
  },
  // Operator lifecycle (shipped in block 07). Null unless the flow is parked or was stopped by hand.
  "paused_from": "idle",              // where `flow resume` returns to
  "paused_at": 1730000000000,         // epoch ms, so `flow status` can say since when
  "orphan_reason": "the run is no longer in the registry (archived, stopped or swept)",
  "close_reason": "stopped by the operator",
  "log": [{ "at": "…", "event": "fix_dispatched", "detail": "abc1234 round 1" }]
}
```

The shape as this branch writes it is the flat one in `src/core/flow.ts` (`FlowState`): the fields
above plus `schema_version`, `repo`, `roles`, `state`, `rounds`, `max_rounds`, `review_timeout_sec`,
`review_started_at`, `claim`, `specs`, `dispatched_specs`, `pending`, the four lifecycle fields and
the bounded `log`. Every field added after the first release is optional on read, which is why
`schema_version` is still 1.

### 3.2 Block spec — structured from day one (D2)

A block is not a file path; it is a record on the flow, so a dispatch is reproducible and the
brief the dev receives can be inspected without opening a second file:

```jsonc
{
  "id": "block_02",                          // unique inside the flow; the dedupe key
  "title": "Core primitives: busy detection + sendWhenIdle",
  "goal": "One paragraph: what this block must achieve.",
  "requirements": ["…", "…"],                // what to build or change
  "checks": ["pnpm typecheck", "pnpm test"], // commands the dev must run and report
  "report": ["changed files", "commit sha", "check output"],
  "body": "optional full markdown",          // long-form specification, if any
  "source_path": "/abs/block_02.md"          // provenance; optional
}
```

Validation runs at `add-spec` time, not mid-round at 3 a.m.: non-empty `id` and `title` (trimmed,
length-capped), at least one non-empty requirement and one check, every list entry a trimmed
string with a size cap, and `id` unique in the flow *and* absent from
`state.dispatched_specs`. A malformed spec is refused with the field name, never silently
coerced. The dispatch prompt is rendered from these fields by a fixed
renderer (`src/core/spec.ts`), so the dev receives a self-contained brief — title, goal,
requirements, the exact checks to run, the report format — instead of "read this path".

Markdown ingestion is a convenience, not a second contract: `add-spec --markdown file.md` stores
the file as `body`, takes the title from the first heading, leaves `requirements`/`checks`
empty, and records `"unstructured": true`. Such a block is refused unless
`--allow-unstructured` is passed **and** it carries a visible marker in the flow file, the
dispatch prompt starts with an explicit "this block has no structured acceptance criteria"
line, and `flow status` flags it. `report` is a requirement addressed to the reviewer (the dev
must produce it), not something the engine validates — the reviewer is the gate.

**Explicit `null` is a wrong type** (review `d9f66c6`, resolved in `src/core/spec.ts`). JSON has
no `undefined`, so a key that is present was written deliberately: `"goal": null` is not "the field
was omitted", it is a value of the wrong type, and it is reported as
`goal must be a string` exactly like a number or a list where a string belongs. A missing key stays
valid and reads as empty — that is the only "absent" this contract knows, and `readText()`
therefore distinguishes `undefined` from `null` instead of collapsing both into `''`. Silently
reading `null` as empty would make the add-time validator the one place that coerces, which is what
§3.2 forbids everywhere else. `test/spec.test.ts` pins both halves: a present `null` is refused with
its field name, an omitted key is accepted.

**Containment is decided on real paths, not on the spelled one** (review round 5). A relative path
resolves against the flow's project directory and may not leave it, but a lexical comparison is not
enough: `stat` and `read` follow symlinks, so a link inside the project pointing at a file outside it
used to pass the check and copy that file's content into the flow record. `readSpecFile` therefore
resolves both sides with `realpathSync` and compares those: a link that lands outside the project is
refused with `resolves outside the project directory`, a link that stays inside is followed, and a
broken link is reported as a missing spec file (which is what it is). An absolute path is still taken
as written — the caller named that file themselves, and a symlink does not change what they asked
for.

### 3.3 Lifecycle against run archival (D7)

The run lifecycle here is stricter than it looks: `stop` (`src/core/runtime.ts:715`–`:717`) and
`delete-run` (`src/surfaces/cli/history.ts:19`) both call `archiveAndRemoveRun`
(`src/core/runs.ts:451`), which **deletes the run directory** and leaves only a compact record
`~/.reeves/history/runs/<id>.json` (`src/core/types.ts:49`). The panel's "delete archived run"
calls `deleteRunHistory` directly (`src/surfaces/tui/screens/RunHistory.tsx:132` →
`src/core/runs.ts:377`).

So "keep the flow until the run is deleted" resolves to:

| Event | Flow file | Flow status |
| --- | --- | --- |
| run is live | present | normal states |
| run ended / stopped / swept as stale — run dir gone, **history record kept** (`stop`: `runtime.ts:800`, archives at `:835`, `delete-run`: `src/surfaces/cli/history.ts:10`, `delete_run`: `src/surfaces/mcp/server.ts:463`, Web `deleteWebRun`: `src/surfaces/webui/server.ts:396`–`:401`, sweep `autoCleanupRuns`: `runs.ts:535`) | **kept** | `orphaned` — listed, never ticked; `flow status` / `flow stop` only |
| **history record** deleted (`delete-history`: `src/surfaces/cli/history.ts:48`, `delete_history`: `src/surfaces/mcp/server.ts:478`, Web `deleteHistoryRecord`: `src/surfaces/webui/server.ts:402`–`:406`, TUI panel: `src/surfaces/tui/screens/RunHistory.tsx:132`) | **deleted** | cascade hook in `deleteRunHistory` (`src/core/runs.ts:377`) — the single function all four paths funnel into |
| `flow stop --run <id>` | **kept** (block 07) | `done` + `close_reason: stopped by the operator`; a tick sends nothing, `flow status`/`flow logs` still explain it, and `delete-history` is what removes the file |

Note what is *not* in the second row: `delete-run` / `delete_run` / the panel's "delete run" do
**not** delete a history record — they archive the run (the record is written, not removed). A
first draft of this table said otherwise; the review caught it, and the code agrees with the
review (`archiveAndRemoveRun` writes the record at `src/core/runs.ts:455`).

`orphaned` is a status, not an error: `flow status` prints it with the reason (agents gone), the
TUI/Web badge shows it muted, and a tick logs one line and parks instead of throwing every 2 s.

Shipped in block 07 exactly as written here: `flow-runner.ts` reports `run_present` /
`agents_present` from the registry, the engine returns an `orphan` decision, and
`applyDecisionToState` writes `orphaned` plus `orphan_reason` **once** — the next tick holds on
`flow_orphaned` and writes nothing.

The presence probe distinguishes three cases (review round 6), because parking is irreversible from
the engine's side: a **missing run file** is a run that is gone (archiving removes the directory); a
run file that **exists but does not read** is a broken probe, reported as "not seen" (`undefined`),
which the engine refuses to treat as absence — `readRun` answers "Run not found" for both, so
existence is checked first; a **directory that cannot be listed or a role-agent record that does not
parse** is "not seen" as well, which is why the probe uses the failure-aware `tryListAgents` (an
unreadable `agents/` directory is not an empty one); and an agent whose record is still there but has
**ended** (`ended_at !== null`) is not a live pane, so it counts as gone. The cascade
is `deleteFlowFileForRun` called from `deleteRunHistory` (`src/core/runs.ts:377`), inside the runs
lock it already holds; no other path deletes a flow file.

Because the run registry imports the flow store for that cascade, `stateRoot()` moved to
`src/core/state-path.ts` (re-exported from `runs.ts`), so `runs.ts` and `flow-store.ts` are not a
module cycle.

### 3.4 State automaton (what a tick may do in each state)

| Status | Meaning | A tick may | Leaves via |
| --- | --- | --- | --- |
| `idle` | nothing pending, waiting for the dev's next HEAD | request review when HEAD moved | `reviewing` |
| `reviewing` | review requested for `req_head` | record a verdict, log a timeout once | `fixing` / `accepted` / `escalated` |
| `dispatching` | a claim is out (`pending` set, send in flight) | nothing — another ticker owns it | `pending` cleared by settle, or by a control command (`pause`/`stop`), in which case the runner re-checks the claim before pasting and answers `cancelled` |
| `fixing` | fix request delivered | request review for a new HEAD | `reviewing` |
| `dispatch_unconfirmed` | the paste/Enter did not visibly start the agent | nothing without a human | `flow resume --retry` (one explicit retry) |
| `accepted` | reviewer said ACCEPT, no spec left | nothing but `need_spec` once | `flow add-spec` → next tick dispatches |
| `escalated` | round budget spent | nothing | `flow resume` or an approved escalation approval |
| `paused` | operator stopped it | nothing | `flow resume` |
| `orphaned` | the run's agents are gone (run archived) | nothing | `flow stop`, or the history record's deletion deletes the file |

Two invariants make the table safe: a transition is written only inside a short lock
(§2.4), and no state re-sends the same text for the same `(head, verdict, spec_id)` — the
`dispatched_*` keys are the memory that survives a crash.

**The table is code, not prose (block 07).** `FLOW_TRANSITIONS` in `src/core/flow.ts` lists the
allowed target of every state, `assertTransition` refuses anything else with the state named
(`cannot pause a flow in state done (this flow is closed; start a new one with \`flow start
--replace\`)`), and both the operator commands (`applyOperatorTransition`) and the engine's own
writes (`applyDecisionToState`) go through it. `done` is terminal: no pair leaves it. A paused flow
records `paused_from` and `paused_at`, and `resume` returns it there — never to "the beginning".
Pausing drops an unsettled claim, so a resume cannot inherit a send that would later escalate.

**The journal.** The `log` array *is* the journal `flow logs` prints: a ring buffer capped at
`FLOW_LOG_LIMIT` (50) entries, each `{ at, event, detail }` where `detail` is the reason, the HEAD
prefix, the block id or a short refusal — never a prompt body and never an absolute path. Events a
reader will meet: `flow_started`, `flow_paused`, `flow_resumed`, `flow_stopped`, `flow_orphaned`,
`dispatch_claimed`, `dispatch_refused`, `dispatch_unconfirmed`, `request_review`, `dispatch_fix`,
`dispatch_spec`, `spec_queued`, `escalate`.

**Rules that make the store safe (3.1–3.4):**

- **Atomic and private, with no fallback**: temp file + rename, mode 0600, following
  `src/core/runs.ts:117`–`:123` (which has no fallback). Deliberately **not** the
  `src/core/store.ts:21`–`:31` variant: its `catch` writes the target file directly, so a crash
  during that fallback leaves torn JSON where a reader expects a whole document. For a flow file
  a failed rename must fail the save, and the caller reports it — losing one tick is cheaper than
  losing the state.
- **Locked, but never across a send**: state transitions use the existing global lock
  (`withRunsLock`, `src/core/runs.ts:82`) in short claim/settle sections, the paste itself happens
  outside it — `withRunsLock` is not reentrant and `sendText` takes it internally (§2.4) — and the
  act is serialised by the *dispatch gate* instead (`src/core/flow-dispatch-gate.ts`). Two lock
  domains, one ordering: **gate → runs lock**, never the reverse. The runs lock stays coarse but
  correct for a 25 ms section; the failure mode of holding it across a send is a self-deadlock, not
  a slow tick.
- **Idempotent by construction**: every dispatch carries an `op_id` and is keyed on
  `(target, kind, head, verdict, spec_id)`, recorded *before* the send and settled after it, so a
  second ticker cannot re-send the same request and a crash cannot lose it silently.
- **Self-healing reads**: missing fields fall back to defaults; a damaged file is reported as
  `flow state is not valid JSON: <path>` by `flow status <id>`, and the plain listing prints a
  `corrupt <path>` row instead of hiding it — a dashboard skips it so one bad file cannot break
  the board, but a human always sees that it exists. `flow stop <id>` deletes a corrupt file by
  id, since it can never be read again.
- **The budget is cumulative** (`max_rounds` → `state.rounds_total`): it counts fix dispatches
  for the whole flow and is *not* reset when a new HEAD goes to review. A separate
  `reviews_this_head` counter bounds re-reviews of one HEAD. `resume` resets `rounds_total`
  explicitly and logs that it did — a human granting a new budget is a decision, not a side
  effect of a commit.
- **One active flow per run** in v1. "Active" means a flow attached to a live run in any status
  except `paused`/`escalated`/`orphaned`; those three still occupy the slot while the run is
  live (a second `flow start` is refused), and `orphaned` flows never block a fresh start on a
  *new* run. Two flows over the same run would write into the same panes and both claim the
  HEAD.

### 3.5 What block 03 ships, stated against the table above

The engine landed first as the smallest honest subset: **five** statuses
(`idle`, `reviewing`, `fixing`, `escalated`, `done`), the cumulative budget, the claim and the
verdict counter. The mapping to §3.4, so the next block does not have to guess:

| §3.4 status | this build |
| --- | --- |
| `idle` | `idle` — waiting for the dev's next HEAD |
| `reviewing` | `reviewing` |
| `fixing` | `fixing` — a fix round was dispatched, waiting for the new HEAD |
| `accepted` | `done` — ACCEPT and no queued block; nothing is sent, the flow stops |
| `escalated` | `escalated` — the round budget is spent; an approval pickup is not wired yet |
| `dispatching` / `dispatch_unconfirmed` / `paused` / `orphaned` | **not yet** — a dispatch in flight is the `pending` claim on the state, not a status of its own (§2.4, shipped in review round 4) |

What is deliberately *not* in this build, and must not be assumed by the next block:

- the `pending`/`op_id` claim (§2.4) **is** in the build: a tick writes the dispatch it is about
  to send before it pastes, a tick that finds an unsettled claim does nothing, and a claim nobody
  settled within `PENDING_TTL_SEC` escalates with `dispatch_unresolved` instead of being re-sent.
  A status called `dispatching` would be a second way to say the same thing, so there is none;
- `dispatched_specs` and the verdict baseline still stop a duplicate *block* dispatch after a
  settle, which is what covers the case where the claim is already gone;
- an ambiguous paste (the text landed, the submit was not confirmed) consumes the verdict and logs
  `dispatch_unconfirmed`, but has no status of its own: the next tick sees the consumed baseline
  and does not paste again, and a human reads the log;
- `paused`, `orphaned`, the `flow-escalated` approval and the `add-spec` CLI arrive with the
  surfaces and the approval pickup, so a flow file is written by the engine's tests and by the
  next block, not by a command yet.

The review **timeout** is implemented, because "wait for a verdict" without a deadline is a flow
that hangs on a crashed reviewer: `review_started_at` (epoch ms) is stamped by the review request,
`review_timeout_sec` defaults to `REVIEW_TIMEOUT_SEC` (900, §3.1) per flow, and a tick that finds no
new verdict past the deadline moves to `escalated` with reason `review_timeout` — no send, no round
counted, a human decides. The deadline is evaluated **before** the blind spots a tick may have: an
unreadable reviewer pane, and an unreadable HEAD. Both are ways a hang presents itself, so neither
may extend a deadline that has already expired; before it expires they still hold the flow, and
`idle`/`fixing` keep refusing to act on a HEAD they cannot read. A state that carries no clock (written before the field existed) is
stamped on the first pass instead of waiting forever, and a dispatch that was not confirmed keeps
the running clock rather than restarting it.

One consequence worth stating plainly: a fix or a block is dispatched **only** into a pane the
gate classified as `idle` on this tick, and a review is requested only when the dev's own pane is
idle and the tree is clean — reviewing a commit the dev is still building on spends a round on a
moving target.

---

## 4. How it meets the surfaces

### 4.1 CLI (`src/surfaces/cli/flow.ts`, registered in `index.ts:41`–`:71` so `--help` order stays intentional)

Planned shape and what ships today (`shipped` = in this branch, `planned` = not written):

```
reevesagents flow start  --run <id> --dev <agent> --review <agent>                # shipped (round 4)
    [--repo <dir>] [--max-rounds 6] [--review-timeout 900] [--spec <file…>] [--replace] [--json]
reevesagents flow status --run <id> [--json]                        # shipped
reevesagents flow tick   --run <id> [--json] [--dry-run]            # shipped
reevesagents flow add-spec --run <id> [--file <spec.json…>] [--markdown <file…>] [--json]  # shipped
reevesagents flow pause  --run <id> [--json]                        # shipped
reevesagents flow resume --run <id> [--json]                        # shipped
reevesagents flow stop   --run <id> [--yes] [--json]                # shipped
reevesagents flow logs   --run <id> [-n N] [--json]                 # shipped
```

`start` is the only way a flow is created (§4.6): it resolves the run and both agents, refuses an
agent that belongs to another run, refuses a second flow on a run with an active one, and replaces a
closed one only with `--replace`. It writes the file and sends nothing.

`add-spec`, `pause`, `resume`, `stop` and `logs` are the operator's controls (block 07), and all of
them live in `src/core/flow-control.ts` so the CLI and the MCP cannot drift: `add-spec` validates
every file before it takes the lock (one bad path queues nothing), `--markdown` is the explicit
unstructured downgrade and prints a warning, `pause` parks the flow and drops an unsettled claim,
`resume` returns it to the state it was paused from (an escalated flow gets a fresh budget, logged),
`stop` needs `--yes` and closes the flow as `done` with a reason, and `logs` prints the bounded
journal tail. None of them sends into a pane.

`status` and `tick` take the run id (`--run`, unique prefix accepted) because a flow is keyed by
its run; the flow file itself is `~/.reeves/flows/<run-id>.json`.

Conventions taken from the neighbouring command files: `resolveRun`/`resolveAgent` for
prefix matching (`src/surfaces/cli/helpers.ts:7`, `:17`), `requireDestructiveConfirmation` for
anything irreversible (`:31`), `console.error(message)` + `process.exit(1)` for a clean
failure (`src/surfaces/cli/agents.ts:54`–`:55`), and stable `--json` payloads (`:117`).

`--json` output is a published surface, so it follows the record rules:

- secret-looking values pass through `redactSecrets` (`src/core/redact.ts`, already applied to
  agent tasks at `src/core/runs.ts:222`). That covers more than the log: a queued block's **title**
  is user text and goes through the same redactor in the payload and in the MCP answer, while the
  flow file keeps the author's text — the payload is a view, the document is the record;
- the review prompt template is **summarised** (length + whether the `{{HEAD}}`/`{{COMMITS}}`
  tokens are present), never dumped: its text is repository-authored and may carry private
  instructions;
- paths: the flow file stores absolute paths because git needs them, but **every payload renders
  them home-shortened** — anything under `$HOME` prints as `~/…`, so a transcript never carries
  `/home/<user>/…`. A path the caller passed is echoed the way the caller wrote it (a relative
  argument stays relative), never silently expanded. An **error** is stricter, because a host may
  quote it verbatim: `displayPath` renders a path under `$HOME` as `~/…` and a path outside it as its
  last component only (`run-1.json`, never `/srv/deploy/registry/flows/run-1.json`), since the parent
  chain of an outside path is deployment layout the reader did not ask for while the component still
  names what failed. Errors are covered by the same rule: a spec
  file that cannot be read is named `~/…` in the message, because an MCP host quotes that message
  into its own transcript. The rule covers **error messages** as well as
  payloads: `flow status` on a damaged file names it as `~/.reeves/flows/<id>.json`, and
  `src/utils/paths.ts` is the single implementation both sides use, so the shorthand cannot drift
  between the store that knows the path and the command that prints it. An fs failure is reported
  by its error code (`ENOENT`, `EISDIR`), never by the raw message: node embeds the absolute path it
  failed on — including the `.tmp` name — and repeating that would undo the shorthand in front of
  it. If an error carries no code, its text is cut at the first path separator and marked `<path>`;
  scrubbing word by word is not enough, because a path may contain spaces.

The same payload shape feeds the MCP tools, so both surfaces obey one redaction rule.

### 4.2 TUI

- **Runs list**: one derived flow badge per run row, computed the same way the run status is
  derived today (`src/surfaces/tui/screens/Runs.tsx:111`–`:115` maps `computeRunStatus`,
  `src/core/runs.ts:373`). Nothing is stored in the record.
- **Run page**: a `Flow` section beside `Actions`/`Lifecycle`
  (`src/surfaces/tui/screens/run/Run.tsx:196`, `:229`): status, rounds, HEAD, queue depth,
  last event, and the actions the CLI already offers.
- Copy goes through `translate()`; new keys `flow.*` in `locales/en.ts` and the nine other
  locales.

What the runs list ships (`src/core/flow-view.ts` + `src/surfaces/tui/screens/Runs.tsx`): one
badge per run row read from the flow file on every tick — `flow: review (2/6)` where the row has
room, the bare `flow: review` below ~96 columns so it cannot wrap the row at 80x24, and
`flow: escalated` / `flow: done` without a ratio because the budget is spent or irrelevant. A run
without a flow has no badge at all.

Attention reuses the product's existing warn signal instead of adding a widget: an `escalated` flow,
and a `reviewing` flow past `review_timeout_sec`, colour the badge with `colors.status.warn`, add an
`attention` counter to the frame header and a `needs attention` legend entry. Both are computed on
read (`flowBadge(state, now)`) with the same `>= timeout` comparison the tick uses, so the badge can
never claim "overdue" while the engine still waits. Nothing is written to `task_status` or any other
lifecycle field: `test/screens/FlowBadge.test.tsx` renders an escalated flow, swaps it for a closed
one, and asserts both the badge going away and the run/agent records being byte-identical.

### 4.3 MCP — full control, with an explicit contract amendment (D3)

The owner's decision: an MCP host must be able to *drive* a flow, not only read it. That
changes a written contract, so the change is deliberate and recorded:

- Today `src/surfaces/mcp/server.ts:1`–`:14` and `.github/CONTRIBUTING.md:59` say the MCP stays
  flat: *"no roles, autonomous loops, or coordination protocol"*. The amendment keeps the
  spirit and narrows the letter to **no implicit loops**: the server never starts a timer or a
  loop of its own, every step is an explicit call by the host, and the flow engine owns the
  loop. `.github/CONTRIBUTING.md:59`, the `server.ts:1`–`:14` header and `docs/mcp.md` are
  edited in the same commit as the tools.
- Tools follow the one-entry-per-action convention of `server.ts:220`:

| Tool | Effect | Notes |
| --- | --- | --- |
| `list_flows` | every flow with status, rounds, HEAD, queue depth | read-only |
| `flow_status` | one flow plus its recent log | **shipped**, read-only |
| `flow_start` | attach a flow to an existing run (`run_id`, `dev`, `review`, `repo`, `review_prompt`) | **shipped**; validates like the CLI; refuses a second flow on the same run (D6) |
| `flow_add_spec` | queue a block spec file | **shipped**; same validator as §3.2, takes a JSON or markdown path |
| `flow_step` | one engine step (the `flow tick` equivalent) | **shipped** (block 07); shares the claim protocol, so an MCP step and a cron tick cannot paste twice |
| `flow_control` | `action: pause \| resume \| stop \| add_spec` | **shipped** (block 07); one tool, four intents, so the surface does not grow four near-identical entries. `stop` needs `confirm: true` |

- Guardrails, because a host holding these tools can spend money: `flow_step` answers
  `{changed: false, events: []}` when nothing happened, so an agent polling it in a loop is cheap
  and visible in its own transcript. `flow_step` is **not** the exclusive owner of a flow: the
  claim protocol (§2.4) makes a step from the MCP, a step from the TUI tick and a step from cron
  mutually exclusive, and a step that finds an unexpired `pending` returns `{changed: false,
  reason: "busy"}` instead of queueing work. Round, timeout, escalation and the pane guard live
  in the engine, never in the tool, so no surface can talk its way past them.
- `flow_control` is the one place where an `action` enum is used instead of one tool per
  action; splitting it into `flow_pause` / `flow_resume` / `flow_stop` is equally defensible and
  can be revised in review.
- Every tool returns the redacted, path-summarised shape of §4.1 — the MCP transcript is a log,
  and a review prompt or a repository path in it is a leak with no upside.

### 4.4 Web UI

- `WebRun` (`src/surfaces/webui/state.ts:42`) gains `flow?: { status, rounds, max_rounds,
  head, queue, last_event }`; `buildWebState()` (`:102`) joins it from the flows store.
- The card's status slot shows it; new `web.flow*` keys must exist in
  `locales/en.ts` because `test/i18n.test.ts:48`–`:59` reads every `'web.*'` key out of
  `src/surfaces/webui/client/app.js` and fails the build otherwise.

### 4.5 Escalation rides the approvals mechanism

On `escalated` (round budget spent), the runner calls `createRunApproval`
(`src/core/approvals.ts:141`) with `action: "flow-escalated"`, the flow id and the review notes
in `details`. The human decision already has a UI (`Approvals` page, `list_approvals`,
`approve`/`deny`). No new notification channel, no second "needs attention" concept.

What exists today is only the *record*: `resolveRunApproval` (`src/core/approvals.ts:192`)
writes the decision and knows nothing about flows, and it should stay that way — approvals are a
generic mechanism. The reaction belongs to the runner, on its next tick: it looks for a resolved
`flow-escalated` approval belonging to this flow, and then

- `approved` → `resume` with a fresh round budget, log `resumed_by_approval`;
- `denied` → park as `paused`, log `denied_by_approval`.

The engine stays the only writer of flow state, and a tick is the only thing that reads a
decision — which also means an escalation is picked up by the same headless `flow tick` recipe
as everything else (§2.3).

### 4.6 Surfaces: shipped vs planned (state of the branch)

| Surface | State |
| --- | --- |
| Engine, store, CLI `flow status` / `flow tick` | **shipped** (`src/core/flow.ts`, `flow-store.ts`, `flow-runner.ts`, `src/surfaces/cli/flow.ts`) |
| The `pending`/`op_id` dispatch claim (§2.4) | **shipped** (`flow.ts` claim/release, `flow-runner.ts` claim -> act -> settle); a claim nobody settled escalates with `dispatch_unresolved` |
| CLI `flow start` | **shipped** (`src/core/flow-start.ts`, `src/surfaces/cli/flow.ts`) |
| TUI runs-list badge + attention | **shipped** (`src/core/flow-view.ts`, `src/core/flow-label.ts`, `src/surfaces/tui/screens/Runs.tsx`) |
| Web run-card badge + attention | **shipped** (`src/surfaces/webui/state.ts` `WebRun.flow`, `client/app.js`, `client/app.css`) |
| MCP `flow_status`, `flow_add_spec`, `flow_start` | **shipped** (`src/surfaces/mcp/server.ts`); no tool here ticks a flow on its own |
| MCP `flow_step` | **shipped** (block 07) — one explicit step per call, same claim protocol as `flow tick`, answers `{changed:false, reason}` on a hold |
| MCP `flow_control` | **shipped** (block 07) — `pause` / `resume` / `stop` (needs `confirm`) / `add_spec`, answers the status payload |
| CLI `flow add-spec` / `pause` / `resume` / `stop` / `logs` | **shipped** (block 07) |
| TUI Flow section on the run page (§4.2) | **not implemented** — the badge and attention exist, the detail section does not |
| `flow-escalated` approval pickup (§4.5) | **not implemented** — an escalation is a state, a human sees it, nothing raises an approval yet |
| `paused` / `orphaned` + the transition table | **shipped** (block 07) — `FLOW_TRANSITIONS` gates every operator and engine transition; `paused` is inert (a tick observes nothing and sends nothing), `orphaned` is written once with its reason, and the only automatic deletion is the cascade in `deleteRunHistory` |
| Journal (`flow logs`) | **shipped** (block 07) — the bounded `log` array (`FLOW_LOG_LIMIT` = 50) is the journal: event, time, head, short reason, never a prompt body |
| Review prompt template stored per flow | **not implemented** — the request is rendered by a fixed renderer with the same tokens |

Nothing above is described as working elsewhere in this document: the tables and the sections it
cites keep `planned` marking, so the next block starts from the truth.

---

## 5. Risks and contract changes

| Risk | Where it bites | Mitigation |
| --- | --- | --- |
| Touching `src/core/types.ts` | `packages/reevesagents-win/test/catalog-drift.test.ts:43` fails until `sync:shared` runs and the copy is committed | Keep **all** flow types in `src/core/flow.ts`; add nothing to `types.ts` |
| New config key | `test/config-set.test.ts:22`–`:27` pins the exact `CONFIG_FIELDS` order | If `flow_tick_ms` / `flow_max_rounds` are added, extend `DEFAULT_GLOBAL` (`config.ts:12`), `mergeDefaults` (`:45`, merge block `:54`–`:64`) and that test in the same commit |
| `peek_interval_ms` is decorative | No screen reads it; screens hardcode 5000 (`RunAgents.tsx:21`, `AgentOutput.tsx:20`) | Do not advertise "the flow tick follows `peek_interval_ms`". Either wire it as a separate chore or add a dedicated key |
| **Writing into a busy pane** | `sendText`/`sendKey` have no guard (`runtime.ts:598`, `:621`) | `sendWhenIdle` in core (§2.2), fail-closed for providers without a verified marker; a unit test asserts zero sends against a busy pane and a refusal for `unknown` |
| **A bypassable round budget** | With `rounds` reset per HEAD, a normal cycle never reaches `max_rounds` and `escalated` is unreachable | Cumulative `rounds_total` + `reviews_this_head` (§3.1); escalation tested by the engine tests, not by hand |
| **Self-deadlock on the runs lock** | `withRunsLock` is not reentrant and `sendText` takes it (`runs.ts:82`, `runtime.ts:605`) | Two-phase claim/settle, never a lock across a send (§2.4); `pending` + `op_id` make a crash recoverable |
| **The second Enter** | The bash prototype sent a second Enter when the pane did not look busy. This is the documented project hazard: a queued Enter later answers someone else's prompt | Never blind-retry. Paste → one Enter → confirm busy; if not confirmed, record `dispatch_unconfirmed`, do not re-send, surface it. (D5) |
| Torn flow state after a failed write | `src/core/store.ts:28`–`:30` degrades to a direct write when rename fails; copying that pattern can leave half a JSON document | The flow store follows `src/core/runs.ts:117`–`:123`: no fallback, the save fails loudly (§3.1) |
| Private text in `--json` / MCP output | The review prompt is repository-authored content; absolute paths leak the home layout | Summarise the template, redact via `redactSecrets`, keep caller-given paths (§4.1, §4.3) |
| Verdict parsing on redacted text | `peekAgent` strips ANSI *and* redacts secrets (`runtime.ts:579`) | Parse a raw capture. Either add `peekAgentRaw` or make the parser tolerate `[redacted]`; decide before writing the parser |
| **The MCP contract changes** | `.github/CONTRIBUTING.md:59` promises a flat MCP; six flow tools that can start/step a pipeline contradict the old wording | Amend the sentence to "no implicit loops" in the same commit as the tools (§4.3, D3), and say it in `docs/mcp.md` |
| Structured specs are authoring work | A spec with empty `requirements`/`checks` produces a vacuous brief, and validation only catches it at add time | Validate hard (§3.2), keep `--markdown` explicitly downgraded, and show a full example in `docs/flows.md` |
| Flow outlives its run directory | `archiveAndRemoveRun` (`runs.ts:437`) removes the run dir; a naive cascade would delete the flow on every `stop` | Cascade only in `deleteRunHistory` (`runs.ts:367`); `orphaned` status otherwise (§3.3, D7) |
| Two tickers (TUI + cron + MCP) | Duplicate prompts, double round counting | Claim protocol: an unexpired `pending` makes every other ticker a no-op (§2.4); `dispatched_*` keys survive a crash |
| Run removed under a live flow | `autoCleanupRuns` (`runs.ts:521`) deletes stale run dirs on every UI tick | `Agent not found` parks the flow as `orphaned` with one log line instead of throwing every tick |
| Cost | Every send spends provider tokens | `max_rounds`, `review_timeout_sec`, 15 s throttle, and no send while busy |
| i18n surface | 10 locales × new keys, plus the commands table in `README.md:130`–`:160` and the nine translated READMEs under `docs/i18n/` | Budget it in the surfaces block, not as an afterthought |
| `AGENTS.md` is protected | Hermes' write guard blocks edits to it | Flow documentation goes to `docs/` only |

---

## 6. Block plan

| Block | Deliverable | Definition of done | How it is verified |
| --- | --- | --- | --- |
| **01 — recon (this)** | `docs/flows-design.md` | Decisions recorded in §7; no code written | Reviewed read-only by a second model (this document) |
| **02 — core primitives only** | `src/core/activity.ts` (busy per provider + fail-closed allow-list), `verdict.ts`, `spec.ts` (model + validator + prompt renderer), `runtime.paneBusy` / `sendWhenIdle`; no flow yet | Existing behaviour unchanged; a busy or unknown pane is never written to; a malformed spec is refused at add time | `pnpm typecheck && pnpm lint && pnpm test` green, plus new unit tests: busy markers per provider, refusal against a busy pane, one-Enter-and-confirm, verdict/notes parsing |
| **03 — engine + store + CLI** | `flow.ts` (cumulative budget + §3.4 automaton), `flow-store.ts`, `flow-runner.ts` (claim/settle dispatch, approval pickup), `src/surfaces/cli/flow.ts` (structured `add-spec`), `orphaned` lifecycle, TUI tick wiring only | A full ACCEPT → next dispatched spec runs end-to-end on a temp registry with real tmux fake agents; three concurrent tickers produce exactly one send, and a repeated verdict for the same HEAD sends exactly once; a crashed claim is recovered by observation, never by a blind retry; an orphaned flow survives archival and dies with the history record | `vitest run test/flow*.test.ts` + the real-tmux rehearsal script + `pnpm verify`; i18n untouched (CLI copy is English, like every other command) |
| **04 — surfaces + contract** | TUI Flow section + run badge, `WebRun.flow` + card + `web.flow*` in 10 locales, the six MCP flow tools **and** the `CONTRIBUTING.md:59` / `server.ts:1`–`:14` / `docs/mcp.md` amendment, `flow-escalated` approval, `docs/flows.md` + README command table | The state is visible without reading a JSON file; a human can resolve an escalation from the existing Approvals page | `pnpm verify`, `pnpm check:package`, manual TUI pass (narrow terminal too), Web UI pass with a fresh browser tab |

Each block is one commit with an English conventional message; `AGENTS.md` stays untouched;
nothing is pushed to the fork without an explicit go-ahead.

---

## 7. Decisions (owner, block 01)

| # | Question | Decision | Consequence in this design |
| --- | --- | --- | --- |
| D1 | Attachment vs peer | **Child of a run** | `run_id` + two agent ids are the keys; a flow never outlives its run record (§3.3) |
| D2 | What is a "block"? | **Structured spec now** | `specs[]` on the flow, validated at add time, dispatch prompt rendered from fields (§3.2) |
| D3 | MCP control? | **Yes — control, not only read** | six tools including `flow_step`; contract amended to "no implicit loops" (§4.3) |
| D4 | Escalation surface | **Reuse `RunApproval`** (recommendation accepted) | `flow-escalated` approval: `approve` resumes, `deny` parks (§4.5) |
| D5 | Second Enter | **Forbidden** (recommendation accepted) | paste → one Enter → confirm; an unconfirmed dispatch is logged, never re-sent (§5) |
| D6 | Several flows per run | **One dev/review pair per run in v1** (recommendation accepted) | `flow_start` refuses a second active flow on the same run |
| D7 | Retention | **Keep while the run record exists; delete when the run is deleted** | `orphaned` after archival, cascade in `deleteRunHistory` (`src/core/runs.ts:377`) (§3.3) |

Work these decisions create:

- **Contract edits** (block 04, same commit as the MCP tools): `.github/CONTRIBUTING.md:59`, the
  `src/surfaces/mcp/server.ts:1`–`:14` header, `docs/mcp.md` — "no implicit loops: the server
  never starts a timer or a loop of its own; a host may drive a flow with explicit calls".
- **Specs are first-class** (D2): the validator ships before any surface accepts a spec, and
  `docs/flows.md` carries a complete worked example.
- **One new status** (D7): `orphaned` enters `flow status`, the TUI badge and the Web card; it is
  never ticked.

---

## Appendix — state of the branch

`feature/flow-engine` now carries this design document and nothing else on top of
`origin/master` (`39ce3ac`). The throw-away `flow` implementation written before the recon
(`src/core/flow.ts`, `src/core/flow-store.ts`, `src/surfaces/cli/flow.ts`, `test/flow.test.ts`,
`docs/flows.md`) was **dropped from the branch by the owner's decision** — it was never a
baseline, it put the busy heuristic in the CLI layer, and it is superseded by §2 of this
document. Its review survives as Appendix C, because the findings were real and two of them
changed the design.

---

## Appendix B — review round 1 (block 01)

Reviewed read-only by a second model (Codex, agent `agents-review`, run `reevesagents-flow`) at
commit `dafac03`. Verdict: **reject** — four blocking items. All four were checked against the
code before acceptance; all four were accepted and are fixed in this revision.

| Blocking item | Verdict on it | Fix |
| --- | --- | --- |
| D7 conflated archiving with deletion: `delete-run` does **not** delete a history record | **Correct.** `src/surfaces/cli/history.ts:19` archives; `delete_history` (`src/surfaces/mcp/server.ts:465`) and the panel (`RunHistory.tsx:132`) delete | §3.3 rewritten with every path and its reference; cascade stays in `deleteRunHistory` (`runs.ts:367`) |
| `max_rounds` resets per HEAD, so a normal cycle never escalates | **Correct**, and it was the weakest part of the draft | Cumulative `rounds_total` + `reviews_this_head`, resume makes a new budget explicit (§3.1) |
| Holding `withRunsLock` across a send self-deadlocks (`sendText` → `updateAgent` takes the same non-reentrant lock) and a crash between send and save loses or duplicates the dispatch | **Correct and serious** | Two-phase claim/settle with `pending` + `op_id` and observation-based recovery (§2.4) |
| The busy gate is permissive for a provider with no marker | **Correct** | Fail-closed tri-state `busy / idle / unknown`, allow-list, explicit `--assume-idle` opt-in (§2.2) |

Non-blocking items accepted: a formal state automaton (§3.4), a recovery/visibility policy for
a corrupt flow file (§3.1), a definition of "one active flow" (§3.1), `report` described as a
reviewer requirement rather than an engine guarantee (§3.2), stronger spec validation and a
visible marker on unstructured blocks (§3.2), raw-capture parsing confined to the parser with
redaction on everything that is logged (§5), and "who reacts to the approval" spelled out
(§4.5).

Deferred on purpose: a background worker (documented as a later decision, §2.3), wiring
`peek_interval_ms` (separate chore), and the exact splitting of `flow_control` into three tools
(left to implementation review).

---

## Appendix C — review round 2: the prototype code (CHANGES_REQUESTED → resolved)

While this design was being finalised, a second read-only review ran against the branch HEAD
that still contained the prototype (`5182a12`, before the rebase). Verdict:
**CHANGES_REQUESTED** — four blockers, two majors, two minors, all of them about the prototype
code, none about this document.

| Finding | Status | Where the design answers it |
| --- | --- | --- |
| BLOCKER: the CLI still sends a second Enter when no busy marker appears | Real; the prototype copied the bash loop | D5 + §2.2: one Enter, confirm, `dispatch_unconfirmed` — never a retry |
| BLOCKER: an unknown busy marker counts as a free pane, and there is no runtime gate between check and send | Real | §2.2 fail-closed tri-state in `runtime`, no caller-side gate at all |
| BLOCKER: the send happens inside the state step, before the state is saved, without claim/settle — a parallel tick or a crash re-sends | Real, and the deepest one | §2.4 claim → act → settle with `pending`/`op_id` and observation-based recovery |
| BLOCKER: rounds reset on a new HEAD and on resume, so the limit is bypassed | Real | §3.1 cumulative `rounds_total` + explicit budget on `resume` |
| MAJOR: the store falls back to a direct write when rename fails, so a crash can leave torn JSON | Real, and it warns against copying `store.ts`'s pattern | §3.1 "no fallback"; the flow store follows `runs.ts:117`–`:123` |
| MAJOR: `status --json` emits the review template unredacted and expands absolute paths | Real | §4.1 / §4.3 payload hygiene: summarise the template, `redactSecrets`, keep caller-given paths |
| MINOR: the idempotency test never covers a repeated verdict for the same HEAD | Real | Block 03 definition of done now requires "a repeated verdict for the same HEAD sends exactly once" |
| MINOR: the full suite reported 39 failures (EPERM on git and the loopback server) | **Environment, not code**: the reviewer ran in a sandbox without those permissions. The same suite on this machine is green (90 files, 746 tests after the prototype was dropped; 91/775 while it was still in the tree) | No design change; recorded here so a later reader does not re-chase it |

The prototype was dropped instead of patched: every one of its blockers is a *design* decision
that this document now makes explicitly, and rewriting the prototype to match would be block 02's
job, done once, against the reviewed design.

### Round 3 — the fixes above, verified

The first patch after round 2 was itself reviewed and came back **CHANGES_REQUESTED** with three
internal contradictions, all of them fair:

| Open item | Fix |
| --- | --- |
| §2.2 mandates a tri-state gate, but the documented signature still returned `boolean` | §2.2 now declares `PaneBusyState` and `SendOutcome` (`busy`/`idle`/`unknown`, and a refusal reason), so no caller can collapse "unknown" into "free" |
| §2.1 said the store has its own lock domain while §2.4 used the shared `withRunsLock` | One lock, named once: the flow store adds no second lock; claim/settle use `withRunsLock` for short sections (§2.1, §2.4). *(Round 7 added one deliberate exception — the dispatch gate around the act, §2.4 — which is not a store lock and has a fixed ordering against `withRunsLock`.)* |
| Paths: the rule only covered "as the caller wrote it", so an absolute argument still leaked an absolute home path | §4.1 now states the full rule: absolute paths are stored, every payload renders them `~/…`-shortened, a caller's relative argument stays relative |

A name clash the review did not name but the rule implies was also removed: the pure detector in
`activity.ts` is `detectPaneBusy`, the runtime method is `paneBusy`.

---

## Appendix D — review round 4 on the shipped branch (CHANGES_REQUESTED → resolved)

The review of `0675780` (block 05) came back **CHANGES_REQUESTED** with two majors and one minor,
all against the branch, none against the intent of this document. Each one is answered in code, and
each is recorded here because the same design said so and the build had drifted from it:

| Finding | Verdict | Where it is fixed |
| --- | --- | --- |
| MAJOR `src/core/flow-runner.ts:134` — two `flow tick` processes can paste the same prompt twice: the decision was saved only *after* the send finished, and nothing was written before it | Real, and it is exactly §2.4 | `pending`/`op_id` claim in the flow file, written under `withRunsLock` before the paste; `stepFlow` is now claim → act → settle, the act holds no lock, the settle applies only its own `op_id`. A tick that finds an unexpired claim holds (`dispatch_pending`); one past `PENDING_TTL_SEC` escalates (`dispatch_unresolved`) instead of re-sending |
| MAJOR `src/surfaces/cli/flow.ts:98` — no supported way to create a flow: the CLI had only `status`/`tick` and the MCP only read-and-queue, so both required a file nobody could write | Real, and §4.1/§4.3 already planned it | `flow start` (CLI) and `flow_start` (MCP) share `src/core/flow-start.ts`: the run and both agents are resolved inside the run, the repo must carry a HEAD, one flow per run, `--replace` only for a closed one, `--spec` queues the first blocks |
| MINOR `docs/GUIDE.md:135` — the guide told the operator to keep the TUI/Web UI open to keep a flow running, but those surfaces only render the badge | Real; §2.3 had it as a plan and the guide read it as shipped | the guide now says nothing ticks a flow except `flow tick`, §2.3 marks both dashboard tick sites **not shipped**, and `docs/mcp.md` stopped promising a TUI/Web tick |

Two things the review did not name are also corrected here, because they were the same kind of drift:
`docs/mcp.md` described the flow tools as read-and-queue only (there are three now, one of which
writes) and the `flow status` field list did not mention `pending`, which is the field that explains
why a flow is sitting still.

---

## Appendix E — review round 5 on the shipped branch (CHANGES_REQUESTED → resolved)

The review of `daa0c05` came back **CHANGES_REQUESTED** with one major and one minor. Both were real,
and the minor was worse than it looked: the test guarding it passed for the wrong reason.

| Finding | Verdict | Where it is fixed |
| --- | --- | --- |
| MAJOR `src/core/flow-queue.ts:50`–`:63` — the project-containment check compared the spelled path only, while `statSync`/`readFileSync` follow symlinks, so a link inside the project read a file outside it and stored that content in the flow | Real; §3.2 said "may not leave the project" and the implementation checked a string | containment is now decided on `realpathSync` of both the spec and the repo, after the cheap spelled-path pass: a link that lands outside is refused, one that stays inside is followed, a broken link reads as a missing file. `test/flow-queue.test.ts` covers a link to an outside file, a symlinked directory that leaves, an inside link and a dangling one |
| MINOR `src/core/flow-start.ts:110` — the `flow start` error printed `shortHomePath(repo)`, which is the whole absolute path for a repo outside `$HOME`; the test meant to catch it passed only because `TMPDIR` happened to sit under the home directory | Real, and the test proved nothing in a sandbox whose temp dir is elsewhere | `displayPath` in `src/utils/paths.ts` renders an outside-home path as its last component; both `flow start` errors (the repo, and a flow file that already exists) use it, and the CLI tests now pin `HOME` away from the temp tree, so the assertion cannot pass by accident |

The same round also closed a family the review named only once: the "already has a flow" error printed
the registry path the same way, and it is now rendered by the same helper.

**Round 2 on the same block** (review of `b5102f4`) found the rule still applied in only one of the
three modules that print paths: `flow-queue.ts` and `flow-store.ts` kept `shortHomePath`, so a project
under `/srv` or a registry outside `$HOME` stayed absolute in the answer a host keeps. Every path in
those messages now goes through `displayPath`, and three tests pin it with `HOME` deliberately away
from both the project and the registry — the previous tests pinned `HOME` *around* the temp tree, which
is the arrangement that let the leak through twice. The same review caught a `git diff --check`
failure (a blank line at the end of this document); it is removed, not configured away.

---

## Appendix F — block 07: control and lifecycle (shipped)

Block 07 implemented the first slice of "full control": the lifecycle states, the operator commands
and the MCP tools that drive a flow. What it changed against the plan above, and why:

| Item | Shipped as | Why this shape |
| --- | --- | --- |
| `paused` | `flow pause`, `flow_control { action: "pause" }`; `paused_from` + `paused_at` in the state | `resume` must return to the state the flow was paused *in* (§3.4); recording the origin is the only way to do that without guessing. A paused flow's tick short-circuits before `observeFlow` — no git call, no pane capture, no verdict scan — and `flowTick` holds with reason `flow_paused` |
| `orphaned` | `run_present` / `agents_present` observations, an `orphan` decision, `orphan_reason` written once | Parked is a status, not an error: one journal line, then the tick holds. The registry probe reports "not seen" when it cannot answer, so a broken probe can never archive a live pipeline; only an explicit `false` parks a flow |
| Transition validation | `FLOW_TRANSITIONS` + `assertTransition` + `applyOperatorTransition` | One table for operator and engine writes; `done` is terminal, `orphaned` leaves only through `stop`, and a refusal names the state and the alternatives |
| Claim vs operator | `pause` and `stop` clear `pending` | A human decision outranks an unsettled claim; leaving it behind would make `resume` wait out `PENDING_TTL_SEC` and then escalate a flow nobody is driving. The claim still outranks the orphan check, so an in-flight send settles or expires before the flow is parked |
| `flow stop` | keeps the file (`done` + `close_reason`) | The plan's table said "deleted explicitly"; keeping it is more useful and equally safe — the tick holds on `flow_closed`, `flow status`/`flow logs` still explain what happened, and `delete-history` is the only deletion. Recorded here because it changes a written line |
| `--markdown` | the explicit unstructured downgrade, with a warning line | §3.2 named an `--allow-unstructured` flag; `add-spec --markdown` *is* that opt-in, per file group, and the CLI prints the warning and the badge shows `(unstructured)` |
| Journal | the existing bounded `log` (50 entries) | It already carried event + short reason and never a prompt body, so `flow logs` reads it instead of a second file. `-n` bounds the tail, `--json` makes it scriptable |
| `stateRoot` | moved to `src/core/state-path.ts`, re-exported from `runs.ts` | `deleteRunHistory` owns the flow cascade, and the flow store needs the state path: sharing the path module keeps `runs.ts` and `flow-store.ts` acyclic instead of relying on import order |
| MCP `flow_step` | one step per call, same claim protocol | The tool adds no rule of its own: rounds, deadline, pane guard and the claim live in the engine, and a second concurrent call answers `{changed: false, reason: "dispatch_pending"}` with one paste for both |
| MCP `flow_control` | `pause` / `resume` / `stop` (needs `confirm`) / `add_spec` | One tool with an explicit action, as §4.3 planned; mutating actions answer the `flow_status` payload, refusals answer the reason (never `ok: true`) |
