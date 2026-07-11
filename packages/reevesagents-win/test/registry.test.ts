import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PtyAgentRecord, PtyRunRecord } from '../src/core/types-win.js'
import {
  archiveAndRemoveRun,
  endAgent,
  endRunIfNoLiveAgents,
  findAgent,
  isEnded,
  listAgents,
  listRunHistory,
  listRuns,
  nowIso,
  readAgent,
  readRun,
  reconcileOnStart,
  updateAgent,
  writeAgent,
  writeRun,
} from '../src/core/registry.js'

function makeRun(overrides: Partial<PtyRunRecord> = {}): PtyRunRecord {
  const id = randomUUID()
  return {
    id,
    name: 'test run',
    status: 'running',
    root_agent_id: '',
    working_dir: '/tmp',
    started_at: nowIso(),
    ended_at: null,
    ...overrides,
  }
}

function makeAgent(runId: string, overrides: Partial<PtyAgentRecord> = {}): PtyAgentRecord {
  const id = randomUUID()
  return {
    id,
    run_id: runId,
    nickname: 'agent',
    provider: 'cc',
    model: '',
    role: 'root',
    working_dir: '/tmp',
    task: '',
    task_status: 'queued',
    pid: 1234,
    permissions: 'ask',
    started_at: nowIso(),
    ended_at: null,
    ...overrides,
  }
}

describe('registry', () => {
  it('round-trips a run and its agents', () => {
    const run = makeRun()
    writeRun(run)
    const agent = makeAgent(run.id, { role: 'root' })
    writeAgent(agent)

    expect(readRun(run.id)).toMatchObject({ id: run.id, status: 'running' })
    expect(readAgent(run.id, agent.id)).toMatchObject({ id: agent.id, provider: 'cc', pid: 1234 })
    expect(listRuns().map(r => r.id)).toEqual([run.id])
    expect(listAgents(run.id).map(a => a.id)).toEqual([agent.id])
    expect(findAgent(agent.id).id).toBe(agent.id)
  })

  it('redacts secrets in the task before writing', () => {
    const run = makeRun()
    writeRun(run)
    const agent = makeAgent(run.id, { task: 'use key sk-ant-api03-abcdefghij1234567890abcdef012345' })
    writeAgent(agent)
    expect(readAgent(run.id, agent.id).task).toBe('use key [REDACTED]')
  })

  it('endAgent marks the agent ended and done', () => {
    const run = makeRun()
    writeRun(run)
    const agent = makeAgent(run.id)
    writeAgent(agent)

    const ended = endAgent(run.id, agent.id)
    expect(ended.ended_at).not.toBeNull()
    expect(ended.task_status).toBe('done')
  })

  it('endRunIfNoLiveAgents keeps a run alive while an agent is live and ends it otherwise', () => {
    const run = makeRun()
    writeRun(run)
    const a1 = makeAgent(run.id)
    const a2 = makeAgent(run.id, { role: 'worker' })
    writeAgent(a1)
    writeAgent(a2)

    endAgent(run.id, a1.id)
    expect(isEnded(endRunIfNoLiveAgents(run.id))).toBe(false)

    endAgent(run.id, a2.id)
    expect(isEnded(endRunIfNoLiveAgents(run.id))).toBe(true)
    expect(readRun(run.id).status).toBe('ended')
  })

  it('archiveAndRemoveRun writes history and removes the run dir', () => {
    const run = makeRun()
    writeRun(run)
    writeAgent(makeAgent(run.id, { role: 'root', provider: 'codex' }))

    const record = archiveAndRemoveRun(run.id, 'ended')
    expect(record).toMatchObject({ id: run.id, status: 'ended', agent_count: 1, root_provider: 'codex' })
    expect(() => readRun(run.id)).toThrow(/Run not found/)
    expect(listRunHistory().map(r => r.id)).toContain(run.id)
  })

  it('reconcileOnStart archives every leftover live run as stale', () => {
    const live = makeRun({ name: 'prev session' })
    writeRun(live)
    writeAgent(makeAgent(live.id))
    const alreadyEnded = makeRun({ status: 'ended', ended_at: nowIso() })
    writeRun(alreadyEnded)

    const result = reconcileOnStart()
    expect(result.archived.sort()).toEqual([live.id, alreadyEnded.id].sort())
    expect(listRuns()).toEqual([])

    const history = listRunHistory()
    expect(history.find(r => r.id === live.id)?.status).toBe('stale')
    expect(history.find(r => r.id === alreadyEnded.id)?.status).toBe('ended')
  })

  it('updateAgent patches a single field', () => {
    const run = makeRun()
    writeRun(run)
    const agent = makeAgent(run.id)
    writeAgent(agent)
    updateAgent(run.id, agent.id, { task_status: 'working' })
    expect(readAgent(run.id, agent.id).task_status).toBe('working')
  })
})
