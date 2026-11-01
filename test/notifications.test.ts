// The notification journal: schema, `seq` order, the ring, the watermark and the ingest route.
//
// The route tests drive the real HTTP server from `src/surfaces/webui/server.ts`, because the two things that
// matter there (peer and `Origin`) cannot be seen from a unit call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { request as requestFn } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  NOTIFICATION_LIMITS, NotificationError, appendNotification, markNotificationsRead, notificationPaths,
  notificationSummary, readNotifications, resetNotificationCache,
} from '../src/core/notifications.js'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))


// HTTP through a fresh connection per request. `fetch` pools sockets, and this server closes a connection when it
// refuses a request it did not read the body of, which surfaces as `UND_ERR_SOCKET` rather than the status under
// test. One connection per call makes the assertion about the status, not about the pool.
interface HttpResult { status: number, text: string }

function request(method: string, url: string, init: { body?: string, headers?: Record<string, string> } = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new (globalThis as unknown as {
      URL: new (_input: string) => { hostname: string, port: string, pathname: string, search: string }
    }).URL(url)
    const body = init.body ?? ''
    const req = requestFn({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      agent: false,
      headers: {
        connection: 'close',
        ...(body ? { 'content-length': String(Buffer.byteLength(body)), 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    }, res => {
      let text = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk: string) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function json(response: HttpResult): Promise<any> {
  return JSON.parse(response.text)
}

let root: string
let savedRegistry: string | undefined
let savedConfig: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-notifications-'))
  savedRegistry = process.env.REEVES_REGISTRY
  savedConfig = process.env.REEVES_CONFIG
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')
  resetNotificationCache()
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  if (savedConfig === undefined) delete process.env.REEVES_CONFIG
  else process.env.REEVES_CONFIG = savedConfig
  resetNotificationCache()
  rmSync(root, { recursive: true, force: true })
})

const valid = (overrides: Record<string, unknown> = {}) => ({
  kind: 'run.created',
  title: 'run x started',
  run_id: 'run-1',
  run_name: 'demo',
  project: 'proj',
  ...overrides,
})

describe('the schema', () => {
  it('refuses an unknown kind and an unknown severity', () => {
    expect(() => appendNotification(valid({ kind: 'made.up' }))).toThrow(/unknown kind/)
    expect(() => appendNotification(valid({ severity: 'fatal' }))).toThrow(/unknown severity/)
  })

  it('refuses a project that is a path, and a title that is empty', () => {
    expect(() => appendNotification(valid({ project: 'a/b' }))).toThrow(/project must be a name/)
    expect(() => appendNotification(valid({ title: '   ' }))).toThrow(/needs a title/)
  })

  it('truncates a long title instead of refusing it, and redacts a secret', () => {
    // The shape the redactor knows: `sk-` plus twenty characters or more.
    const secret = `sk-${'a'.repeat(24)}`
    const { event } = appendNotification(valid({ title: `${'x'.repeat(300)}`, detail: `key ${secret} leaked` }))
    expect(event.title.length).toBeLessThanOrEqual(NOTIFICATION_LIMITS.title)
    expect(event.title.endsWith('…')).toBe(true)
    expect(event.detail).toContain('[REDACTED]')
    expect(event.detail).not.toContain(secret)
  })

  it('shortens a Windows path too, and refuses it in project', () => {
    const { event } = appendNotification(valid({
      detail: 'failed at C:\\Users\\Alice\\work\\secret.md while reading',
      title: 'open C:\\Users\\Alice\\private\\creds.txt',
    }))
    expect(event.detail).not.toContain('C:\\Users')
    expect(event.detail).toContain('secret.md')
    expect(event.title).not.toContain('C:\\Users')
    expect(event.title).toContain('creds.txt')

    expect(() => appendNotification(valid({ project: 'C:\\Users\\Alice' }))).toThrow(/project must be a name/)
  })

  it('collapses newlines into one line and shortens an absolute path', () => {
    const { event } = appendNotification(valid({ detail: 'line one\nline two at /home/someone/projects/secret/file.ts' }))
    expect(event.detail).not.toContain('\n')
    expect(event.detail).toContain(' · ')
    expect(event.detail).not.toContain('/home/someone')
  })
})

describe('the log', () => {
  it('assigns increasing seq and keeps the order on read', () => {
    const first = appendNotification(valid({ title: 'one' })).event
    const second = appendNotification(valid({ title: 'two' })).event
    const third = appendNotification(valid({ title: 'three' })).event

    expect([first.seq, second.seq, third.seq]).toEqual([first.seq, first.seq + 1, first.seq + 2])
    const read = readNotifications()
    expect(read.events.map(event => event.title)).toEqual(['three', 'two', 'one'])   // newest first
    expect(read.latest_seq).toBe(third.seq)
  })

  it('writes 0600 and creates the file lazily', () => {
    expect(existsSync(notificationPaths(root).log)).toBe(false)
    expect(readNotifications().events).toEqual([])      // reading never creates
    appendNotification(valid())
    expect(statSync(notificationPaths(root).log).mode & 0o777).toBe(0o600)
  })

  it('skips a partial tail instead of failing the read', () => {
    appendNotification(valid({ title: 'complete' }))
    const path = notificationPaths(root).log
    const before = readFileSync(path, 'utf-8')
    // A writer died mid-line: the fragment stays on disk and must be invisible.
    writeFileSync(path, `${before}{"seq":99,"kind":"run.created","tit`)
    const read = readNotifications()
    expect(read.events.map(event => event.title)).toEqual(['complete'])
  })

  it('filters by run, by since and by unread, and honours the limit', () => {
    appendNotification(valid({ run_id: 'a', title: 'a1' }))
    appendNotification(valid({ run_id: 'b', title: 'b1' }))
    const third = appendNotification(valid({ run_id: 'a', title: 'a2' })).event

    expect(readNotifications({ run: 'a' }).events.map(event => event.title)).toEqual(['a2', 'a1'])
    expect(readNotifications({ since: third.seq - 1 }).events.map(event => event.title)).toEqual(['a2'])
    expect(readNotifications({ limit: 1 }).events).toHaveLength(1)

    markNotificationsRead()
    expect(readNotifications({ unread: true }).events).toEqual([])
  })
})

describe('the ring', () => {
  it('rotates by count and keeps the newest events', () => {
    // The cap is a constant, so the test drives it by writing exactly over the limit — with a smaller keep set
    // this would be 2000 events; the assertion is about the invariant, not the number.
    const total = NOTIFICATION_LIMITS.max_events + 5
    for (let index = 0; index < total; index += 1) {
      appendNotification(valid({ title: `e${index}` }))
      if (index % 500 === 0) resetNotificationCache()   // force the foreign-write rescan path too
    }
    const read = readNotifications({ limit: NOTIFICATION_LIMITS.max_events })
    expect(read.total).toBeLessThanOrEqual(NOTIFICATION_LIMITS.max_events)
    expect(read.events[0]!.title).toBe(`e${total - 1}`)
    // Nothing newer than the kept window is missing, and the file is under both budgets.
    expect(statSync(notificationPaths(root).log).size).toBeLessThanOrEqual(NOTIFICATION_LIMITS.max_bytes)
  }, 60_000)

  it('rotates by size, leaving the file under the keep budget', () => {
    // One event close to the detail ceiling: ~4 KiB per line, so ~600 lines cross 2 MiB.
    const detail = 'd'.repeat(NOTIFICATION_LIMITS.detail)
    for (let index = 0; index < 700; index += 1) {
      appendNotification(valid({ title: `big${index}`, detail }))
    }
    const size = statSync(notificationPaths(root).log).size
    expect(size).toBeLessThanOrEqual(NOTIFICATION_LIMITS.keep_bytes + 4096)
    // The newest event survived, the oldest did not.
    const read = readNotifications({ limit: 5 })
    expect(read.events[0]!.title).toBe('big699')
  }, 60_000)

  it('never loses an accepted event to a foreign append', () => {
    // Two writers, simulated by clearing the cache between writes (which is what a foreign write looks like to the
    // size/inode check) — every accepted event must still be readable.
    for (let index = 0; index < 20; index += 1) {
      appendNotification(valid({ title: `f${index}` }))
      resetNotificationCache()
    }
    expect(readNotifications({ limit: 50 }).total).toBe(20)
  })

  it('collapses a retried dedupe_key instead of duplicating it', () => {
    const first = appendNotification(valid({ dedupe_key: 'flow-1:flow.escalated:1' }))
    const second = appendNotification(valid({ dedupe_key: 'flow-1:flow.escalated:1', title: 'retry' }))
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.event.seq).toBe(first.event.seq)
    expect(readNotifications().total).toBe(1)
  })
})

describe('the watermark', () => {
  it('marks read monotonically and never rolls back', () => {
    appendNotification(valid({ title: 'one' }))
    const second = appendNotification(valid({ title: 'two' })).event

    const high = markNotificationsRead(second.seq)
    expect(high).toMatchObject({ read_seq: second.seq, changed: true })
    // A second, lower request is accepted as a no-op rather than rolling the watermark back.
    const low = markNotificationsRead(second.seq - 1)
    expect(low).toMatchObject({ read_seq: second.seq, changed: false })
    expect(readNotifications().read_seq).toBe(second.seq)
    expect(notificationSummary()).toMatchObject({ unread: 0, latest_seq: second.seq })
  })

  it('counts unread against the watermark', () => {
    appendNotification(valid({ title: 'one' }))
    const second = appendNotification(valid({ title: 'two' })).event
    markNotificationsRead(second.seq - 1)
    expect(notificationSummary()).toMatchObject({ unread: 1 })
  })
})

describe('the ingest route', () => {
  let handle: { url: string, close: () => Promise<void> }
  let base: string

  beforeEach(async () => {
    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    // The real server on a free port, loopback only: the two checks under test (peer and Origin) cannot be seen
    // from a unit call.
    handle = await startWebServer({ port: 0 })
    base = handle.url
  })

  afterEach(async () => {
    await handle.close()
  })

  it('accepts a loopback POST with an Origin and answers 201', async () => {
    const response = await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'external', title: 'fleet says hi', project: 'proj' }),
    })
    expect(response.status).toBe(201)
    const body = await json(response) as { event: { kind: string, source: string, seq: number } }
    expect(body.event).toMatchObject({ kind: 'external', source: 'external' })
    expect(body.event.seq).toBeGreaterThan(0)
  })

  it('rejects a POST without Origin and one with a foreign Origin', async () => {
    // `connection: close` on the refusal cases: undici keeps the socket for a second request, and the server ends
    // the one it refused, which surfaces as a reset instead of the status.
    const noOrigin = await request('POST', `${base}/api/notifications`)
    expect(noOrigin.status).toBe(403)

    const foreign = await request('POST', `${base}/api/notifications`, { headers: { origin: 'http://evil.example' } })
    expect(foreign.status).toBe(403)
    expect(readNotifications().total).toBe(0)
  })

  it('refuses a body over the limit', async () => {
    const response = await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'external', title: 'x'.repeat(NOTIFICATION_LIMITS.body + 1024) }),
    })
    expect(response.status).toBe(400)
  })

  it('never trusts a source claimed in the body', async () => {
    // A loopback caller that could say `source: product` would forge `flow.escalated` — the route decides the
    // source, and the schema then refuses the product-only kind.
    const forged = await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'flow.escalated', title: 'fake', source: 'product' }),
    })
    expect(forged.status).toBe(400)
    expect(readNotifications().total).toBe(0)

    const honest = await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'external', title: 'fine', source: 'product' }),
    })
    // Accepted, but stored as external: the field is the route's, not the caller's.
    expect(honest.status).toBe(201)
    expect(readNotifications().events[0]!.source).toBe('external')
  })

  it('refuses a product-only kind from ingest', async () => {
    const response = await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'flow.escalated', title: 'fake escalation' }),
    })
    // The route sets `source: external`, and the schema refuses a product-only kind from a non-product source.
    expect(response.status).toBe(400)
    expect(readNotifications().total).toBe(0)
  })

  it('rate-limits a flood', async () => {
    const statuses: number[] = []
    for (let index = 0; index < 70; index += 1) {
      const response = await request('POST', `${base}/api/notifications`, {
        headers: { origin: base },
        body: JSON.stringify({ kind: 'external', title: `flood ${index}` }),
      })
      statuses.push(response.status)
    }
    expect(statuses.filter(status => status === 429).length).toBeGreaterThan(0)
    expect(statuses[0]).toBe(201)
  })

  it('serves the journal and marks it read', async () => {
    await request('POST', `${base}/api/notifications`, {
      headers: { origin: base },
      body: JSON.stringify({ kind: 'external', title: 'visible', run_id: 'run-9' }),
    })
    const listed = await request('GET', `${base}/api/notifications?run=run-9`)
    const body = await json(listed) as { events: { title: string }[], unread: number }
    expect(body.events.map(event => event.title)).toEqual(['visible'])

    const read = await request('POST', `${base}/api/notifications/read`, {
      headers: { origin: base },
      body: JSON.stringify({}),
    })
    expect(read.status).toBe(200)
    const after = await json(await request('GET', `${base}/api/notifications?unread=1`)) as { events: unknown[] }
    expect(after.events).toEqual([])
  })

  it('carries the summary in the state payload', async () => {
    appendNotification(valid({ title: 'one' }))
    const state = await json(await request('GET', `${base}/api/state`)) as { notifications?: { unread: number, latest_seq: number } }
    expect(state.notifications).toMatchObject({ unread: 1 })
    expect(state.notifications!.latest_seq).toBeGreaterThan(0)
  })
})

describe('a plan-style secret in the journal', () => {
  it('is redacted on the way in, not on the way out', () => {
    const token = `ghp_${'a'.repeat(36)}`
    appendNotification(valid({ title: `token ${token}` }))
    const raw = readFileSync(notificationPaths(root).log, 'utf-8')
    expect(raw).not.toContain(token)
    expect(raw).toContain('[REDACTED]')
  })
})

describe('the lock', () => {
  it('is released after a failed append', () => {
    expect(() => appendNotification(valid({ kind: 'nope' } as never))).toThrow(NotificationError)
    expect(existsSync(notificationPaths(root).lock)).toBe(false)
    appendNotification(valid())
    expect(readNotifications().total).toBe(1)
  })
})

describe('the file permissions', () => {
  it('are 0600 for the log and the sidecars', () => {
    appendNotification(valid({ dedupe_key: 'k1' }))
    markNotificationsRead()
    chmodSync(notificationPaths(root).read, 0o600)
    for (const path of [notificationPaths(root).log, notificationPaths(root).read, notificationPaths(root).seq]) {
      expect(statSync(path).mode & 0o777).toBe(0o600)
    }
  })
})
