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
| `src/core/activity.ts` | `paneBusy(paneText, provider)` per-provider busy detectors, a `DETECTORS` map like `src/core/attention.ts:190` (same unmerged branch) | Busy detection is provider knowledge; it belongs next to the other pane reader, not in the caller |
| `src/core/verdict.ts` | `parseVerdict(paneText)` → `{verdict, notes, count}` | Pure, unit-testable, no tmux |
| `src/core/flow.ts` | `FlowState`, `FlowDefinition`, `tickFlow(flow, ports)` — a pure step | The whole state machine is testable without tmux, git or a clock |
| `src/core/flow-store.ts` | `~/.reeves/flows/<id>.json` read/list/save/delete, atomic, versioned | Own store, own lock domain, own normalizer |
| `src/core/flow-runner.ts` | `FlowPorts` implemented over `runtime.ts` + git, `sweepFlows()`, `sweepFlowsThrottled()` | The only place that knows both the engine and the runtime |
| `src/core/spec.ts` | Block-spec model and validation, plus the deterministic dispatch-prompt renderer | A spec is data the owner authors; it is validated once at add time, never re-parsed at dispatch |

### 2.2 One required change in the existing runtime

`src/core/runtime.ts` is the project's single agent-I/O path (`sendText`, `sendKey`,
`peekAgent`, `killAgent`, `stopRun`). The missing capability — **"write only when the pane is
free"** — must land here, not in the flow caller:

```
runtime.paneBusy(agentId): boolean            // reads via the injected driver
runtime.sendWhenIdle(agentId, text): SendResult // paste → Enter → confirm; refuses a busy pane
```

Rationale: today any caller (CLI `send`, MCP `send_text`, a future flow) can paste into a
working agent, and the paste lands in the provider's *queued input*, which the CLI will then
submit on its own next Enter. Guarding in the caller means the next surface forgets the guard
again. `sendText`/`sendKey` stay untouched for backward compatibility (and because `send` is
documented as "paste only, no submit" in `AGENTS.md`); `sendWhenIdle` becomes the only path
the engine uses.

### 2.3 Where the step runs

The project already decided this in code: periodic work lives in the surfaces that are
always present, and the Web UI server starts on demand
(`src/surfaces/webui/tui-launch.ts`, referenced from `docs/testing.md` and the development
notes). Concretely:

| Tick site | Reference | Add |
| --- | --- | --- |
| TUI Runs page refresh | `src/surfaces/tui/screens/Runs.tsx:77`–`:98` (already calls `sweepAgentsThrottled`, `sweepOrphanSessionsThrottled`, `autoCleanupRuns`) | `sweepFlowsThrottled()` next to them — **this is the primary driver** |
| Web SSE snapshot + `/api/state` | `src/surfaces/webui/server.ts:153`–`:160`, `:439`–`:443` | the same call, so a dashboard-only session keeps a flow moving |
| CLI | new `reevesagents flow tick [<id>]` | explicit, scriptable, cron-able, and the only way to tick when no UI is open |
| MCP `list` | `src/surfaces/mcp/server.ts:334` | **deliberately not wired** — see §4.3 |

`flow tick` itself must be idempotent and cheap when nothing changed: the TUI tick calls it
every 2 s, the throttle (a proposal: 15 s, matching `sweepAgentsThrottled`'s default at
`src/core/reaper.ts:179`) keeps `capture-pane` calls bounded.

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
- Cost accepted: run deletion must cascade. One hook in `stopRun`/`archiveAndRemoveRun`
  (`src/core/runtime.ts:682`, `src/core/runs.ts:437`) deletes the flow file, and `autoCleanupRuns`
  marks it `orphaned` instead of throwing.

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
    "rounds": 1, "status": "fixing"
  },
  "log": [{ "at": "…", "event": "fix_dispatched", "detail": "abc1234 round 1" }]
}
```

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

Validation runs at `add-spec` time, not mid-round at 3 a.m.: non-empty `id` and `title`, at
least one requirement and one check, `id` unique in the flow and absent from
`state.dispatched_specs`. The dispatch prompt is rendered from these fields by a fixed
renderer (`src/core/spec.ts`), so the dev receives a self-contained brief — title, goal,
requirements, the exact checks to run, the report format — instead of "read this path".

Markdown ingestion is a convenience, not a second contract: `add-spec --markdown file.md`
stores the file as `body`, takes the title from the first heading, and leaves
`requirements`/`checks` empty — refused unless `--allow-unstructured` is passed, so the
downgrade is always a visible choice.

### 3.3 Lifecycle against run archival (D7)

The run lifecycle here is stricter than it looks: `stop` (`src/core/runtime.ts:715`–`:717`) and
`delete-run` (`src/surfaces/cli/history.ts:19`) both call `archiveAndRemoveRun`
(`src/core/runs.ts:437`), which **deletes the run directory** and leaves only a compact record
`~/.reeves/history/runs/<id>.json` (`src/core/types.ts:49`). The panel's "delete archived run"
calls `deleteRunHistory` directly (`src/surfaces/tui/screens/RunHistory.tsx:132` →
`src/core/runs.ts:367`).

So "keep the flow until the run is deleted" resolves to:

| Event | Flow file | Flow status |
| --- | --- | --- |
| run is live | present | normal states |
| run ended / stopped / swept as stale (run dir gone, history record kept) | **kept** | `orphaned` — listed, never ticked; `flow status` / `flow stop` only |
| history record deleted (`delete-run`, `delete-history`, panel delete) | **deleted** | cascade hook in `deleteRunHistory` (`src/core/runs.ts:367`), the one choke point all three paths share |
| `flow stop <id>` | deleted explicitly | gone |

`orphaned` is a status, not an error: `flow status` prints it with the reason (agents gone), the
TUI/Web badge shows it muted, and a tick logs one line and parks instead of throwing every 2 s.

**Rules that make the store safe (3.1–3.3):**

- **Atomic and private**: temp file + rename, mode 0600 — the same pattern as
  `src/core/runs.ts:117` and `src/core/store.ts:21`.
- **Locked**: read-modify-write happens under the existing global state lock
  (`withRunsLock`, `src/core/runs.ts:82`). A global lock is coarse but correct here: ticks are
  rare, and the failure mode of a race is a **duplicate prompt** into an LLM (money, plus a
  confused agent), which is far worse than a 25 ms wait.
- **Idempotent by construction**: every send is keyed on `(head, verdict, verdict_count)`
  recorded *before* dispatch, so a second ticker cannot re-send the same request.
- **Self-healing reads**: missing fields fall back to defaults; a damaged file is reported as
  `flow state is not valid JSON: <path>` by `flow status <id>` and skipped by the listing, so
  one bad file cannot break a dashboard.
- **One active flow per run** in v1. Two flows over the same run would write into the same
  panes and both claim the HEAD.

---

## 4. How it meets the surfaces

### 4.1 CLI (`src/surfaces/cli/flow.ts`, registered in `index.ts:41`–`:71` so `--help` order stays intentional)

```
reevesagents flow start --run <id> --dev <agent> --review <agent> --repo <dir> \
    --review-prompt <file> [--max-rounds 6] [--review-timeout 900] [--json]
reevesagents flow status [<id>] [--json]
reevesagents flow add-spec <id> <spec.json…>        # structured block spec (§3.2)
reevesagents flow add-spec <id> --markdown <file>    # convenience: body + title only
reevesagents flow tick [<id>] [--json]
reevesagents flow pause|resume|stop <id>
reevesagents flow logs <id> [--tail N] [--json]
```

Conventions taken from the neighbouring command files: `resolveRun`/`resolveAgent` for
prefix matching (`src/surfaces/cli/helpers.ts:7`, `:17`), `requireDestructiveConfirmation` for
anything irreversible (`:31`), `console.error(message)` + `process.exit(1)` for a clean
failure (`src/surfaces/cli/agents.ts:54`–`:55`), and stable `--json` payloads (`:117`).

### 4.2 TUI

- **Runs list**: one derived flow badge per run row, computed the same way the run status is
  derived today (`src/surfaces/tui/screens/Runs.tsx:111`–`:115` maps `computeRunStatus`,
  `src/core/runs.ts:373`). Nothing is stored in the record.
- **Run page**: a `Flow` section beside `Actions`/`Lifecycle`
  (`src/surfaces/tui/screens/run/Run.tsx:196`, `:229`): status, rounds, HEAD, queue depth,
  last event, and the actions the CLI already offers.
- Copy goes through `translate()`; new keys `flow.*` in `locales/en.ts` and the nine other
  locales.

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
| `flow_status` | one flow plus its recent log | read-only |
| `flow_start` | attach a flow to an existing run (`run_id`, `dev`, `review`, `repo`, `review_prompt`) | validates like the CLI; refuses a second flow on the same run (D6) |
| `flow_add_spec` | queue a structured block spec | same validator as §3.2 |
| `flow_step` | one engine step (the `flow tick` equivalent) | returns the events it produced |
| `flow_control` | `action: pause \| resume \| stop` | one tool, three intents, so the surface does not grow three near-identical entries |

- Guardrails, because a host holding these tools can spend money: `flow_step` answers
  `{changed: false, events: []}` when nothing happened, so an agent polling it in a loop is
  cheap and visible in its own transcript; round, timeout and escalation limits live in the
  engine, never in the tool.
- `flow_control` is the one place where an `action` enum is used instead of one tool per
  action; splitting it into `flow_pause` / `flow_resume` / `flow_stop` is equally defensible and
  can be revised in review.

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
`approve`/`deny`); `approve` on that record resumes the flow with a fresh round budget, `deny`
parks it. No new notification channel, no second "needs attention" concept.

---

## 5. Risks and contract changes

| Risk | Where it bites | Mitigation |
| --- | --- | --- |
| Touching `src/core/types.ts` | `packages/reevesagents-win/test/catalog-drift.test.ts:43` fails until `sync:shared` runs and the copy is committed | Keep **all** flow types in `src/core/flow.ts`; add nothing to `types.ts` |
| New config key | `test/config-set.test.ts:22`–`:27` pins the exact `CONFIG_FIELDS` order | If `flow_tick_ms` / `flow_max_rounds` are added, extend `DEFAULT_GLOBAL` (`config.ts:12`), `mergeDefaults` (`:45`, merge block `:54`–`:64`) and that test in the same commit |
| `peek_interval_ms` is decorative | No screen reads it; screens hardcode 5000 (`RunAgents.tsx:21`, `AgentOutput.tsx:20`) | Do not advertise "the flow tick follows `peek_interval_ms`". Either wire it as a separate chore or add a dedicated key |
| **Writing into a busy pane** | `sendText`/`sendKey` have no guard (`runtime.ts:598`, `:621`) | `sendWhenIdle` in core (§2.2); a unit test asserts zero sends against a busy pane |
| **The second Enter** | The bash prototype sent a second Enter when the pane did not look busy. This is the documented project hazard: a queued Enter later answers someone else's prompt | Never blind-retry. Paste → one Enter → confirm busy; if not confirmed, record `dispatch_unconfirmed`, do not re-send, surface it. (D5) |
| Verdict parsing on redacted text | `peekAgent` strips ANSI *and* redacts secrets (`runtime.ts:579`) | Parse a raw capture. Either add `peekAgentRaw` or make the parser tolerate `[redacted]`; decide before writing the parser |
| **The MCP contract changes** | `.github/CONTRIBUTING.md:59` promises a flat MCP; six flow tools that can start/step a pipeline contradict the old wording | Amend the sentence to "no implicit loops" in the same commit as the tools (§4.3, D3), and say it in `docs/mcp.md` |
| Structured specs are authoring work | A spec with empty `requirements`/`checks` produces a vacuous brief, and validation only catches it at add time | Validate hard (§3.2), keep `--markdown` explicitly downgraded, and show a full example in `docs/flows.md` |
| Flow outlives its run directory | `archiveAndRemoveRun` (`runs.ts:437`) removes the run dir; a naive cascade would delete the flow on every `stop` | Cascade only in `deleteRunHistory` (`runs.ts:367`); `orphaned` status otherwise (§3.3, D7) |
| Two tickers (TUI + cron) | Duplicate prompts, double round counting | State lock + `dispatched_head` / `verdict_count` keys; `tick` is a no-op when nothing changed |
| Run removed under a live flow | `autoCleanupRuns` (`runs.ts:521`) deletes stale run dirs on every UI tick | `Agent not found` parks the flow as `orphaned` with one log line instead of throwing every tick |
| Cost | Every send spends provider tokens | `max_rounds`, `review_timeout_sec`, 15 s throttle, and no send while busy |
| i18n surface | 10 locales × new keys, plus the commands table in `README.md:130`–`:160` and the nine translated READMEs under `docs/i18n/` | Budget it in the surfaces block, not as an afterthought |
| `AGENTS.md` is protected | Hermes' write guard blocks edits to it | Flow documentation goes to `docs/` only |

---

## 6. Block plan

| Block | Deliverable | Definition of done | How it is verified |
| --- | --- | --- | --- |
| **01 — recon (this)** | `docs/flows-design.md` | Decisions recorded in §7; no code written | Reviewed read-only by a second model (this document) |
| **02 — core primitives only** | `src/core/activity.ts` (busy per provider), `verdict.ts`, `spec.ts` (model + validator + prompt renderer), `runtime.sendWhenIdle` + `paneBusy`; no flow yet | Existing behaviour unchanged; a busy pane is never written to; a malformed spec is refused at add time | `pnpm typecheck && pnpm lint && pnpm test` green, plus new unit tests: busy markers per provider, refusal against a busy pane, one-Enter-and-confirm, verdict/notes parsing |
| **03 — engine + store + CLI** | `flow.ts`, `flow-store.ts`, `flow-runner.ts`, `src/surfaces/cli/flow.ts` (structured `add-spec`), `orphaned` lifecycle, TUI tick wiring only | A full ACCEPT → next dispatched spec runs end-to-end on a temp registry with real tmux fake agents; two tickers cannot double-send; an orphaned flow survives its run's archival and dies with the history record | `vitest run test/flow*.test.ts` + the real-tmux rehearsal script + `pnpm verify`; i18n untouched (CLI copy is English, like every other command) |
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
| D7 | Retention | **Keep while the run record exists; delete when the run is deleted** | `orphaned` after archival, cascade in `deleteRunHistory` (`src/core/runs.ts:367`) (§3.3) |

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

`feature/flow-engine` holds two commits: `4a08585`, a throw-away `flow` implementation from a
*superseded* assignment (`src/core/flow.ts`, `src/core/flow-store.ts`,
`src/surfaces/cli/flow.ts`, `test/flow.test.ts`, `docs/flows.md`), and this design document.
The prototype is committed, unpushed and **not** part of this design: it was written before the
recon, it puts the busy heuristic in the CLI layer, and it touches neither the runtime guard nor
the tick sites of §2. Mine it for details; do not treat it as a baseline. Where they disagree,
this document wins, and the prototype is expected to be reset before block 02.
