# Notification log and agent pulse badge — design

Status: design only. No production code is changed by this document.

Revision 4 (base refresh + flow integration): the branch merged `upstream/master` (`99c2d80`,
version 2.1.0) and every `file:line` anchor in this document was re-derived against the merge commit —
the earlier numbers pointed at the 1.8.2 layout and had drifted by tens of lines. Two things were
added rather than corrected: the two flow kinds in §2.2 (`flow.escalated`, `flow.review_timeout`,
emitted by the product from the flow engine's own attention source) and §11, the review-notes channel
by which a reviewer's findings become files on disk instead of pane text that only the next prompt
sees. `stateRoot()` no longer lives in `runs.ts`: it moved to `src/core/state-path.ts:12` (re-exported
by `runs.ts:37`) when the flow store needed the path without importing the run registry.

Revision 3 (after review round 2): added the missing mark-read route (§4.3); the watermark's
read-max-write now runs under the append/rotation lock (§3.4); `MAX_EVENTS` is derived from the file
inside the lock instead of a drift-prone counter (§3.3); the `PIPE_BUF` justification is replaced by
a correct description of the lock and of a partially written tail (§3.2); the rotation tests assert
the retained suffix instead of all lines (§9).
Revision 2 (after review): append and rotation now share one lock protocol (§3.2, §3.3); rotation
trims by a hard byte budget instead of a line count (§3.3); the pulse window is driven by the
server-stamped `received_at`, never by a producer-supplied `ts` (§2.1, §4.1, §4.2, §6.2).
Base: `upstream/master` = `99c2d80`, version 2.1.0.
Scope: Web UI notification history ("Logs") plus a pulse badge on the agent card.

## 0. Decisions in three lines

| Question | Decision |
| --- | --- |
| Where events come from | One contract, two producers. The product emits what it can already observe in-process (run lifecycle, approvals, reaper, stale-run sweep); everything else — including "agent finished its turn", which 2.1.0 cannot detect at all — arrives through `POST /api/notifications` from the fleet supervisor as `source: "external"`. |
| How events are stored | Append-only `~/.reeves/notifications.jsonl` (one JSON object per line, `O_APPEND`), ring-capped by count **and** size, trimmed to the newest lines that fit a hard byte budget; append, rotation and the read watermark all share one lock acquisition (`.notifications.lock`) and one synchronous critical section each. A separate `~/.reeves/notifications-read.json` holds a single read watermark, updated read-max-write so it can only move forward. The server is the source of truth for both the log and unread state, not `localStorage`. |
| How the badge behaves | The badge is pure derived state: `last unread event of that agent` → `received_at + agent_pulse_ms`, where `received_at` is stamped by the server, so a producer-supplied future `ts` cannot stretch the window. The client computes the remaining time on every render from `received_at` corrected by the `server_now` offset, so F5 mid-pulse shows the correct remainder. One `setTimeout` at the earliest expiry, no polling timer. |

Verified premise for all of this — the product has no notification or attention mechanism at all in 2.1.0:

```text
$ grep -rn "attention" src/
$ echo $?
1
$ grep -rni "notification" src/ -l
$ echo $?
1
```

```text
$ wc -c src/surfaces/webui/client/app.js src/surfaces/webui/client/app.css
 86377 src/surfaces/webui/client/app.js
 45911 src/surfaces/webui/client/app.css
```

Windows toasts are currently sent by the external bash supervisor, not by the product
(`~/.hermes/reeves-handoff/notify_toast.sh`, invoked from `loop_supervisor.sh:20-21` via
`powershell.exe`). The product therefore has to gain two things it does not have: an ingest
endpoint and a place to keep history.

## 1. Inventory of what exists

### 1.1 Header (where the button goes)

`src/surfaces/webui/client/index.html:19-32` is the whole top bar:

| line | id |
| --- | --- |
| 25 | `agent-control-btn` |
| 26 | `config-btn` |
| 27 | `presets-btn` |
| 28 | `doctor-btn` |
| 29 | `about-btn` |
| 30 | `new-agent-btn` |
| 31 | `new-run-btn` |

`id="logs-btn"` (class `btn btn-secondary`, like About) is inserted between lines 29 and 30.
Nothing else in the header moves.

### 1.2 Dialog pattern

All secondary dialogs are native `<dialog>` elements using `class="dialog mcp-dialog"` with an
inner `.mcp-panel` wrapper:

| dialog | line |
| --- | --- |
| `new-dialog` | `index.html:82` |
| `mcp-dialog` | `:197` |
| `doctor-dialog` | `:216` |
| `about-dialog` | `:233` |
| `welcome-dialog` | `:246` |
| `config-dialog` | `:264` |
| `presets-dialog` | `:281` |

`about-dialog` (`index.html:233-244`) is the closest template: header, one list container, one
action row. The Logs dialog follows it exactly (`.mcp-panel`, `.dialog-header`, `.dialog-actions`).

Element references are collected once in the `el` map (`app.js:207` onwards, e.g. `aboutBtn`,
`aboutDialog`, `aboutList`, `aboutClose`), and the open/close handlers are registered together at
`app.js:2118-2140` (About is `app.js:2118-2119`). New handlers belong in that block.

### 1.3 HTTP server

`src/surfaces/webui/server.ts` — a single `handleRequest` switch on method+path
(`:419-650`), no router library.

| constant | line | value |
| --- | --- | --- |
| `HOST` | `:46` | `127.0.0.1` |
| `DEFAULT_PORT` | `:47` | `8080` |
| `DEFAULT_RANGE` | `:48` | `10` (so 8080..8089) |
| `POLL_MS` | `:49` | `1500` |
| `MAX_BODY` | `:50` | `64 * 1024` |

Existing routes:

| route | line |
| --- | --- |
| `GET /` and `/index.html` | `:432` |
| static allowlist `STATIC_ROUTES` | `:55-63`, served at `:436-440` |
| `GET /api/state` | `:441-453` |
| `GET /api/mcp-hosts` | `:454` |
| `GET /api/doctor` | `:462` |
| `GET /api/config` | `:470` |
| `GET /api/presets` | `:478` |
| `GET /api/events` (SSE) | `:486` |
| `GET /healthz` | `:490` |
| `POST /api/terminals` | `:495` |
| `POST /api/language` | `:504` |
| `POST /api/mcp-hosts/{attach,detach,attach-all}` | `:513`, `:522`, `:531` |
| `POST /api/config` | `:539` |
| `POST /api/presets/save` | `:548` |
| `POST /api/presets/{name}/start` | `:557` |
| `POST /api/presets/{name}/delete` | `:566` |
| `POST /api/terminals/{id}/{kill,delete}` | `:578`, `:590` |
| `POST /api/runs/{id}/{stop,delete}` | `:602`, `:614` |
| `POST /api/history/{id}/delete` | `:626` |
| `POST /api/approvals/{id}/resolve` | `:638` |
| fallback 404 | `:649` |

Two guards run before any routing (`server.ts:420-427`, implemented in `guards.ts`):

- `isAllowedHostHeader` (`guards.ts:24-28`) — Host must be `127.0.0.1`, `localhost` or `::1`
  (blocks DNS rebinding);
- `isStateChangingMethod` (`guards.ts:30-33`) + `isAllowedOrigin` (`guards.ts:37-48`) — every
  non-GET/HEAD/OPTIONS request must carry an `Origin` that is a loopback origin **on the bound
  port**. A `curl` POST without that header is rejected with `403 forbidden origin`.

That last point is the single most important constraint for the ingest route (see §4.2).

Body handling: `readJsonBody` (`server.ts:205-218`) enforces `MAX_BODY` while streaming
(`:211`), rejects non-objects (`:216`), and throws plain `Error`s that the route wrapper turns
into `400 { error }`.

### 1.4 SSE stream

`createSseHub` (`server.ts:149-215`):

- `snapshot()` (`:154-160`) calls `sweepAgentsThrottled()`, `sweepOrphanSessionsThrottled()`,
  `autoCleanupRuns()` and then `JSON.stringify(buildWebState())`;
- `tick()` (`:166-171`) compares the serialized string with the previous one and sends only on
  change; identical frames are dropped;
- the poller is connection-scoped: it starts on the first client (`:172`) and stops on the last
  (`:176-177`), interval `POLL_MS` = 1500 ms, `unref()`'d (`:174-175`).

Consequence for the design: whatever goes into `buildWebState()` is re-serialized on **every**
tick and re-sent on **every** change. Adding the whole notification history there would mean
re-sending megabytes per tick at a few hundred events. So SSE carries only a summary (§4.1).

### 1.5 State model and card rendering

`src/surfaces/webui/state.ts`:

- `WebTerminal` `:45-63` (`id`, `nickname`, `provider`, `model`, `role`, `status`,
  `headless`, `hasWindow`, `canAttach`, `canKill`, `canDelete`, `disabledReason`, `monogram`,
  `color`, `task`);
- `WebRunFlow` `:35-44`, `WebRun` `:64-75`, `WebRunHistory` `:76-88`, `WebApproval` `:89-103`, `WebState` `:104-108`
  (`runs`, `history`, `approvals` only — no notification field today);
- `buildWebState()` `:138` builds the whole payload (run/agent indexes, terminals, approvals); the
  inner line numbers move whenever the flow badge is touched, so block 02 should re-anchor them from
  the function rather than from this document.

Client rendering (`src/surfaces/webui/client/app.js`):

| what | line |
| --- | --- |
| client state vars (`runs`, `approvals`, `messages`, …) | `:298-316` |
| `api()` fetch helper | `:320-334` |
| `applyState()` (from `/api/state`) | `:348-361` |
| `subscribe()` (EventSource, applies SSE frames) | `:363-380` |
| `t()` translation lookup | `:387-393` |
| `applyLanguage()` | `:395` |
| `applyTheme()` | `:1247-1251` |
| `renderSidebar()` | `:905-1017` (runs loop `:934`, `renderCard` call `:999`) |
| **`renderCard(run, agent)` — the agent card builder** | **`:1115-1199`** |
| avatar element (where the badge attaches) | `:1128-1131` |
| card tail (status dot, open hint, stop/delete) | `:1155-1199` |
| `renderHistoryRecord()` | `:1081-1113` |
| `disabledReasonLabel()` | `:1201-1207` |
| `statusLabel()` | `:2179-2189` |
| `shortIso()` (compact timestamp helper) | `:2191-2194` |
| WEB_EN fallback map | `:34-206` |

`renderCard` is called only from `renderSidebar`, and `renderSidebar` rebuilds the list from
scratch (`el.sidebarList.innerHTML = ''` at `:914`, then `createElement` for every node). So a
badge that expires needs `renderSidebar()` to be called again — there is no incremental patching.

### 1.6 i18n

`src/i18n/catalog.ts`:

- `translate(language, key, values)` `:41-47`;
- `localeCatalog(language)` `:49-51` — this is what `GET /api/state` ships to the browser
  (`server.ts:102-109`, `translations` at `:107`);
- `translatePhrase(language, text)` `:53-55` for hardcoded English labels;
- per-language catalogs are `{ ...en, ...LOCALES[lang].keys }` (`:36-39`), so a missing key falls
  back to English at runtime rather than failing.

Sources: `src/i18n/locales/en.ts` (328 keys, of which 171 are `web.*`), plus `de, fr, es, pt, it,
tr, ru, zh-Hans, ar` which list only entries that differ from English.

The enforced rule (`test/i18n.test.ts:66-80`): scan `app.js` for object-literal keys matching
`/'((?:web|common)\.[^']+)'\s*:/g` and assert `translate('en', key) !== key`. Two consequences
worth writing down before anyone touches the client:

1. The scan only sees keys written as **object-literal properties**. A key that only ever appears
   as `t('web.something')` is invisible to the test and gives false comfort. New keys go into the
   `WEB_EN` map (`app.js:34-205`) as well as into `src/i18n/locales/en.ts`.
2. There is **no** automated test that every one of the ten locales defines every key (checked:
   `test/i18n.test.ts` has no locale key-set comparison; `grep -rln "locales/" test/` returns
   nothing). Full-locale coverage is a project convention, i.e. a review item, not a gate.

Language is delivered to the client in two places: `GET /api/state` → `language` payload
(`server.ts:448`) and `POST /api/language` (`:504`).

### 1.7 Config

`src/core/config.ts`:

- `DEFAULT_GLOBAL` `:12-22` (`peek_interval_ms: 5000`, `ready_delay_ms: 5000`,
  `max_lifetime_ms: 0`, `web_theme: 'dark'`, …);
- `mergeDefaults()` `:46-67` — lenient load: bad values are silently dropped, each field has its
  own validity check (`:57-65`);
- `CONFIG_FIELDS` `:107-117` — the single list every surface reads (CLI `config`
  `src/surfaces/cli/config.ts:4,9`, MCP `set_config` `src/surfaces/mcp/server.ts:59,525`, TUI
  Settings `src/surfaces/tui/screens/Config.tsx:16,21`, Web config panel
  `server.ts:21,343,352`);
- `ConfigFieldKind` `:99` = `posint | nonneg-int | permissions | language | web-theme`;
- `validateConfigField()` `:138-156` — `nonneg-int` accepts any integer `>= 0`, **no upper
  bound**;
- `setConfigValues()` `:161-169`, `saveConfig()` atomic temp+rename `:80-92`.

`GlobalConfig` is declared in `src/core/types.ts:118-128` and `Config` at `:130-133`.

Pinning test: `test/config-set.test.ts:22-27` asserts the exact key order of `CONFIG_FIELDS`:

```text
'web_theme', 'peek_interval_ms', 'peek_lines', 'max_depth', 'max_agents',
'ready_delay_ms', 'max_lifetime_ms', 'default_permissions', 'language'
```

### 1.8 Storage layout

`src/core/runs.ts`:

| helper | line | path |
| --- | --- | --- |
| `stateRoot()` | `state-path.ts:12` | `$REEVES_REGISTRY` or `~/.reeves` |
| `runsDir()` | `:42` | `<state>/runs` |
| `historyDir()` | `:46` | `<state>/history/runs` |
| `runPath()` | `:58` | `<state>/runs/<id>/run.json` |
| `withRunsLock()` | `:92-125` | `<state>/.runs.lock`, `wx` create, 5 s stale takeover, sync retry loop |
| `atomicWriteJson()` | `:127-133` | write `.tmp`, `chmod 0600`, `rename` |
| `redactAgent()` | `:232-239` | applies `redactSecrets` to `task`, `task_note`, `inbox[].text` |
| `archiveAndRemoveRun()` | `:481` | run → history |
| `autoCleanupRuns()` | `:565` | archive stale/ended runs |
| `runHasLiveTmuxTarget()` | `:548` | liveness probe |

There is also a precedent for small runtime metadata files next to the state root:
`src/surfaces/tui/open-token.ts:7-22` writes `<state>/tui-open-token` (this is how the CLI resets a
running TUI). The port file proposed in §4.3 follows the same idea.

### 1.9 Redaction

`src/core/redact.ts:14-18` — `redactSecrets(text)` replacing `sk-ant-…`, `sk-…`, `AIza…`,
`gsk_…` with `[REDACTED]`. The same file is copied verbatim into the Windows package
(`src/core/redact.ts:3-4` says so) and guarded by the drift test.

### 1.10 Windows mirror

`packages/reevesagents-win/src/shared/` holds four files copied from `src/core/`:
`types.ts`, `provider-registry.ts`, `model-data.ts` (byte-identical) and curated subsets
`provider-build.ts`, `redact.ts`.

`packages/reevesagents-win/test/catalog-drift.test.ts:42-51` asserts `types.ts`,
`provider-registry.ts`, `model-data.ts` are **byte-identical** to their `src/core/` originals.
`packages/reevesagents-win/scripts/sync-shared.mjs` (`sync:shared` script) refreshes them.

This is a hard coupling for the config key (§7): `GlobalConfig` lives in `src/core/types.ts`, so
adding a field there requires the mirrored file to change in the same commit.

Note the asymmetry, verified: root `pnpm test` only globs `test/**` (`vitest.config.ts:6`) and
root `pnpm typecheck` uses the root `tsconfig.json`, so the drift test does **not** run in the
root gate. It runs only under `pnpm --dir packages/reevesagents-win verify`.

### 1.11 Isolating probes (why no Web UI probe is safe in this branch)

`server.ts:674-730` starts the loopback server; `createSseHub`'s snapshot calls
`autoCleanupRuns()`/`sweepOrphanSessionsThrottled()` on every tick (`:157-159` and again in
`GET /api/state` at `:442-444`). Those sweeps read the **live** registry from `stateRoot()`
and can archive runs and kill tmux sessions. On 2.1.0 there is no guard commit `651b5a6`, so any
probe that starts the server against the real `~/.reeves` can mutate the live fleet.

Therefore every probe in blocks 02–03 must use a private pair
(`REEVES_REGISTRY=<tmp>`, `REEVES_CONFIG=<tmp>/config.json`, `TMUX_TMPDIR=<tmp>`, `unset TMUX`)
and count `reeves-*` sessions before and after.

## 2. Event model

**Shipped names (block 14).** `src/core/notifications.ts`: `appendNotification`, `readNotifications`,
`markNotificationsRead`, `notificationSummary`, `normalizeNotificationInput`, `emitNotification` (the product's
fire-and-forget wrapper: a journal that cannot be written never breaks the action it describes),
`withNotificationsLock` (its own `.notifications.lock`, 5 s stale takeover, 25 ms spin retry). Caps live in
`NOTIFICATION_LIMITS`: `max_events 2000`, `max_bytes 2 MiB`, `keep_events 1500`, `keep_bytes 1.5 MiB`,
`dedupe_keys 2000`, plus the field caps from §2.1. Path shortening covers Unix, drive-letter (`C:\Users\…`) and UNC
(`\\server\share\…`) forms, with Unicode components (a directory may contain a space — `My Project` — but the final component may not, or a
trailing sentence would be eaten as part of the path) and any lead character (a path after `path:` is still a path; a `scheme://` URL is
not — except `file:///…`, whose `//` part *is* a local path and is shortened like one) — the checkouts here are Polish, Ukrainian and Russian, so
`/home/Дмитро/Проект/secret.txt` must shorten like any other path — three patterns, because one combined regex makes the escape count unreadable and that
is how the UNC case was missed. The redactor also knows `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` tokens and fine-grained
`github_pat_…` ones. The ingest route is
`POST /api/notifications` (loopback peer **and** an `Origin` header, 60 events per 10 s per peer, body ≤ 64 KiB),
reads are `GET /api/notifications?limit&run&since&unread`, acknowledgement is
`POST /api/notifications/read`, and `GET /api/state` plus the SSE frame carry
`{latest_seq, unread, latest_ts}`. Two kinds were added to §2.2 by block 13:
`plan.item_done` (`info`) and `plan.item_blocked` (`warn`), both product-only.

### 2.1 Fields

```ts
type NotificationSource = 'product' | 'external'
type NotificationSeverity = 'info' | 'warn' | 'error'

interface NotificationEvent {
  seq: number            // server-assigned, monotonically increasing, never reused
  id: string             // stable id, `n_<seq>_<rand6>`; used as a DOM key / dedupe guard
  ts: string             // ISO-8601 UTC, PRODUCER clock — display only, never drives a timer
  received_at: string    // ISO-8601 UTC, SERVER clock at append — authoritative for pulse windows
  run_id: string         // '' when the event is not run-scoped
  run_name: string       // display label, redacted, <= 80 chars
  project: string        // basename(working_dir), <= 64 chars; never a full path
  agent_id: string       // '' for run-level events
  agent_nickname: string // '' when unknown
  kind: NotificationKind
  severity: NotificationSeverity
  title: string          // <= 200 chars, redacted, single line
  detail: string         // <= 1000 chars, redacted, newlines collapsed to ' · '
  source: NotificationSource
  dedupe_key?: string    // stored when the producer supplied one (product kinds always do); see §3.5
}
```

`seq` is assigned by the server, not the producer: the read watermark and the badge both need a
total order that survives process restarts, duplicate POSTs and out-of-order `ts`. Ordering is
always by `seq`; `ts` is never used to sort, filter or time anything.

`received_at` exists because the producer's clock is not trustworthy, and the badge is a timer. The
supervisor is a bash loop on the same machine, but it can be restarted with a skewed clock, and the
ingest route is a network surface — a `ts` one hour in the future would otherwise hold a badge on
screen for an hour. So the server stamps `received_at` from its own clock on append, and
**every time-derived behaviour (pulse window, "3 min ago" labels, ordering of equal `seq`) uses
`received_at`**. `ts` is kept only as context ("the producer says it happened at …") and is
clamped on ingest (§4.2 step 5).

`project` is derived server-side as `basename(working_dir)` on the product path and accepted
verbatim (validated, no `/`) on the ingest path. Rationale: the fleet supervisor knows the
project name, the product knows the working directory, and neither may put a full home path into
history. Note that no `displayPath` helper exists in 2.1.0 — `grep -rn "displayPath" src test
packages/reevesagents-win/src docs` returns nothing, so this basename rule is the whole privacy
story for paths and it has to be implemented, not reused.

### 2.2 Kinds, and why exactly these ten

| kind | severity default | producer in 2.1.0 | observable hook |
| --- | --- | --- | --- |
| `run.created` | `info` | product | `startRun` `runtime.ts:367`, `startRunFromPreset` `:433`, `startRunWithHead` `:485`, `spawnWorker` `:535` |
| `run.stopped` | `info` | product | `stopRun` `runtime.ts:802` |
| `run.archived` | `info` | product | `archiveAndRemoveRun` `runs.ts:481` (called from `killAgent` `runtime.ts:763`, `autoCleanupRuns` `runs.ts:565`) |
| `agent.needs_human` | `warn` | product + external | `createRunApproval` `approvals.ts:141` (the MCP `request_approval` path); the fleet's own "waiting for the user" cases come from ingest |
| `agent.failed` | `error` | product + external | `sweepAgents` reaped list (`reaper.ts:31-37`, `ReapReason = 'window-gone' | 'lifetime-exceeded'`) |
| `probe.failed` | `warn` | product + external | `runHasLiveTmuxTarget()===false` for a run still marked `running`, i.e. the sweep at `server.ts:442-444` / `autoCleanupRuns` `runs.ts:565` |
| `agent.finished` | `info` | **external only** | none in 2.1.0 — see below |
| `flow.escalated` | `warn` | **product** | the flow engine: `FlowAttention === 'escalated'` (`flow-view.ts`), i.e. the round budget is spent or a claim could not be resolved |
| `flow.review_timeout` | `warn` | **product** | the flow engine: `FlowAttention === 'review_timeout'`, i.e. the reviewer did not answer within `review_timeout_sec` |
| `external` | `info` | external | generic carrier for a supervisor message that fits no other kind |

Why this is the minimal set and no smaller:

- the three `run.*` kinds are the only state transitions 2.1.0 already records
  (`RunStatus` is `running | ended`, `types.ts:18`);
- `agent.needs_human` is the owner's actual pain ("что там требовалось"), and the product has
  exactly one first-class signal for it: a pending approval (`approvals.ts:141-160`, surfaced to
  the Web UI as `WebApproval`, `state.ts:89-103`);
- `agent.failed` vs `agent.finished` must be separate: one is an error the user should see, the
  other is routine progress, and collapsing them would force either noise or silence;
- `probe.failed` is separate from `agent.failed` because it describes the *observation* failing
  ("the tmux target is gone"), not the agent itself, and the fleet supervisor already
  distinguishes these cases in its loop;
- `external` exists so a future supervisor message never needs a code change in the product to be
  visible. Without it, every new fleet event would need a release.

**The two flow kinds are the flow engine's attention, not a second model of it.** `FlowAttention`
(`src/core/flow-view.ts:129`) already decides when a flow needs a human — `escalated` when the round
budget is spent or a claim nobody settled expired, `review_timeout` when a requested review passed
`review_timeout_sec` — and the TUI/Web badge already renders exactly those two. The notification log
consumes the *same* value: the emit point is the tick that writes the state and observes that
attention, so a flow event exists iff the badge would show a warning, and block 09's escalation
approval pickup raises its approval from the same field. Three surfaces, one source: no surface may
compute "needs a human" on its own, or they will disagree the first time the timeout arithmetic
changes.

Rules for the two flow kinds, because they differ from the ingest kinds:

- **produced by the product only.** They are never accepted from `POST /api/notifications`: an ingest
  caller that could write `flow.escalated` would be able to fake a human-required state. The route
  rejects them with `400 kind is produced by the product` (§4.2 step 5).
- `run_id` comes from the flow state; `agent_id` is the role the attention is about (`review` for a
  timeout, the flow's dev/review pair for an escalation is *not* guessed — an escalation is run-scoped,
  so `agent_id` is `''` and only the run is marked); the badge therefore pulses on the run's card, not
  on a guessed agent.
- `project` is `basename(repo)` of the flow.
- `severity: 'warn'`, `source: 'product'`, and the detail carries the machine reason
  (`rounds exhausted`, `review timeout`) plus the round counter — never the prompt text and never a
  path.
- they are emitted **at most once per attention episode, and never lost silently**. The flow state and
  the notification log are two files with two locks (§3.3), so no sequence of two writes can be atomic;
  claiming "exactly once" would be a promise the filesystem cannot keep. The design is therefore
  *at-least-once with a stable key*, plus a marker in the flow state:

  1. the tick writes the flow state — including `notify: { episode, key, kind, emitted_at: null, seq:
     null }` — in its own atomic write, as part of the transition that made the attention true. The
     **episode** is a counter in the flow file, incremented on every transition *into* an attention
     state, because `(run, head, kind)` is not unique: a `review_timeout` that the operator resumes and
     the next review that also times out happen on the same head, and so do two escalations on the same
     commit after two `flow resume` calls;
  2. immediately after, it appends the notification with
     `dedupe_key = "<flow_id>:<kind>:<episode>"` (`flow.escalated` / `flow.review_timeout`) and, on
     success, records the returned `seq` in the same flow file (`notify.seq`). The first component is
     the flow's own `flow_id` (a uuid written once by `createFlowState`, `src/core/flow.ts:279`), **not**
     the run id: `flow start --replace` on the same run writes a new flow file whose episode counter
     starts again at 1, so a run-scoped key would collide with the closed flow's key and the durable
     index would suppress a genuinely new escalation. A replaced flow is a new flow, and its key says
     so;
  3. a crash between 1 and 2 leaves `notify.seq === null`, and the next tick — which still sees the same
     attention and the same episode — retries the append. The key is stable *and durable*, so a retry
     after a successful append is collapsed by the store's key index (§3.5) instead of duplicating the
     row, no matter how much later it happens;
  4. a stale tick cannot re-emit for ever: `notify.seq !== null` means this episode is already told, and
     a new episode always gets a new number, hence a new key. `key` is stored only for `flow logs` and
     for debugging — the identity that matters is `episode`.
- the notification is the counterpart of the flow's own `log` entry in the log the human reads; the
  flow `log` stays the authority on *what the engine decided*, the notification log on *what the human
  was told*.

**Honest gap:** "agent finished its turn" is not observable in 2.1.0. `task_status` only moves
`queued → working` when the startup task is pasted (`runtime.ts:272-273`) and `→ done` when the
agent is killed (`runtime.ts:783`). Nothing parses pane output for idleness, and adding such a
detector is a different project. So `agent.finished` is only ever produced by ingest, and that is
the whole reason `source` is a first-class field instead of a debug detail.

## 3. Storage

### 3.1 File and format

`<state>/notifications.jsonl` where `<state> = stateRoot()` (`src/core/state-path.ts:12`), i.e.
`~/.reeves/notifications.jsonl` in production and `<tmp>/notifications.jsonl` in tests. One
compact JSON object per line, `\n`-terminated, no pretty printing. The log itself is append-only and
never indexed for reads (the ring is small enough to scan); the two sidecars below are the only extra
state, and neither is an index *of* the log — one is the read watermark, the other the bounded key index
of §3.5.

`<state>/notifications-read.json` = `{ "read_seq": 0, "updated_at": "…" }` (atomic temp+rename,
`chmod 0600` like `atomicWriteJson` `runs.ts:127-133`).

`<state>/notifications-dedupe.json` = the bounded key index of §3.5, written under the same lock and
with the same atomicity. Two small JSON files, both `0600`, both derived state: losing either costs
badges or one duplicate row, never an event.

**A missing file is a first run, not an error.** All four paths above are created lazily, and every
reader and writer treats "not there" as its empty value — otherwise the very first notification on a
fresh state directory would fail with `ENOENT`, and so would the first `GET /api/notifications`:

| path | absent means | who creates it |
| --- | --- | --- |
| `notifications.jsonl` | zero events (`[]`, `size 0`, `count 0`) | the `openSync(path, 'a')` of the first append, which creates the file (step 3 below) |
| `notifications-read.json` | `read_seq: 0` | the first `markNotificationsRead` |
| `notifications-dedupe.json` | an empty index (nothing to merge) | the first append that carries a `dedupe_key` |
| `notifications-seq` | `0`, so the first id is `n_1_<rand6>` | the first append |

Reads never create a file: `readNotifications`, the summary and the SSE snapshot return the empty
value for a missing log, so a dashboard served from a clean state dir shows an empty dialog rather than
an error. `ENOENT` from `statSync` is therefore an ordinary branch of the append path, not an
exception — one `try`/`catch` for that one code, and every other `statSync` failure is still a real
error.

### 3.2 Append path: `O_APPEND` inside the lock, not temp+rename

`openSync(path, 'a', 0o600)` + a single `writeSync(fd, line)`, always inside the lock of §3.3.

What `O_APPEND` actually guarantees, stated precisely — the previous revision justified the
per-line cap through `PIPE_BUF`, and that was wrong: `PIPE_BUF` atomicity is specified for pipes and
FIFOs, not for regular files, and no `write()` size makes a record "atomically visible" to a reader
that is not synchronised with the writer.

- `O_APPEND` does guarantee that the offset is moved to the end of the file and the bytes are
  written without an intervening modification of that offset (POSIX), so two appenders cannot
  overwrite each other's records and the file never grows a hole. On Linux and macOS a single small
  write to a local file is also not interleaved byte-wise with another appender's buffer in
  practice — an implementation property, not a portable promise, and this design does not rely on
  it.
- What the design relies on is the **lock**: append, rotation and the watermark write all run in the
  same `withNotificationsLock` critical section (§3.3), so there is exactly one writer at a time
  across the process family. `O_APPEND` is kept because it makes the append O(1) — no seek, no
  read-modify-write — and because it is a harmless second line of defence if some future tool
  appends without taking the lock.
- Readers deliberately do **not** take the lock (a UI must never block on a writer), so a reader can
  observe the file while a line is being written. The contract is therefore explicit: **the last
  line may be partial and is never trusted**. `readNotifications` splits on `\n`, parses each line
  independently, and skips any line that is not valid JSON or lacks a numeric `seq`. A fragment is
  invisible until `writeSync` returns, then the next read sees the complete line. If the writer died
  mid-line, that fragment stays skipped forever and disappears at the next rotation, which rewrites
  whole lines only.
- A crash mid-write therefore costs at most the last event, never the file or the earlier records.

`fsync` is deliberately not called per event: the value is a UI log, and a lost last event after a
power failure is not worth an fsync per notification. The read watermark file *is* written
atomically (temp+rename) and under the same lock, which is what makes the monotonicity argument in
§3.4 hold.

What `O_APPEND` cannot help with at all is rotation, which is a read-modify-rename of the whole
file: an append that lands between rotation's read and its `rename` goes to the old inode and is
lost. That is why append and rotation share one lock protocol instead of only rotation taking a
lock (§3.3).

### 3.3 Ring: cap by count **and** size, rotate by rewrite

Caps:

| constant | value | role |
| --- | --- | --- |
| `MAX_EVENTS` | 2000 | rotation trigger |
| `MAX_BYTES` | 2 MiB | rotation trigger |
| `KEEP_EVENTS` | 1500 | post-rotation count target |
| `KEEP_BYTES` | 1.5 MiB (75 % of `MAX_BYTES`) | post-rotation hard byte bound |

**One lock protocol for append and rotation.** Both run inside `withNotificationsLock(fn)`, using
the same recipe as `withRunsLock` (`runs.ts:92-125`): `openSync(<state>/.notifications.lock, 'wx',
0o600)` holding `{ pid, created_at }`, 5 s stale takeover, 25 ms sync retry, `unlink` in `finally`.
It is a separate lock file from `.runs.lock` so notification traffic never contends with run-state
writers.

`appendNotification()` acquires that lock **once** and performs the whole unit of work inside the
single acquisition:

1. `statSync` once, **before this line is written**, and compare the result with the cache the previous
   append left behind (`{ dev, ino, size, count }`, below). `ENOENT` is the first-run branch: the log is
   empty, so `size_before = 0`, `count_before = 0`, there is no inode to compare and nothing to merge
   from the log (§3.1); every other `statSync` failure is a real error and fails the append. This yields
   `size_before` and `count_before`; on a mismatch the exact line count is recomputed and the dedupe index merged with
   what the file says (§3.5 — a merge, not a rebuild: rotation removes rows whose keys the index must
   keep). The same scan that recomputes the count collects the `dedupe_key` values, so the two never
   disagree;
2. if the input carries a `dedupe_key` that the reconciled index already holds, return that entry with
   `duplicate: true` and write nothing (§3.5);
3. `writeSync` of the line on the `O_APPEND` fd (short; readers may see a partial tail and skip it,
   §3.2). The `openSync(path, 'a')` here is also what creates the log on the first append of a fresh
   state directory — the path is never created by the `statSync` of step 1, which is why that stat has
   an `ENOENT` branch;
4. **update the size and the count to their post-write values** — `size_after = size_before +
   byteLength(line)`, `count_after = count_before + 1` — and store them, with the current
   `{ dev, ino }`, as the new cache. A cache that still described the pre-write file would make the
   next append rescan for nothing; a rotation check that used the pre-write numbers would miss the
   crossing it is there to catch;
5. push the key onto the index and write `notifications-dedupe.json` (temp + rename);
6. if `size_after > MAX_BYTES` or `count_after > MAX_EVENTS`, call the **internal** `rotateUnlocked()`,
   which also replaces the cache with the post-rotation `{ dev, ino, size, count }` (a rotation is a
   `rename`, so the inode changes and the next append cannot mistake the new file for the old one);
7. release.

Two rules make this correct rather than merely locked:

- nothing inside steps 1–6 may `await`, yield, or call back into `appendNotification`: the critical
  section is fully synchronous, so no other append can interleave between the size check and the
  rename. This is exactly what the naive "rotation takes a lock, appends do not" design gets wrong:
  the rotation is locked against itself, but not against the writer that makes it necessary;
- `rotateUnlocked()` is not exported and never acquires the lock itself. A nested `wx` acquire would
  fail on its own lock file, then wait out the 5 s stale timeout and delete a *live* lock. Rotation
  has exactly one entry point: the append critical section.

**Rotation trims by count AND by bytes.** Trimming to `KEEP_EVENTS` lines alone cannot honour a
byte cap: with the per-event ceiling from §4.2 step 4 (4096 bytes) 1500 lines can reach ~6 MiB, and even
a typical ~1.4 KiB line puts 1500 lines at ~2.1 MiB — already over `MAX_BYTES`. So rotation walks
the file **from the end** and keeps the newest lines while both budgets hold:

```text
kept = []; bytes = 0
for line in reverse(lines_of(current_file)):
    if len(kept) == KEEP_EVENTS: break
    if bytes + len(line) + 1 > KEEP_BYTES and len(kept) > 0: break
    kept.append(line); bytes += len(line) + 1
write notifications.jsonl.tmp = join(reverse(kept), "\n") + "\n"
rename(notifications.jsonl.tmp, notifications.jsonl)
```

Properties, all of them unit-testable:

- after any rotation `size <= KEEP_BYTES = 1.5 MiB < MAX_BYTES`, so the size bound is guaranteed
  rather than "usually true";
- the 25 % headroom under `MAX_BYTES` means the next rotation happens ~500 KiB later instead of on
  the very next append — the amortization the count-only trim was aiming for;
- the cap is evaluated on the **post-write** numbers inside the same critical section (step 6 above),
  so a completed append never leaves the file over `MAX_BYTES`: if this line crossed the cap, the
  rotation happens before the lock is released and the next append starts from `KEEP_BYTES`. The only
  over-cap size that ever exists is the transient `MAX_BYTES + byteLength(line)` (≤ 4096 bytes more,
  the §4.2 ceiling) in the instant between the write and the rewrite — never a state a second append
  can observe;
- at least one line is always kept (`len(kept) > 0` guard), and the file always ends on a line
  boundary with a trailing `\n`, so a reader never sees a half line produced by rotation;
- the trim only drops the oldest lines and never rewrites the survivors, so redaction and `seq` are
  untouched by it.

**Event counting is exact inside the lock — no drift is permitted.** The previous revision admitted
that a process-local counter could lag when a second process appends, which would mean `MAX_EVENTS`
was not actually guaranteed. That is not acceptable, so the count is derived from the file itself at
the moment the cap is evaluated, inside the critical section:

- the module caches the state **it left behind**: `{ dev, ino, size, count }`, where `size` is the file
  size *after* its own last append and `count` is the number of lines at that moment;
- at the start of the next append — before this line is written, which is the only moment the
  comparison means anything — it stat's the file once and compares `statSync(path).size` with the
  cached `size` **and** `{ dev, ino }` with the cached pair. The current line is deliberately *not*
  part of the comparison: adding `len(line)` there would make every clean append look foreign (the
  bytes are not on disk yet) and would let a foreign write of exactly `len(line)` bytes pass as clean;
- equal size, same inode → the file is exactly as this process left it, so the count is `cached.count`
  and the new line takes it to `count + 1` (O(1), the normal path);
- anything else → another process (or a rotation) wrote since, so the line count is recomputed by
  scanning the file for `\n` **before** the cap check (O(file size), only on the foreign-write path),
  and — in the same pass — the dedupe index is merged with the keys the file holds (§3.5);
- after the write, the cache is updated to the new `{ dev, ino, size, count }` — the post-write state,
  so the next comparison starts from the truth.

**Size alone is not a cache key**, and the previous revision was wrong to say it was: a rotation
rewrites the file to a smaller prefix, and the appends that follow can bring it back to exactly the
size the cache remembers while the line count and the key set have changed underneath. What makes the
check sound is the **inode**: rotation publishes through `rename`, so the file the cache described is
replaced by a new one, and `{ dev, ino }` changes even when the byte count comes back. A foreign append
always adds at least one byte, so it cannot hide behind an unchanged size either. With both parts
compared, the count and the key set are exact at the moment they are evaluated, for one writer and for
several.

The byte cap needs no such care — one `statSync` is already exact and cross-process safe.

Crash safety: a process dying inside the critical section leaves a stale lock file that is taken
over after 5 s (`runs.ts:85-101` uses the same policy). An orphan `notifications.jsonl.tmp` is
harmless, because rotation always truncates that path and the original file is untouched until
`rename`. Readers take no lock at all: `rename` swaps the inode, so a reader sees either the old
file or the new one, never a half-written one.

`seq` is **not** reset by rotation, and it is allocated in the same critical section as the append
that consumes it: the next id is `max(seq_in_file, read_seq, seq_file) + 1`, tracked in
`<state>/notifications-seq` (single integer, atomic write). Two processes therefore cannot hand out
the same `seq`, and ids keep increasing after a rotation that dropped every old event, so the
watermark stays meaningful.

### 3.4 Unread state and why the server owns it

One integer watermark `read_seq`:

- `unread(event) := event.seq > read_seq`;
- the dialog's "unread only" filter is that predicate;
- an agent's badge exists iff that agent has at least one event with `seq > read_seq`;
- "mark all read" sets `read_seq = latest_seq` (monotonic, never decreases).

**Monotonicity is enforced inside the lock, not by convention.** `markNotificationsRead(upTo)` runs
in the same `withNotificationsLock` critical section as append and rotation (§3.3) and performs
read → `next = max(current, clamp(upTo))` → atomic temp+rename → release. Two concurrent calls can
therefore never interleave as "read 0 / read 0 / write 20 / write 10": the second call reads the 20
the first one wrote and keeps it. Taking the *same* lock as append matters for a second reason —
`clamp(upTo)` is bounded by `latest_seq`, and `latest_seq` only moves in that critical section, so a
concurrent append cannot slip an event past the clamp and get it marked read before it exists.

The route that exposes this is specified in §4.3; the client never writes the watermark itself.

Readers of `read_seq` (the SSE summary, `GET /api/notifications`) do not take the lock. That is safe
because writes are monotonic: a stale read can only be *behind*, so a badge may linger for at most
one frame and never returns after being cleared.

**Clamping is part of the contract.** `upTo` is clamped to `latest_seq`, so a client cannot mark
events as read before they exist. Without the clamp, a single `up_to_seq: 999999999` would suppress
every future badge forever — the failure looks like "notifications stopped working" and has no
obvious cause. With it, the worst a client can do is mark everything that currently exists.

Why not per-event `read: true` flags: rewriting a JSONL file per flag flip is exactly the
read-modify-write hazard of §3.2, and a watermark is 8 bytes.

Why the server and not `localStorage`:

- history is written by two producers; `localStorage` cannot see the ingest writer at all;
- the same fleet is opened from several windows/profiles/browsers at once; unread state must agree
  between them, and `localStorage` is per-profile;
- clearing browser data or using a private window would resurrect every old badge;
- the owner explicitly wants F5 to preserve badge behaviour, and a server watermark makes that
  structural rather than accidental.

### 3.5 Duplicate suppression is durable, not a 60-second window

The earlier revisions suppressed duplicates "within 60 s", which cannot carry the promise §2.2 makes:
a retry after a failed state write can legitimately arrive an hour later, and a time window plus a
process-local map would either duplicate the row or forget the key on restart. The store therefore
keeps a **bounded key index on disk**:

- `<state>/notifications-dedupe.json` =
  `{ "keys": [{ "key": "…", "id": "n_57_a1b2c3", "seq": 57, "at": "…" }, …] }`, newest last, capped at
  `DEDUPE_MAX_KEYS` = 500 entries (key ≤ 120 chars, id = `n_<seq>_<rand6>`, so the file stays under
  ~100 KiB). The **id is stored, not derived**: it carries a random suffix, so it cannot be
  reconstructed from `seq`, and the duplicate answer must return the original one even after rotation
  has removed the row;
- **the two stores are authoritative for different things, and the reconciliation is a merge, not a
  rebuild.** The log is authoritative for *content* (and for keys that are still in it); the index is
  authoritative for keys whose **rows have been rotated away** — ring rotation deletes lines, so after a
  rotation the log no longer mentions keys that the index legitimately still holds, and rebuilding the
  index from the log alone would forget them and let a retry duplicate an event that the bound of 500
  was supposed to keep covered. So:
  - the append path re-scans the log when its cache is stale — a different `{ dev, ino }` or a size
    that does not match, which is how a rotation (new inode) and a foreign append (new bytes) are both
    caught, and how a cold cache after a restart matches nothing (§3.3) — and collects the `dedupe_key`
    values it finds — the same scan §3.3 already performs for the exact count, so the cost is the one
    that path already pays;
  - the result is **merged** with the index already on disk: entries are unioned by `key`, sorted by
    `seq`, and only then truncated to the newest `DEDUPE_MAX_KEYS`. An entry that the log no longer
    contains survives the reconciliation; an entry that the log has and the index lacks (the crash
    window) is added;
  - that merge closes both windows at once: a crash between the append and the index write is healed
    (the key comes from the log), and a rotation cannot silently drop a key that still belongs to the
    kept 500 (the key comes from the index). Neither store is a cache of the other; the merge is the
    rule;
- `appendNotification(input)` consults the index **inside the same `withNotificationsLock` critical
  section** as the append and the rotation (§3.3), in this order: reconcile-if-stale → present? return
  `{ id, seq, duplicate: true }` → else append the line → push the key (evicting the oldest) → write the
  index with `temp` + `rename` → rotate if a cap is exceeded. A crash after the append and before the
  index write is therefore healed by the next append, and a crash *before* the append leaves nothing
  behind at all;
- the index is written with `temp` + `rename` under that lock, like the read watermark (§3.4), so a
  crash cannot leave it half-written and two processes cannot both decide "not present" — and if the
  file *is* lost or truncated, the next append rebuilds it from the log instead of trusting it;
- cleanup: the index is bounded by construction, and the whole file goes with the state tree — there is
  no separate history to prune;
- the event stores its own `dedupe_key` (§2.1), so the log alone explains why a row exists, and a
  human can grep for the key that suppressed a second one.

Consequences worth stating: the guarantee is per **key**, not per event — an event appended without a
`dedupe_key` (a plain supervisor message) is never suppressed; and eviction is a real limit, so a key
older than the last 500 is forgotten and would be appended again. 500 is chosen so that the two product
kinds — at most a few per run per day — are never evicted before the flow is closed, and the ingest
path gets the same durable behaviour for free when it sends a key.

## 4. HTTP

### 4.1 Read: `GET /api/notifications?limit&run&since&unread`

| param | meaning | default | bounds |
| --- | --- | --- | --- |
| `limit` | newest N events | `200` | `1..500`, clamped, non-numeric → default |
| `run` | filter by `run_id` | none | exact match, string compare |
| `since` | return events with `seq > since` | `0` | integer |
| `unread` | `1` → only `seq > read_seq` | off | anything else ignored |

Response:

```json
{
  "notifications": [ /* newest first */ ],
  "read_seq": 41,
  "latest_seq": 57,
  "unread_count": 3,
  "server_now": "2026-10-31T18:40:09.900Z",
  "pulse_ms": 5000,
  "pulse": { "agent-abc": { "seq": 57, "pulse_ts": "2026-10-31T18:40:05.400Z", "count": 2 } }
}
```

`pulse` is precomputed by the server: for every agent with at least one unread event, the latest
one. That is the entire data the badge needs, and it keeps the client from scanning the list.

`pulse_ts` is the **`received_at`** of that event (§2.1), i.e. server clock — never the producer's
`ts`. This is the fix for an unbounded badge: whatever the supervisor puts in `ts`, the window it
can open starts at the moment the server accepted the event.

`server_now` is the server's clock at response time. It is sent because the badge compares a
server-stamped timestamp against the browser's `Date.now()`, and the two clocks may differ; with
`server_now` the client derives the offset once per frame (§6.2) instead of assuming the browser
agrees with the server.

`pulse_ms` is sent along with the data so the client never has to know the config key name.

Also added to the SSE summary and to `GET /api/state` — a **summary only** (how the client consumes it: §5.4):

```json
"notifications": {
  "latest_seq": 57, "read_seq": 41, "unread_count": 3,
  "server_now": "2026-10-31T18:40:09.900Z", "pulse": { … }
}
```

`pulse` is small by construction (one entry per agent with unread events, at most `max_agents`),
and the SSE string-diff at `server.ts:167` means it only re-sends when it actually changes.

### 4.2 Write: `POST /api/notifications` (ingest)

Request body (all other fields are server-derived):

```json
{
  "kind": "agent.needs_human",
  "severity": "warn",
  "project": "reevesagents",
  "run_id": "run-1a2b",
  "run_name": "webui-notify",
  "agent_id": "agent-9f3c",
  "agent_nickname": "devglm",
  "ts": "2026-10-31T18:40:02.113Z",
  "title": "CHANGES на блок 01",
  "detail": "ревью вернуло замечания, нужен человек",
  "dedupe_key": "optional-stable-string"
}
```

`source` is forced to `"external"` by the server — an ingest caller cannot claim to be the
product. `dedupe_key`, when present, suppresses a duplicate **for good**: the store keeps a bounded
on-disk key index (§3.5) inside the append critical section, so a retrying supervisor loop cannot flood
the log even across restarts, and the answer to a suppressed call is `200 { id, seq, duplicate: true }`
with the original id — read from the index entry, which is why the id is stored there (§3.5): the row
itself may already have been rotated out, and the caller still gets the identity it was first given.

Guard chain, in order (each returns a distinct status so the caller can see which rule fired):

1. `isAllowedHostHeader` (`guards.ts:24-28`) — already applied to every request at
   `server.ts:420-423`; ingest inherits it. Fail → `403 forbidden host`.
2. `isAllowedOrigin` (`guards.ts:37-48`) via `isStateChangingMethod` (`server.ts:424-427`) — the
   request **must** carry `Origin: http://127.0.0.1:<port>` for the bound port.
   Fail → `403 forbidden origin`. This is not a new mechanism; it is the existing CSRF gate, and
   the documented contract for the supervisor is simply "send the Origin header".
3. Loopback peer check (new, in the route): `req.socket.remoteAddress` must be
   `127.0.0.1`, `::1` or `::ffff:127.0.0.1`. Fail → `403 forbidden peer`. Defense in depth: if a
   future change binds a wider interface, the origin guard alone would still pass a request from
   a loopback-sourced proxy.
4. Body: `readJsonBody` (`server.ts:205-218`) enforces `MAX_BODY` = 64 KiB while streaming
   (`:211`). Per-event caps are tighter and validated separately, so a single event cannot be
   64 KiB: `title <= 200`, `detail <= 1000`, `run_name <= 80`, `project <= 64`, `run_id/agent_id/
   agent_nickname <= 64`, and the total serialized line **<= 4096 bytes**. The bound exists so a
   single line stays cheap to parse and to rotate and always fits `KEEP_BYTES` by three orders of
   magnitude — it is *not* a `PIPE_BUF` argument (see the correction in §3.2). Fail → `400 { error }`.
5. Schema: `kind` must be one of §2.2; `severity` one of `info|warn|error`; `project` must not
   contain `/` or `\`; unknown top-level keys are ignored, not rejected (forward compatibility
   for the supervisor).
   `ts` is **optional and display-only**: it is kept when it parses as an ISO date *and* falls
   inside `[server_now - 5 min, server_now + 5 min]`; anything else (unparsable, future beyond the
   window, absurd age) is replaced by the server's own time and the event is still accepted —
   a bad producer clock must not be able to reject or stall a notification. `received_at` is
   always stamped by the server from its own clock and is **not** accepted from the request body
   (a supplied `received_at` is ignored like any other unknown key). Because the badge window is
   computed from `received_at` and never from `ts` (§2.1, §6.2), a future `ts` cannot extend it.
   Fail → `400 { error: "<field> <reason>" }`.
6. Rate limit: in-memory token bucket per peer address, capacity 30, refill 1/s. Fail → `429
   { error: "rate limited" }` with `retry-after: 1`.
7. Redaction: `redactSecrets` (`redact.ts:14-18`) applied to `title`, `detail`, `run_name`,
   `agent_nickname` before the line is written. Not optional, and not applied on read: the log on
   disk must never contain a key.
8. Append inside `appendNotification()`'s single lock acquisition (§3.3): assign `seq`, stamp
   `received_at = nowIso()` from the server clock, update `latest_seq`, rotate if a cap is
   exceeded.
   Success → `201 { id, seq, received_at, unread: true }`.

No authentication token is added. The threat model is unchanged from the rest of the server
(`server.ts:2-5`: loopback only, no login); a token would have to be shared with a bash script,
which is a worse secret-handling problem than a loopback origin check. The `Origin` requirement
already blocks the realistic attack (a web page in the user's browser posting cross-site).

### 4.3 Mark read: `POST /api/notifications/read`

The "Mark all read" button (§5.1, §5.5) has to move the *server* watermark — §3.4 explains why a
`localStorage` flag is not the design — so the HTTP surface needs a third route. Without it the
button can only clear the local view, and the next SSE frame or F5 resurrects every badge.

| field | value |
| --- | --- |
| method / path | `POST /api/notifications/read` |
| body | `{ "up_to_seq": 57 }` — optional; omitted or `null` means `latest_seq` |
| effect | `read_seq = max(read_seq, min(up_to_seq, latest_seq))`, written under `withNotificationsLock` (§3.3, §3.4) |
| response `200` | the same summary object as §4.1: `{ read_seq, latest_seq, unread_count, server_now, pulse }` |
| `400` | `up_to_seq` present but not a non-negative integer → `{ error: "up_to_seq must be a non-negative integer" }` |
| `403` | `forbidden host` / `forbidden origin` / `forbidden peer` — the identical guard chain as §4.2 |
| `500` | lock timeout (`Timed out waiting for notifications lock`, same shape as `runs.ts:118`) |

Properties:

- **idempotent**: repeating the call with the same or a smaller value changes nothing;
- **clamped** to `latest_seq` (§3.4), so a client cannot mark the future as read;
- **monotonic** under concurrency: the read-max-write is one critical section, so a smaller
  watermark can never overwrite a larger one;
- returns the fresh summary so the clicking tab updates the badge and the "unread only" filter
  immediately; other tabs get it from the next SSE frame, because `read_seq`/`unread_count`/`pulse`
  are part of the summary and the frame is only sent when the serialized payload actually changes
  (`server.ts:167`);
- no rate limit: this is a click-driven state change, not a producer path. Body parsing uses
  `readJsonBody` (`server.ts:205-218`), so the `MAX_BODY` ceiling applies here too.

Route placement: with the other notification routes — `GET /api/notifications` next to
`GET /api/events` (`server.ts:486`), and both POST routes in the POST block after
`POST /api/presets/save` (`server.ts:548-556`), before the parameterised presets regexes at
`:557`. The path is static, so it cannot be shadowed by those regexes.

### 4.4 How the supervisor reaches the server

The port is dynamic (`DEFAULT_PORT 8080`, `DEFAULT_RANGE 10`, `server.ts:47-48`, fallback at
`:652-672`), so the supervisor cannot hardcode it. `startWebServer` therefore writes
`<state>/web.json` after the bind and unlinks it on `close`:

```json
{ "url": "http://127.0.0.1:8083", "port": 8083, "pid": 12345, "started_at": "…" }
```

Atomic temp+rename, `0600`, same style as `open-token.ts:19-22`. The supervisor reads it, checks
`/healthz`, and skips silently when the Web UI is not running (a missing web UI must never break
the fleet loop).

### 4.5 One-line ingest example for the fleet supervisor

The supervisor is **not** modified in this cycle; this is the contract it will use:

```sh
post_event() { # post_event <kind> <severity> <title> <detail>
  local state="${REEVES_REGISTRY:-$HOME/.reeves}" f url body code
  f="$state/web.json"
  [ -r "$f" ] || return 0
  url=$(sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$f")
  [ -n "$url" ] || return 0
  # Serialise with a real JSON encoder: printf cannot escape a quote, a backslash or a newline, and a
  # title with an apostrophe would silently produce an invalid body.
  body=$(python3 -c 'import json,sys
kind,severity,project,run_id,agent_id,title,detail = sys.argv[1:8]
print(json.dumps({"kind": kind, "severity": severity, "project": project,
                  "run_id": run_id, "agent_id": agent_id, "title": title,
                  "detail": detail, "source": "external"}))' \
    "$1" "$2" "$PROJ" "${RUN_ID:-}" "${AGENT_ID:-}" "$3" "$4") || return 0
  # -w captures the status: curl exits 0 on an HTTP 400, so it has to be checked explicitly.
  code=$(curl -sS -m 2 -o /dev/null -w '%{http_code}' -X POST "$url/api/notifications" \
      -H "Origin: $url" -H 'content-type: application/json' \
      --data-binary "$body" || echo 000)
  case "$code" in 2*) return 0 ;; *) printf 'notify: HTTP %s from %s\n' "$code" "$url" >&2; return 0 ;; esac
}
```

Three things in that snippet are load-bearing:

- the `-H "Origin: $url"` header is mandatory — without it the existing origin guard answers
  `403 forbidden origin` (`server.ts:424-427`, `guards.ts:37-48`);
- the body goes through a JSON encoder (`python3 -c 'json.dumps…'`, argv — not string interpolation), so
  a quote, a backslash or a newline in a title cannot break the request. The previous revision used
  `printf` with `%s` placeholders, which produces invalid JSON the moment a title contains `"`;
- the HTTP status is checked, not curl's exit code: `curl` exits 0 for `400 Bad Request`, and
  `-o /dev/null` hides the body, so a broken request would have looked exactly like a delivered one.
  The function still returns 0 on any failure — a dead or hung Web UI must never stall the fleet loop —
  but it says so on stderr instead of swallowing it. `-m 2` keeps a hung server from blocking.

## 5. UI: the Logs dialog

**Shipped (block 16)** as one dialog with two tabs, `#insights-dialog`, opened by `#logs-btn` (header, right after
About). The Plan tab is the default when the selected run has a plan, otherwise Logs. Ids: `#insights-tab-plan`,
`#insights-tab-logs`, `#plan-progress-bar`/`#plan-progress-fill`/`#plan-progress-text`, `#plan-filter-all|open|waiting`,
`#plan-list`, `#plan-waiting`, `#plan-detail`, `#plan-empty`, `#logs-list`, `#logs-filter-run`, `#logs-unread`,
`#logs-mark-read`, `#logs-empty`, `#logs-error`, `#logs-announcer` (`aria-live="polite"`). Live refresh rides the
existing SSE state frame — a new `notifications.latest_seq` reloads `GET /api/notifications`, no second poller. The
plan payload comes from a new read-only `GET /api/plan?run=<id>` that reuses `planItemView` (no brief bodies).

The agent-card pulse is `.card-pulse`: its length is computed by `insights-core.js` (`pulseRemaining`) from the newest
unread event's **server** `received_at`, so a reload keeps the remainder; `agent_pulse_ms = 0` draws nothing, and the
whole animation is suppressed under `prefers-reduced-motion`.

### 5.1 Markup

`index.html`, after `about-btn` (line 29):

```html
<button id="logs-btn" class="btn btn-secondary" type="button">Logs</button>
```

and a dialog after `presets-dialog` (which closes at `index.html:302`, just before the
`xterm.js`/`app.js` script tags at `:304-306`), following `about-dialog`'s structure:

```html
<dialog id="logs-dialog" class="dialog mcp-dialog">
  <div class="mcp-panel">
    <div class="dialog-header">
      <div class="dialog-title">Logs</div>
      <div class="dialog-subtitle">Notifications from your runs and agents.</div>
    </div>
    <div class="logs-filters">
      <label class="logs-filter">
        <span>Run</span>
        <select id="logs-filter-run" aria-label="filter by run"></select>
      </label>
      <label class="logs-filter logs-toggle">
        <input id="logs-unread" type="checkbox" />
        <span>Unread only</span>
      </label>
    </div>
    <div id="logs-announcer" class="visually-hidden" aria-live="polite"></div>
    <div id="logs-list" class="logs-list" role="list" aria-label="notifications"></div>
    <div id="logs-empty" class="logs-empty" hidden>
      <div class="empty-title"></div>
      <div class="empty-body"></div>
    </div>
    <div id="logs-error" class="dialog-error" hidden></div>
    <div class="dialog-actions">
      <button type="button" id="logs-mark-read" class="btn btn-agent">Mark all read</button>
      <button type="button" id="logs-close" class="btn">Close</button>
    </div>
  </div>
</dialog>
```

### 5.2 Row content

Per event, a `.logs-row` with `role="listitem"` and `tabindex="-1"`:

- `.logs-time` — `shortIso(event.received_at)` (`app.js:2191`) plus a relative hint ("3 min")
  recomputed on open only; when the producer `ts` differs from `received_at`, the row's `title`
  shows both, because the server receipt time is the one that is trustworthy (§2.1);
- `.logs-project` — `event.project`, with `event.run_name` as `.logs-run` next to it;
- `.logs-agent` — `event.agent_nickname || event.agent_id`;
- `.logs-title` — `translate(kind)` badge + `event.title`;
- `.logs-detail` — `event.detail`, clamped to two lines with CSS, full text in `title=`;
- `.logs-source` — only rendered when `source === 'external'`, as a small pill;
- `data-severity` / `data-unread` attributes for styling.

Every text node is created with `document.createElement(...).textContent = ...` — no `innerHTML`
with event data anywhere. The only existing `innerHTML` use is clearing a container
(`el.sidebarList.innerHTML = ''`, `app.js:914`), which stays safe because it is a constant.

### 5.3 Filters

- Run filter: `<select id="logs-filter-run">` populated from `runs` + `history` (value `''` = all).
  The list is filtered **client-side** from the loaded page of events; the `run` query parameter
  exists for the supervisor/other clients and for a future "load more".
- "Unread only" toggles the `seq > read_seq` predicate client-side, re-rendering without a fetch.
- "Mark all read" (`#logs-mark-read`) calls `POST /api/notifications/read` (§4.3) with `up_to_seq`
  omitted, so the server clamps to `latest_seq`; then it applies the returned summary and
  re-renders. An event that arrives between the last fetch and the click is marked read as well —
  that is what the label promises, and the dialog is live-updating, so the user is looking at
  current data when clicking. On failure the button shows `#logs-error` and the watermark stays
  where it was: the local view is never cleared optimistically, so a failed request cannot fake a
  "read" state that the next frame would contradict.
- The dialog loads `limit=200` on open. A footer line shows `N of M` when `latest_seq` implies
  more than the loaded page; "Load older" is deliberately **out of scope** for blocks 02–03 —
  200 events covers the owner's stated need ("что я пропустил за последние часы") and the ring is
  2000, so anything older is better served by a future export.

### 5.4 Live update: SSE summary, not a second poll

The dialog does not poll. It subscribes to the stream that already exists:

- `subscribe()` (`app.js:363-380`) already receives every SSE frame;
- the frame gains `notifications: { latest_seq, read_seq, unread_count, pulse }` (§4.1);
- on a frame where `latest_seq` changed **and** the dialog is open, the client re-fetches
  `GET /api/notifications?limit=200` — one small request per actual change, at most once per
  `POLL_MS` (1500 ms, `server.ts:49`);
- when the dialog is closed, only the badge is touched (summary only, no fetch).

Why not a dedicated poll: a second 1500 ms timer would duplicate the cadence the SSE poller already
has, and two independent timers drift, so the badge and the list would disagree. Why not the full
list inside SSE: `tick()` diffs whole serialized payloads (`server.ts:167`) — 200 events ≈ 40 KB
would be re-serialized and re-sent on every unrelated state change (any agent's status flip), and
the SSE hub would grow into a log transport. Keeping SSE to integers is what makes hundreds of
events cheap.

### 5.5 Keyboard and accessibility

- `dialog.showModal()` gives focus trap + Escape for free (same as every other dialog here);
- on open, focus goes to `#logs-list`'s first row (or `#logs-close` when empty);
- `ArrowDown`/`ArrowUp` move focus between rows (roving `tabindex`), `Home`/`End` jump,
  `Enter` on a row opens that agent (`attach(agent_id)`, `app.js:1253`) when the agent still
  exists;
- Escape closes and returns focus to `#logs-btn` (the button that opened it);
- `role="list"` + `role="listitem"`, `aria-label` on the list, unread rows carry
  `aria-label` suffix from `web.logsUnreadOnly`;
- `#logs-announcer` (`aria-live="polite"`) announces only `"+N new"` summaries, never the whole
  list, so a chatty stream does not machine-gun a screen reader.

Note: `app.css` has no `.visually-hidden` utility today (`grep -n "visually-hidden\|sr-only"
src/surfaces/webui/client/app.css` returns nothing), so block 03 must add one
(`position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%)`).

### 5.6 `prefers-reduced-motion`

`app.css:2150-2159` already collapses every transition/animation to 0.001 ms and one iteration
when reduced motion is requested. The badge must therefore be **visible without** its animation:
it is a solid 8 px dot with a static box-shadow, and `@keyframes pulseDot` only adds scale/opacity
on top. No information is carried by motion alone, and no JS timer is skipped.

## 6. The pulse badge on the agent card

### 6.1 Data it lives on

`pulse[agent_id] = { seq, pulse_ts, count }` from the notification summary (§4.1) — the latest
**unread** event for that agent, where `pulse_ts` is that event's `received_at` (server clock), not
its producer `ts`. The card needs nothing else; it does not read the log list.

### 6.2 Remaining time is computed, not counted

```js
// server_now ships with every frame; it converts server clock into browser clock once.
const skew = Date.parse(serverNow) - Date.now()
const remaining = Date.parse(pulse.pulse_ts) + pulse_ms - (Date.now() + skew)
if (remaining > 0) showBadge(agent.id, pulse.count)
```

Four reasons for exactly this shape:

- F5 mid-pulse: the same arithmetic yields the correct remainder, so the badge either survives with
  less time left or is gone — exactly as if the tab had never closed;
- two tabs agree without coordination: no per-tab timer state exists;
- no drift: a `setTimeout` chain would accumulate error and would restart the full window on every
  re-render;
- the window is **bounded by the server's own clock**. `pulse_ts` is `received_at`, so a producer
  (or an ingest caller) cannot open an arbitrarily long badge by sending a future `ts` — the worst
  case a caller can achieve is a window that starts *now*, i.e. exactly `pulse_ms`. The `skew` term
  exists so that this holds even when the browser's clock disagrees with the server's: without it,
  the comparison would mix two clocks and a browser running an hour ahead would simply never show a
  badge, while one running behind would show it too long.

`pulse_ms` comes from the server payload (default 5000, §7), so tuning the interval is a config
change with no client rebuild.

Scheduling: exactly one timer, armed for the earliest future expiry:

```js
function schedulePulseExpiry() {
  if (pulseTimer) clearTimeout(pulseTimer)
  const skew = Date.parse(serverNow) - Date.now()
  const now = Date.now() + skew           // "server now" in this browser
  const next = Math.min(...Object.values(pulse).map(p => Date.parse(p.pulse_ts) + pulseMs).filter(t => t > now))
  if (!Number.isFinite(next)) return
  pulseTimer = setTimeout(() => { pulseTimer = null; renderSidebar() }, next - now + 20)
}
```

`renderSidebar()` rebuilds the list (`app.js:905-1017`), which is how the badge disappears —
there is no per-node update path, and adding one would duplicate `renderCard`. With ≤ `max_agents`
(default 100, `config.ts:16`) entries, one full re-render at expiry is negligible; it happens at
most once per event burst, not per tick.

### 6.3 Where it renders

Inside `renderCard` (`app.js:1115-1199`), appended to the avatar wrapper (`:1128-1131`):

```html
<span class="avatar">DM<span class="card-pulse" data-count="2" title="…"></span></span>
```

- position: `absolute`, top-right of the avatar, 8 px dot, color `var(--agent-color)` with a
  contrasting ring, so it works in both themes (`:root` `app.css:3`, light overrides
  `app.css:58`) and for every provider color (`providerColor`, `display.ts:31`);
- the avatar box itself must gain `position: relative`: today `.avatar` is
  `display: grid; place-items: center` with no positioning context (`app.css:1019-1031`), so an
  absolutely positioned child would otherwise anchor to the nearest positioned ancestor;
- `data-count` renders as a superscript number only when `count >= 2`;
- `aria-label` on the card's `card-main` button gains the notification count, because a purely
  visual dot is invisible to assistive tech;
- `title` carries the latest event's title (already `textContent`-safe).

### 6.4 Several events in a row

- `pulse[agent_id].pulse_ts` is the **latest** unread event by construction (the server takes the
  highest `seq` and reports its `received_at`), so the window restarts on each new event: the dot
  never blinks off between two events;
- `count` accumulates all unread events for that agent and shows as a number when `>= 2`;
- "mark all read" clears `pulse` entirely (all `seq <= read_seq`), so the badge cannot outlive the
  user's acknowledgement;
- a burst of `N` events within one second still yields exactly one window of `pulse_ms` measured
  from the **last** one — there is no per-event queue and therefore no way for a burst to multiply
  the badge lifetime;
- the badge is not a per-event animation queue: one dot, one window, one count. Anything fancier
  becomes noise at fleet scale (5 runs × 3 agents).

### 6.5 Narrow terminal / mobile

- the card tail already holds status dot + open hint + lifecycle button (`:1155-1199`), and at
  `@media (max-width: 520px)` (`app.css:2011`) the layout compacts; the badge lives on the avatar,
  not in the tail, so it costs zero horizontal space at every breakpoint (`860px:1926`,
  `720px:1944`, `520px:1990` exist today);
- below `520px` the count is hidden (`display: none` on `.card-pulse[data-count]::after`) and only
  the dot remains — the information stays available through the card's `aria-label` and the Logs
  dialog;
- the dot is 8 px with a 2 px ring, i.e. ≥ 12 px touch-neutral target, and it is not itself
  clickable, so it never competes with the card's open/stop buttons for taps.

## 7. Config: the pulse interval

Key: **`agent_pulse_ms`**, `kind: 'nonneg-int'`, default **5000**, `0` disables the badge.
Rationale for the name: `GlobalConfig` uses `snake_case` with an `_ms` suffix for every duration
(`peek_interval_ms`, `ready_delay_ms`, `max_lifetime_ms`, `types.ts:118-128`), and the thing being
configured is the agent badge, not a generic UI animation.

`nonneg-int` is chosen over `posint` for consistency with the two existing duration keys that use
`0` as "off" (`ready_delay_ms`, `max_lifetime_ms`), so `0` = "never pulse" needs no new concept.
Known limitation, verified in `validateConfigField` (`config.ts:138-156`): there is **no upper
bound**, so `agent_pulse_ms: 86400000` is accepted and acts as "always on". A max would require
extending `ConfigFieldKind`; that is out of scope here and is noted in §8.

Exact list of files that must change because of `CONFIG_FIELDS` pinning and the byte-identical
mirror:

| file | what | why it is mandatory |
| --- | --- | --- |
| `src/core/types.ts` | add `agent_pulse_ms: number` to `GlobalConfig` (`:118-128`) | the field must exist on the type |
| `src/core/config.ts` | `DEFAULT_GLOBAL` (`:12-22`) += `agent_pulse_ms: 5000`; `mergeDefaults()` (`:46-67`) += validity check; `CONFIG_FIELDS` (`:107-117`) += `{ key: 'agent_pulse_ms', kind: 'nonneg-int', label: 'agent pulse (ms)' }` (insert after `max_lifetime_ms`, keeping the ms-tuning group together) | single source of truth for CLI/MCP/TUI/Web |
| `test/config-set.test.ts` | update the pinned key array (`:24-26`) and add accept/reject cases | the test pins exact order — it fails otherwise |
| `packages/reevesagents-win/src/shared/types.ts` | byte-identical copy of `src/core/types.ts` | `catalog-drift.test.ts:44-50` compares the two files byte for byte; refresh with `pnpm --dir packages/reevesagents-win sync:shared` |

Verified **not** to need changes (checked, so block 02 does not waste a cycle):

- `src/surfaces/cli/config.ts` — derives its key list from `CONFIG_FIELDS` (`:9`, `:22`, `:30`);
- `src/surfaces/mcp/server.ts:525` — same;
- `src/surfaces/tui/screens/Config.tsx:21` — `EDITABLE_FIELDS = CONFIG_FIELDS.filter(...)`;
- `src/surfaces/webui/server.ts:343,352` — same;
- `test/config.test.ts` / `test/config-global.test.ts` — they assert individual keys, not the whole
  object (`config.test.ts:31,52`, `config-global.test.ts:23,37,43`), so a new key does not break
  them.

The new label must also get i18n entries (`config.agent_pulse_ms` or the `translatePhrase` phrase
route used by `configPayload()` `server.ts:344`), because the Web config panel localizes labels
through `translatePhrase`.

## 8. Contract risks

1. **i18n key list.** 31 new keys (30 `web.*` keys that the guard scans, plus one config-panel
   phrase), and the exact set matters because the parity test scans `app.js` object literals
   (`test/i18n.test.ts:66-80`):

   `web.logs`, `web.logsSubtitle`, `web.logsEmpty`, `web.logsEmptyBody`, `web.logsFilterRun`,
   `web.logsAllRuns`, `web.logsUnreadOnly`, `web.logsMarkRead`, `web.logsMarkedRead`,
   `web.logsError`, `web.logsAgent`, `web.logsProject`, `web.logsSource`, `web.logsNewCount`,
   `web.logsCount`,
   `web.notifKindRunCreated`, `web.notifKindRunStopped`, `web.notifKindRunArchived`,
   `web.notifKindNeedsHuman`, `web.notifKindAgentFinished`, `web.notifKindAgentFailed`,
   `web.notifKindProbeFailed`, `web.notifKindExternal`,
   `web.notifKindFlowEscalated`, `web.notifKindFlowReviewTimeout`,
   `web.notifSeverityInfo`, `web.notifSeverityWarn`, `web.notifSeverityError`,
   `web.cardPulseTitle`, `web.cardPulseCount`,
   plus `config.agent_pulse_ms` for the config panel label (localized through `translatePhrase`,
   `server.ts:344`, so it is a phrase entry, not a `web.*` key).

   Each must be added to `src/i18n/locales/en.ts` (source) **and** to the `WEB_EN` map in
   `app.js:34-205`, otherwise the guard cannot see it. The nine other locales are a convention
   (no automated key-set check exists — see §1.6), so reviewers must check them by hand.

2. **`CONFIG_FIELDS` pinning plus the byte-identical Windows mirror.** One new key touches four
   files in two packages (§7). Root `pnpm test` does not run the win package's drift test
   (`vitest.config.ts:6`), so a forgotten mirror sync passes the root gate and fails
   `pnpm --dir packages/reevesagents-win verify` later. Block 02 must run both.

3. **Bundle size.** `app.js` is 86,377 bytes / 2190 lines today, no framework, no build step
   (served straight from `STATIC_ROUTES`, `server.ts:56-63`). The dialog + badge + scheduler is
   ≈ 6–8 KB of the same style of `createElement` code → ≈ 95 KB, still one file, still no
   dependency. Any proposal that adds a charting/date library or a template engine must be
   rejected: the repo has no runtime dependency that is not `@modelcontextprotocol/sdk`,
   `commander`, `ink`, `react`, `string-width`, `strip-ansi` (verified in `package.json`).

4. **XSS.** `title`, `detail`, `agent_nickname`, `run_name` and `project` all come from an
   external producer, i.e. they are untrusted strings that reach the DOM. Rule: `textContent`
   only, never `innerHTML`/`insertAdjacentHTML` with event data; the only allowed `innerHTML` is
   the existing constant `''` clear (`app.js:914`). Also never build the row's class list from a
   field value: `data-severity` is validated against the enum server-side (§4.2 step 5).

5. **Privacy.** No `displayPath` helper exists in 2.1.0 (verified: repo-wide grep returns
   nothing), so there is no existing path-shortening to reuse — basename must be enforced at write
   time (§2.1). Do not store prompt text: `detail` is capped at 1000 chars and redacted, and the
   agent's `task` field (`runs.ts:232-239`) is never copied into a notification. The file lives
   under `~/.reeves` with `0600`, next to data that is already that sensitive.

6. **Hundreds of events.** Three separate bounds keep this cheap: the ring (2000 events / 2 MiB,
   §3.3), the read page (`limit <= 500`, §4.1), and the SSE summary (integers + one `pulse` entry
   per agent with unread events, §4.1). The remaining cost is the full-file parse on read: with a
   2 MiB cap that is bounded, and it happens on dialog open / on change, not on the 1500 ms tick.

7. **Live fleet safety.** Anything that starts the Web UI runs the sweeps in the SSE snapshot
   (`server.ts:157-159`, `442-444`). Probes must use a private `REEVES_REGISTRY` +
   `REEVES_CONFIG` + `TMUX_TMPDIR` with `unset TMUX`, and count `reeves-*` sessions before and
   after (§1.11). The branch has no guard `651b5a6`.

8. **A dedupe key must name one flow's episode, and the index must be recoverable.** Three failure
   modes are easy to reintroduce: keying by `(run, head, kind)` suppresses a *second* escalation or
   timeout on the same commit after a resume; keying by `(run, kind, episode)` collides across
   `flow start --replace`, whose new flow counts its episodes from one again — so the key carries
   `flow_id` and `episode` (§2.2); and treating the index as authoritative loses the key of an event
   that was appended just before a crash — so the two stores are reconciled by a **merge** whenever the
   size check says it is stale: keys come from the log *and* from the index on disk, because rotation
   deletes rows the index still needs to remember, and the id of a rotated-out event can only come from
   the index entry itself (§3.5). Replacing the index with "whatever the log says" is the tempting
   simplification and it silently drops eviction-resistant keys. Any future "simplification" of any of
   these breaks the at-least-once promise §2.2 makes.

9. **`agent.finished` is ingest-only.** Anyone reading the kind list may assume the product
   detects turn completion. It does not (§2.2). If the owner wants product-side turn detection,
   that is a separate project with pane-content heuristics, and it should not be smuggled into
   block 02.

9. **Time authority, write-path atomicity, and counter exactness.** Three invariants that are cheap
   now and expensive to retrofit, so they belong to block 02 from the first line of code:

   - *time*: `received_at` is the only server-stamped, trusted timestamp. Anything that compares a
     stored time against "now" — the pulse window, relative labels, the `since` cursor's human
     display — must read `received_at`, and the client must convert it through the `server_now`
     offset (§6.2). A producer `ts` may only label an event, never gate a timer or a filter. Note
     that `nowIso()` (`runs.ts:70-72`) already exists and is what the append path should use;
   - *writes*: `appendNotification()` and `markNotificationsRead()` each own exactly one lock
     acquisition and one synchronous critical section — append + cap check + rotation, and
     read-max-write of the watermark respectively (§3.3, §3.4). A future refactor that makes either
     path `async`, or that calls rotation from anywhere else, silently reintroduces the lost-append
     window and the non-monotonic watermark this design closes;
   - *counters*: `MAX_EVENTS` is derived from the file inside the lock, never from a process-local
     increment that a second process can invalidate (§3.3). Any future caching must keep that
     property, or the guarantee silently degrades to "usually true" — and the cache key must include
     the inode, because a rotation followed by appends can restore the byte count the cache remembers
     while the line count and the key set have changed. The same rule covers `seq`
     allocation, which must stay in the append critical section or two processes can issue
     duplicate ids.

## 9. Blocks 02–03

### Block 02 — backend (journal, routes, config key, product hooks)

Code:

- new `src/core/notifications.ts`:
  `appendNotification(input)`, `readNotifications({ limit, run, since, unread })`,
  `markNotificationsRead(upTo)` (read-max-write under the lock, §3.4), `notificationSummary()`,
  the dedupe index (§3.5: consult inside the append section, push after a successful write),
  `normalizeNotificationInput(raw)`, internal `rotateUnlocked()`, `withNotificationsLock(fn)`,
  `nextSeq()`. Uses `stateRoot()` (`runs.ts:37`), the `withRunsLock` recipe (`runs.ts:82-115`) for
  its own lock file, `nowIso()` (`runs.ts:70-72`) for `received_at`, `redactSecrets`
  (`redact.ts:14`). No new dependency. `appendNotification` and `markNotificationsRead` are both
  synchronous and each owns a single lock acquisition (§3.3, §3.4).
- `src/surfaces/webui/server.ts`: `GET /api/notifications` (after `/api/presets`, `:478`, before
  `/api/events`, `:486`), `POST /api/notifications` (peer check + rate limiter + validator),
  `POST /api/notifications/read` (§4.3, same guard chain, no rate limit), `notifications` summary
  inside the SSE snapshot (`createSseHub`'s `snapshot()`, `:154-160`) and inside `GET /api/state`
  (`:445-451`), `web.json` write/unlink in `startWebServer` (`:674-730`, around the bind at `:665`).
- product emit points: `startRun`/`startRunFromPreset`/`startRunWithHead`/`spawnWorker`
  (`runtime.ts:367,433,485,535`) → `run.created`; `stopRun` (`:802`) → `run.stopped`;
  `archiveAndRemoveRun` (`runs.ts:481`) → `run.archived`; `createRunApproval` (`approvals.ts:141`)
  → `agent.needs_human`; the reaped list from `sweepAgentsThrottled()`
  (`reaper.ts:178-186`, `ReapedAgent` `reaper.ts:31-37`) → `agent.failed`; the stale-run branch of
  `autoCleanupRuns` (`runs.ts:565`) → `probe.failed`.
- config key per §7.
- no client changes in this block.

Verification:

| check | how |
| --- | --- |
| schema/validation | `test/notifications.test.ts`: reject unknown `kind`, unknown `severity`, `project` containing `/`, oversize `title` (201 chars); accept a minimal event and stamp `ts` when missing |
| round-trip + ordering | append 3 events in a temp `REEVES_REGISTRY`, read back newest-first, `seq` strictly increasing |
| ring by count | set the count cap low via the module's exported constants in the test build; append cap+1 → oldest dropped, `seq` continues |
| ring by size — **byte bound** | append events with long `detail` until > `MAX_BYTES` → after rotation assert `statSync(file).size <= KEEP_BYTES` **and** `<= MAX_BYTES`, and assert the byte walk stopped before `KEEP_EVENTS` lines (so the two budgets are independent) |
| ring by size — worst case | fill with lines at the §4.2 ceiling (4096 bytes) → 1500 lines would be ~6 MiB; assert the resulting file is still ≤ `KEEP_BYTES`, proving the count target cannot override the byte cap |
| rotation preserves survivors | after rotation every kept line parses, ends with `\n`, redaction markers intact, `seq` values unchanged, and `next seq` is greater than the last kept one |
| **lock protocol** | `test/notifications-lock.test.ts`: (a) one `appendNotification()` acquires the lock exactly once and removes it (injectable counter — no nested acquire); (b) `rotateUnlocked` is not exported and `appendNotification` is synchronous (assert the returned type is not a Promise); (c) **cross-process without rotation** — keep M below both caps, `child_process.spawn` a second node process appending M events to the same temp `REEVES_REGISTRY` while the parent appends M: assert exactly `2M` valid lines, no torn line, no duplicate `seq`, no gap in `seq`. This is the case the previous design lost writes on. |
| **cross-process with rotation** | same two writers, but with caps injected small enough that rotation runs: do **not** assert `2M` lines — rotation legitimately drops the oldest. Assert instead: no duplicate `seq`; `seq` strictly increasing within the retained range; the retained `seq` set equals the expected newest suffix `[last_kept - kept + 1 .. last_kept]`; nothing from that suffix is missing; every line is valid JSON ending with `\n` |
| **exact `MAX_EVENTS` with two writers** | inject a small `MAX_EVENTS`, append from two processes, and assert that after every append the file never holds more than `MAX_EVENTS` lines — the cap must fire exactly, not "eventually" |
| stale lock takeover | create `.notifications.lock` by hand with an old mtime → the next append proceeds within ~5 s and the lock is replaced, not obeyed |
| **received_at authority** | append with `ts` one hour in the future → stored `received_at` is within a second of now, and the pulse summary for that agent reports `pulse_ts` = `received_at` (not the future `ts`); repeat with `ts` unparsable and with `ts` two days old |
| future `ts` cannot extend the badge | `pulse_ms = 5000`, event with `ts = now + 1h` → `pulse.pulse_ts + pulse_ms <= server_now + 5000 + ε` |
| filters | `since`, `run`, `unread` and `limit` clamping (`limit=9999` → 500) |
| redaction | append a title containing `sk-ant-…` → stored line contains `[REDACTED]` and not the key |
| watermark is monotonic | `markNotificationsRead` under the lock: a smaller value never lowers it; two concurrent calls (20 and 10, started in both orders, plus an interleaving where both read before either writes) always end at 20; a later append leaves the watermark unchanged |
| watermark clamp | `up_to_seq` above `latest_seq` is clamped to `latest_seq`, and an event appended afterwards is still unread and still produces a pulse entry |
| mark read route | `POST /api/notifications/read` with the matching loopback `Origin` → 200 with `read_seq == latest_seq`; a following `GET /api/notifications?unread=1` returns an empty list; without `Origin` → 403; with `up_to_seq: "abc"` → 400; with `up_to_seq: null` → treated as `latest_seq` |
| SSE after mark read | mark read, then read the next SSE frame → `notifications.read_seq` equals the new value and `notifications.pulse` is empty, with no page reload |
| route guards | `test/web/notifications-route.test.ts`: POST without `Origin` → 403; POST with `Origin: http://evil.com` → 403; POST with the matching loopback `Origin` → 201 then visible in GET |
| body/rate limits | POST > 64 KiB → 400; 31 rapid events → 429 then recovers after refill |
| SSE summary | extend `test/web/server-actions.test.ts:423` (the existing first-frame test) to assert `notifications.latest_seq` and `notifications.server_now` are present |
| config | extend `test/config-set.test.ts` for the new array entry and for `agent_pulse_ms: -1` / `1.5` rejection |
| gates | `npx --yes pnpm@10.34.7 run typecheck`, `run lint`, `run test`, and `npx --yes pnpm@10.34.7 --dir packages/reevesagents-win run test` |

Ready when: all of the above pass, `git diff --check` is clean, the root and win-package gates are
green, and no probe ran against the shared tmux server (§1.11).

### Block 03 — UI (Logs dialog, badge, i18n)

Code:

- `index.html`: `#logs-btn` between `:29` and `:30`; `#logs-dialog` after `presets-dialog`
  (`:300`), per §5.1.
- `app.js`: `el` map additions (`:207+`), `openLogsDialog()`, `renderLogs(payload)`,
  `loadNotifications()`, `markAllRead()`, `schedulePulseExpiry()`, badge inside `renderCard`
  (`:1115-1199`), handlers next to the existing ones (`:2118-2140`), summary consumption in
  `subscribe()` (`:363-380`) and `applyState()` (`:348-361`), `WEB_EN` keys (`:34-206`).
- `app.css`: `.card-pulse`, `@keyframes pulseDot`, `position: relative` on `.avatar`
  (`:1019`), `.logs-*` block, `.visually-hidden` utility (§5.5 note), mobile rules under
  `@media (max-width: 520px)` (`:2011`), light-theme overrides next to `:root[data-theme="light"]`
  (`:58`).
- `src/i18n/locales/en.ts` + the nine other locales: the key list from §8.1.

Verification:

| check | how |
| --- | --- |
| client contract | extend `test/web/client-contract.test.ts` with `id="logs-btn"`, `id="logs-dialog"`, `id="logs-list"`, `id="logs-filter-run"`, `id="logs-unread"`, `id="logs-mark-read"`, `function openLogsDialog()`, `function renderLogs(`, `.card-pulse`, `class="logs-row"` |
| i18n | extend `test/i18n.test.ts` so every new `web.*`/`common.*` key resolves in `en` (§8.1) |
| unit | `npx --yes pnpm@10.34.7 run test` |
| manual browser run (private pair only) | `REEVES_REGISTRY=$(mktemp -d) REEVES_CONFIG=<tmp>/config.json TMUX_TMPDIR=<tmp> env -u TMUX node dist/cli.js web --port 8123 --no-open`, then: (1) open Logs on an empty registry → empty state, no console errors; (2) `curl` two events with a fake agent id → both appear without reload; (3) filter by run and "unread only"; (4) Mark all read → badge and unread filter clear, and after F5 they *stay* cleared (proves the server watermark rather than local state); (5) badge pulses ≈ 5 s and disappears; (6) F5 mid-pulse → badge still there with the remaining time; (7) set `agent_pulse_ms` to 15000 via the Config panel → pulse lasts 15 s without a rebuild; (8) DevTools "Emulate prefers-reduced-motion" → dot is static but visible; (9) Tab/Arrow/Escape through the dialog → focus lands correctly and returns to `#logs-btn`; (10) narrow the window to < 520 px → dot stays, count hides; (11) `curl` an event with `ts` set one hour in the future → badge still disappears after ≈ 5 s and the row's time shows the *server receipt* time, not the future one |
| fleet safety | count `reeves-*` tmux sessions before and after the manual run; they must be equal |

Ready when: unit tests pass, the client contract test covers every new id, the manual run above is
done on a private registry with the session count unchanged, and the ten-locale key list is filled
in (reviewed by hand, no gate exists).

## 10. Open questions for the owner

1. **Windows mirror in block 02.** Putting the interval into `GlobalConfig` forces a change to
   `packages/reevesagents-win/src/shared/types.ts` (byte-identical, drift test
   `catalog-drift.test.ts:44-50`). Block 01 is explicitly forbidden from touching that package — is
   block 02 allowed to sync it (`sync:shared`), or should the pulse interval live outside
   `GlobalConfig` (e.g. a Web-only `<state>/web-prefs.json`) and break the one-config-list
   invariant instead?
2. **Who writes the supervisor integration.** This design fixes the ingest contract and the
   `web.json` port file, but the supervisor is untouched. Is a later block expected to replace
   `notify_toast.sh` calls with `post_event`, or to wrap them (toast + ingest in one helper)?
3. **Badge scope.** Pulse on every notification, or only on `severity != 'info'`? Recommendation:
   every unread event, with `agent_pulse_ms: 0` as the escape hatch — that is what the current
   design assumes.
4. **Retention numbers.** 2000 events / 2 MiB trigger, trim to 1500 events with a hard 1.5 MiB
   bound (§3.3). At the current fleet volume (5 runs, a few events per minute) that is days of
   history; say if you want more or less before it is written into the constants.

## 11. Review notes as files: the notes channel (block 09 backend, block 10 UI)

Today a reviewer's findings exist only as pane text: `verdictNotes()` (`src/core/verdict.ts:58`)
scrapes the last 400 lines, keeps at most `NOTES_LIMIT` finding lines, redacts them, and
`renderFixPrompt()` (`src/core/flow.ts:441`) pastes them into the dev's prompt. On disk nothing
remains — the flow state keeps `claim.verdict`, `claim.verdict_count` and the bounded `log`
(`FLOW_LOG_LIMIT` = 50, `src/core/flow.ts:84`, whose `logDetail` (`:730`) carries only reason, head and
block id). So "what did the reviewer actually say in round 2" is unanswerable after the fact, and a
parser that mis-reads one formatting variant loses the round entirely.

The owner's decision: **notes become history**, and the file is the primary channel.

### 11.1 Decisions

| # | Decision | Why |
| --- | --- | --- |
| N1 | The review prompt asks the reviewer to write its findings to a **staging** file (`~/.reeves/flows/<run-id>/notes/inbox/<head>-r<N>.md`); the engine reads it first, sanitises it, and only then publishes the durable `<head>-r<N>.md` | a file survives scrollback, survives a parser change, and can be read by a human and by `flow notes` without touching tmux — but a file the *model* writes must never become the durable record unread (see N7) |
| N2 | The pane stays as **fallback**, and the raw pane capture is stored too (`<head>-r<N>.pane.txt`) | a model can answer in a shape the parser does not expect; the raw capture is the evidence that survives that |
| N3 | The journal entry carries `notes_ref` and counters, not the text | `flow logs` can say "round 2 → notes/<head>-r2.md · 2 MAJOR, 1 MINOR" while the journal stays bounded and path-free |
| N4 | A new command `flow notes` prints one round | the reviewer, the operator and a later block all need the same read path; a command is testable and scriptable |
| N5 | History is keyed by **head and round**, never a single rewritten file | the flow's whole model is "a verdict belongs to a commit"; a `last_notes.txt` would collide the moment two rounds ran back to back |
| N6 | Caps by heads, rounds and bytes, cleaned when the flow closes | the state tree is not a document store; an unbounded notes directory is the same mistake as an unbounded journal |
| N7 | **The engine is the only writer of a durable notes file.** The reviewer's staging file is read once, passed through `redactSecrets` and the path shorthand, and republished atomically (`temp` + `rename`, `0600`); the staging copy is removed, and the durable file is what the journal references. Reading is sanitised again before printing | same rule as §8.5 — a payload is a transcript — and a model-written file is untrusted input: it can carry a token or `/home/<user>/…`, and the engine must never let either reach the record or the transcript |

### 11.2 File layout and validity

```text
~/.reeves/flows/<run-id>/notes/
  inbox/<head>-r<N>.md    # staging: what the reviewer wrote. Untrusted, engine-readable, short-lived
  <head>-r<N>.md          # durable record: engine-written, sanitised, what the journal references
  <head>-r<N>.pane.txt    # durable fallback: the pane capture, engine-written and sanitised too
```

**Who writes what, in order (the sanitising pipeline).** The reviewer's file is an *input*, never a
record:

1. the reviewer writes `inbox/<head>-r<N>.md` (the prompt gives it the exact path);
2. the tick that observes the round reads it with the size and symlink checks below, and if it passes
   the format checks it **sanitises the text**: `redactSecrets` (`src/core/redact.ts:14`) over the whole
   body, and every absolute path replaced by its home-shortened form (`displayPath`,
   `src/utils/paths.ts:21`) — a `/home/<user>/…` outside the home directory collapses to its last
   component, exactly like an error message;
3. the engine writes the result to `<head>-r<N>.md` with `temp` + `rename` and mode `0600`, and deletes
   the staging file. From that moment the durable file, the journal reference and `flow notes` all
   point at sanitised text;
4. the same pass writes `<head>-r<N>.pane.txt` from the reviewer's pane — **also sanitised**, because
   the pane is model output too: the capture exists to survive a parser mismatch, not to smuggle a
   secret onto disk;
5. the record is published only when the tick **accepts** the round's answer. A rejected answer (too
   fast, no findings — see the evidence rule in `docs/flows-design.md` §3.5) keeps its staging copy and
   publishes nothing, so the reviewer's second answer to the same `(head, round)` becomes the record
   instead of being shadowed by the rejected one;
6. `answered_round` in the flow state remembers which `(head, round)` a dispatch was built from, so one
   answer is consumed once even though its file survives an `dispatch_unconfirmed` claim release;
7. if any step fails, the staging file is kept (so a retry can read it) and the journal records
   `notes_invalid <reason>`; a staging file older than a day is removed by the next tick.

That ordering is the whole answer to "the engine cannot control what the model writes": it does not
have to. The model writes a scratch file inside a directory the engine owns, and the engine copies it
through the sanitiser before anything durable exists. A file that appears directly in `notes/` and was
not written by the engine (an older build, a human, a hand-copied round) is treated as untrusted on
read: `flow notes` and the UI pass it through `redactSecrets` and the path shorthand at print time, and
the journal never references it.

`<head>` is the 40-char commit the review was requested for (the `claim.head` of that round) and `<N>`
is the 1-based round number, so the pair is unique and never rewritten. Caps:

| what | where | bounded by | cleaned by |
| --- | --- | --- | --- |
| findings file | `notes/<head>-r<N>.md` | one file per round; `NOTES_FILE_MAX_BYTES` = 64 KiB — a larger round is cut at a line boundary with a visible `(notes truncated at … bytes)` marker, and the **verdict line is always kept** so the record stays a record | `flow stop`, the `delete-history` cascade, and the round-pruning rule below |
| raw capture | `notes/<head>-r<N>.pane.txt` | `NOTES_PANE_MAX_BYTES` = 256 KiB, tail-kept: the last bytes are what the verdict scanner reads anyway | same |
| rounds kept | the `notes/` directory | `NOTES_KEEP_HEADS` = 10 heads and `NOTES_KEEP_ROUNDS_PER_HEAD` = 3 rounds per head, plus a hard `NOTES_TOTAL_MAX_BYTES` = 4 MiB over the whole directory; oldest dropped first | every publish (`pruneNotes`), and on close (`pruneClosedFlowNotes`, which keeps the newest round only — `NOTES_CLOSED_KEEP_ROUNDS` = 1) |
| reference in the journal | `log[].notes_ref` | the `log` ring (`FLOW_LOG_LIMIT` = 50) | the log ring itself |
| counters in the journal | `log[].notes_counts` | three integers | the log ring itself |

**What counts as a valid findings file**, checked in this order by the engine:

1. the file exists, is a regular file, is not a symlink out of the notes directory (`realpath` inside
   the directory, the same rule as the spec containment in `docs/flows-design.md` §3.2), and is
   non-empty after trimming;
2. it ends with a `ВЕРДИКТ: ACCEPT|CHANGES_REQUESTED` line (the same vocabulary `verdict.ts` parses),
   so the file is self-describing about which round it answers;
3. at least one `BLOCKER|MAJOR|MINOR <file>:<line> — <what> / <why> / <what to do>` line, which is the
   format the review prompt asks for; a file with the verdict but no findings is accepted only for
   `ACCEPT` (nothing to fix is a legitimate round).

A file that fails 1–3 is *not* used and the pane path takes over — the failure is written to the
journal as `notes_invalid <reason>`, so a reviewer that keeps writing the wrong shape is visible
instead of silently degraded. The pane fallback is exactly today's behaviour and is not removed.

The notes file also carries **evidence**: the engine refuses a verdict that arrives inside
`review_min_seconds` with no finding line, and the file's findings are what make an ACCEPT admissible
(an explicit "no findings" in the file counts, a bare one in a pane does not). See §3.5 of
`docs/flows-design.md`.

**Read order on a reviewing tick:** valid staging file → the **durable** record of the same round → pane
verdict scan → hold. The durable step is not an optimisation: the staging file is removed when the record
is published, and a tick that held (a busy dev pane) has already published, so without it the round could
never be answered and would run into the review timeout. Sanitising covers a path written as
`file=/home/…`, `` `/home/…` ``, `"/home/…"` or `(/home/…)`, and a colon is not an exemption by itself —
only a real `scheme://…` URL (the path part starts with `//` and the text before the colon is a scheme
name) is kept as written, so `path:/home/…` is shortened like any other absolute path. The file wins even
when the pane disagrees, because the file is the answer the reviewer chose to persist; the pane value
is still recorded (`claim.verdict_count`) so the counter baseline keeps working.

### 11.3 What changes in the flow state and the surfaces

- **prompt**: `renderReviewPrompt()` gains one instruction block — write the findings to the path the
  engine tells it, in the formats above, ending with the verdict line. The path is passed in, not
  composed by the model, and the same text keeps the pane answer as a fallback so a reviewer that
  ignores the instruction is not stranded.
- **journal entry**: `{ at, event, detail, notes_ref, notes_counts: { blocker, major, minor } }` —
  `notes_ref` is relative to the flow directory (`notes/<head>-r2.md`), never absolute, so nothing has
  to be shortened at print time and the record survives a moved state root.
- **`flow status --json`**: unchanged plus `last_notes: { ref, counts }` — no text.
- **`flow logs`**: the row renders `round 2 → notes/<head>-r2.md · 2 MAJOR, 1 MINOR`; `--json` keeps the
  same fields, so a script can follow the reference.
- **`flow notes --run <id> [--head <sha>] [-r <N>] [--json]`**: prints the findings of the selected
  round (default: the latest round of the current head), with the file path home-shortened and the raw
  capture path as a second line. Behaviour when there is nothing to print is part of the contract:
  `no notes for <run> (round 2 was dispatched without a notes file)` — exit 0 with `--json` printing
  `{ notes: null, reason: 'missing' }`, because "the reviewer wrote nothing" is data, not an error. A
  round that never happened is an error: `round 7 does not exist for <head> (rounds: 1-3)`, exit 1.
  An unknown `--head` lists the heads that do have notes (first 5, like `resolveFlowRunId`).
- **cleanup**: `flow stop` and the `delete-history` cascade remove the whole `<state>/flows/<run-id>/`
  directory, notes included. `flow start --replace` on a closed flow removes the previous notes
  directory before writing the new state, so a replaced flow cannot inherit round references from its
  predecessor.

### 11.4 Block 09 (backend) and block 10 (UI)

- **Block 09 — shipped** (this branch, `src/core/flow-notes.ts`): `stagingPath` / `durablePath` /
  `panePath` / `notesRef` for the layout above; `readStaging` (symlink refusal via `lstatSync`, size
  cap, format check), `validateNotesText` (verdict line last, at least one finding unless ACCEPT),
  `publishNotes` (sanitise → `capRecord` → temp+rename 0600 → staging removed), `writePaneCapture`
  (same sanitiser, tail-kept at `NOTES_PANE_MAX_BYTES` = 256 KiB), `readNotesRound` (re-sanitises on
  read), `pruneNotes` / `pruneClosedFlowNotes` / `removeNotesDir`. The names in this document are the
  shipped ones; there is no separate `notes.ts`. Wiring: `renderReviewPrompt` takes the staging path as
  a parameter (`notes_path`), `observeFlow` reads the file first (`verdict_source: 'file'`) and falls
  back to the pane, `stepFlow` writes the capture on every reviewing tick and publishes the record once,
  `applyDecisionToState` puts `notes_ref` + `notes_counts` in the journal entry, `flow logs` prints
  `→ notes/<head>-rN.md · 2 MAJOR, 1 MINOR`, `flow status --json` carries `last_notes` (reference and
  counters only), `flow start --replace` removes the previous notes directory and `deleteFlowFileForRun`
  takes it with the flow file. Definition of done: a round with a valid
  file reads from the file (pane ignored); a round with a broken file falls back to the pane and logs
  `notes_invalid`; `flow notes` prints both a valid and a missing round in the documented shapes; the
  caps and the pruning are asserted with a synthetic 21-round fixture.
- **Block 10** implements N6's UI half: the Logs dialog (§5) lists these same records with the notes
  text as the "what was sent" column and the file reference as a link; the pulsing badge on the agent
  card is driven by the same events (§6), so a flow escalation pulses the run's card and a review
  timeout pulses the reviewer's. It reads through `flow notes --json`/the notification log — it does
  not open the notes directory itself, so the caps and the sanitizing stay in one place.

Open questions this section leaves to the owner: whether a notes file should also be attached to the
`flow.escalated` notification's detail (a link, not the text), and whether `NOTES_KEEP_ROUNDS` = 20 is
the right number before the flow closes.
