// Approval records for runs. An agent can ask for approval before an action,
// and another agent (or a human) approves or denies it. Stored beside run state
// under ~/.reeves/runs/<run-id>/approvals.

import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  findAgent,
  listRuns,
  nowIso,
  runDir,
  withRunsLock,
} from './runs.js'
import { redactSecrets } from '../utils/display.js'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'
export type ApprovalRisk = 'low' | 'medium' | 'high'

export interface RunApproval {
  id: string
  run_id: string
  agent_id: string
  action: string
  summary: string
  details: Record<string, unknown>
  risk: ApprovalRisk
  status: ApprovalStatus
  decision_note: string
  requested_at: string
  resolved_at: string | null
}

export interface CreateRunApprovalInput {
  agent_id: string
  action: string
  summary: string
  details?: Record<string, unknown>
  risk?: ApprovalRisk
}

function runApprovalsDir(runId: string): string {
  return join(runDir(runId), 'approvals')
}

function runApprovalPath(runId: string, approvalId: string): string {
  return join(runApprovalsDir(runId), `${approvalId}.json`)
}

// Write to a temp file then rename, so a reader never sees a half-written record.
// Mode 600 because approval details can hold sensitive action data.
function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  chmodSync(tmpPath, 0o600)
  renameSync(tmpPath, path)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function normalizeApprovalStatus(value: unknown): ApprovalStatus {
  if (value === 'pending' || value === 'approved' || value === 'denied' || value === 'expired') return value
  return 'pending'
}

function normalizeRisk(value: unknown): ApprovalRisk {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, redactValue(item)]),
    )
  }
  return value
}

function normalizeApproval(raw: Record<string, unknown>): RunApproval {
  return {
    id: asString(raw.id),
    run_id: asString(raw.run_id),
    agent_id: asString(raw.agent_id),
    action: asString(raw.action),
    summary: asString(raw.summary),
    details: typeof raw.details === 'object' && raw.details !== null ? raw.details as Record<string, unknown> : {},
    risk: normalizeRisk(raw.risk),
    status: normalizeApprovalStatus(raw.status),
    decision_note: asString(raw.decision_note),
    requested_at: asString(raw.requested_at, nowIso()),
    resolved_at: asNullableString(raw.resolved_at),
  }
}

// Redaction runs both before writing and on every value returned, so secrets
// never land on disk and never leave this module.
function redactApproval(approval: RunApproval): RunApproval {
  return {
    ...approval,
    action: redactSecrets(approval.action),
    summary: redactSecrets(approval.summary),
    details: redactValue(approval.details) as Record<string, unknown>,
    decision_note: redactSecrets(approval.decision_note),
  }
}

function writeApprovalUnlocked(approval: RunApproval): string {
  const path = runApprovalPath(approval.run_id, approval.id)
  atomicWriteJson(path, redactApproval(approval))
  return path
}

function readApprovalUnlocked(runId: string, approvalId: string): RunApproval {
  try {
    return normalizeApproval(JSON.parse(readFileSync(runApprovalPath(runId, approvalId), 'utf-8')) as Record<string, unknown>)
  } catch {
    // A missing or unreadable approval reads as "not found", not a raw fs error
    // that would leak the path.
    throw new Error(`Approval not found: ${approvalId}`)
  }
}

export function createRunApproval(input: CreateRunApprovalInput): RunApproval {
  return withRunsLock(() => {
    const agent = findAgent(input.agent_id)
    const approval: RunApproval = {
      id: randomUUID(),
      run_id: agent.run_id,
      agent_id: agent.id,
      action: input.action,
      summary: input.summary,
      details: input.details ?? {},
      risk: input.risk ?? 'medium',
      status: 'pending',
      decision_note: '',
      requested_at: nowIso(),
      resolved_at: null,
    }
    writeApprovalUnlocked(approval)
    return redactApproval(approval)
  })
}

export function readRunApproval(runId: string, approvalId: string): RunApproval {
  return readApprovalUnlocked(runId, approvalId)
}

export function listRunApprovals(runId?: string, status?: ApprovalStatus): RunApproval[] {
  const runIds = runId ? [runId] : listRuns().map(run => run.id)
  const approvals: RunApproval[] = []

  for (const id of runIds) {
    let files: string[]
    try {
      files = readdirSync(runApprovalsDir(id))
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        approvals.push(readApprovalUnlocked(id, file.slice(0, -5)))
      } catch {
        // skip malformed approval records
      }
    }
  }

  return approvals
    .filter(approval => !status || approval.status === status)
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
}

export function resolveRunApproval(approvalId: string, decision: 'approved' | 'denied', note = ''): RunApproval {
  return withRunsLock(() => {
    const approval = listRunApprovals().find(item => item.id === approvalId)
    if (!approval) throw new Error(`Approval not found: ${approvalId}`)
    // Decide once: a resolved approval is returned as-is, never re-decided.
    if (approval.status !== 'pending') return approval
    const updated: RunApproval = {
      ...approval,
      status: decision,
      decision_note: note,
      resolved_at: nowIso(),
    }
    writeApprovalUnlocked(updated)
    return redactApproval(updated)
  })
}
