// Block spec: what a pipeline dispatches to the dev.
//
// A block is a record, not a file path. It is validated once, when it is queued, so a broken
// spec fails in front of the person who wrote it instead of at 3 a.m. inside a round; and the
// prompt the dev receives is rendered from the record, so a dispatch is reproducible from the
// flow file alone.
//
// Invariant: validation never coerces. A bad field is reported with its name and the spec is
// refused; nothing is silently trimmed into shape except whitespace, which is never meaningful
// here. A spec with no requirements or no checks is only accepted when the caller explicitly
// allows it, and it then carries `unstructured: true` forever, so the downgrade stays visible.

export interface BlockSpec {
  // Unique inside the flow; the dedupe key for "this block was already dispatched".
  id: string
  title: string
  goal: string
  // What to build or change. At least one entry in a structured spec.
  requirements: string[]
  // Commands the dev must run and report the actual output of. At least one entry.
  checks: string[]
  // What the handoff report must contain. A requirement addressed to the dev and the reviewer,
  // not something the engine can verify.
  report: string[]
  // Optional long-form specification.
  body?: string
  // Where the record came from, when it was ingested from a file.
  source_path?: string
  // True when the block was accepted without requirements/checks. Never set by accident.
  unstructured?: boolean
}

export interface SpecIssue {
  field: string
  message: string
}

export interface ValidateSpecOptions {
  // Ids already queued or already dispatched in this flow.
  existingIds?: string[]
  // Accept a spec with empty requirements/checks and mark it unstructured.
  allowUnstructured?: boolean
}

export interface SpecValidation {
  spec: BlockSpec | null
  issues: SpecIssue[]
}

export const SPEC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

export const SPEC_LIMITS = {
  id: 64,
  title: 200,
  goal: 4000,
  entry: 500,
  entries: 50,
  body: 20000,
} as const

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

// A list of short strings: trimmed, blanks dropped, capped per entry and in total.
function normalizeList(
  value: unknown,
  field: string,
  limit: number,
  issues: SpecIssue[],
): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    issues.push({ field, message: `${field} must be a list of strings` })
    return []
  }
  const entries: string[] = []
  for (const item of value) {
    const text = normalizeText(item)
    if (!text) continue
    if (text.length > limit) {
      issues.push({ field, message: `${field} entry is longer than ${limit} characters` })
      continue
    }
    entries.push(text)
  }
  if (entries.length > SPEC_LIMITS.entries) {
    issues.push({ field, message: `${field} has more than ${SPEC_LIMITS.entries} entries` })
    return entries.slice(0, SPEC_LIMITS.entries)
  }
  return entries
}

// Validate a candidate spec. Returns the normalized record only when there are no issues, so a
// caller cannot queue a half-valid block by ignoring the issue list.
export function validateSpec(raw: unknown, options: ValidateSpecOptions = {}): SpecValidation {
  const record = asRecord(raw)
  if (!record) return { spec: null, issues: [{ field: 'spec', message: 'spec must be an object' }] }

  const issues: SpecIssue[] = []
  const id = normalizeText(record.id)
  const title = normalizeText(record.title)
  const goal = normalizeText(record.goal)
  const requirements = normalizeList(record.requirements, 'requirements', SPEC_LIMITS.entry, issues)
  const checks = normalizeList(record.checks, 'checks', SPEC_LIMITS.entry, issues)
  const report = normalizeList(record.report, 'report', SPEC_LIMITS.entry, issues)
  const body = normalizeText(record.body)
  const sourcePath = normalizeText(record.source_path)

  if (!id) issues.push({ field: 'id', message: 'id is required' })
  else if (!SPEC_ID_PATTERN.test(id)) issues.push({ field: 'id', message: `id must match ${SPEC_ID_PATTERN.source}` })
  else if ((options.existingIds ?? []).includes(id)) issues.push({ field: 'id', message: `block ${id} is already queued or dispatched` })

  if (!title) issues.push({ field: 'title', message: 'title is required' })
  else if (title.length > SPEC_LIMITS.title) issues.push({ field: 'title', message: `title is longer than ${SPEC_LIMITS.title} characters` })

  if (goal.length > SPEC_LIMITS.goal) issues.push({ field: 'goal', message: `goal is longer than ${SPEC_LIMITS.goal} characters` })
  if (body.length > SPEC_LIMITS.body) issues.push({ field: 'body', message: `body is longer than ${SPEC_LIMITS.body} characters` })

  const emptyStructured = requirements.length === 0 || checks.length === 0
  if (emptyStructured && !options.allowUnstructured) {
    if (requirements.length === 0) issues.push({ field: 'requirements', message: 'a structured block needs at least one requirement' })
    if (checks.length === 0) issues.push({ field: 'checks', message: 'a structured block needs at least one check' })
    issues.push({ field: 'unstructured', message: 're-queue with allowUnstructured to accept a block without requirements/checks' })
  }

  if (issues.length > 0) return { spec: null, issues }

  const spec: BlockSpec = { id, title, goal, requirements, checks, report }
  if (body) spec.body = body
  if (sourcePath) spec.source_path = sourcePath
  // Only a block that really lacks the structured fields keeps the marker.
  if (emptyStructured) spec.unstructured = true
  return { spec, issues: [] }
}

export function parseSpecJson(text: string, options: ValidateSpecOptions = {}): SpecValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { spec: null, issues: [{ field: 'json', message: 'spec file is not valid JSON' }] }
  }
  return validateSpec(parsed, options)
}

// Markdown ingestion is the shortcut, never the contract: the whole file becomes `body`, the
// title comes from the first heading, and the block is marked unstructured.
export function specFromMarkdown(text: string, sourcePath = ''): SpecValidation {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  const heading = normalized.split('\n').find(line => /^#\s+\S/.test(line.trim()))
  const firstLine = normalized.split('\n').find(line => line.trim() !== '')
  const title = (heading ? heading.replace(/^#\s+/, '') : firstLine ?? '')
    .trim()
    .slice(0, SPEC_LIMITS.title)
  const idSeed = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SPEC_LIMITS.id) || 'block'
  return validateSpec(
    { id: idSeed, title: title || idSeed, body: normalized, source_path: sourcePath },
    { allowUnstructured: true },
  )
}

export function formatSpecIssues(issues: SpecIssue[]): string {
  return issues.map(issue => `${issue.field}: ${issue.message}`).join('; ')
}

export interface RenderOptions {
  flowName?: string
  position?: number
}

// Deterministic prompt for the dev. The spec's own text is passed through verbatim (it may be
// written in any language); only the scaffolding is fixed.
export function renderDispatchPrompt(spec: BlockSpec, options: RenderOptions = {}): string {
  const lines: string[] = []
  const prefix = options.flowName ? `Flow "${options.flowName}" — ` : ''
  const position = options.position ? ` (${options.position} in queue)` : ''
  if (spec.unstructured) {
    lines.push('WARNING: this block has no structured requirements or checks. Treat the body below as the specification.')
    lines.push('')
  }
  lines.push(`${prefix}block ${spec.id}: ${spec.title}${position}`)
  if (spec.goal) {
    lines.push('')
    lines.push(`Goal: ${spec.goal}`)
  }
  if (spec.requirements.length > 0) {
    lines.push('')
    lines.push('Requirements (all of them):')
    spec.requirements.forEach((requirement, index) => lines.push(`${index + 1}. ${requirement}`))
  }
  if (spec.checks.length > 0) {
    lines.push('')
    lines.push('Checks — run each one and report the actual output:')
    spec.checks.forEach((check, index) => lines.push(`${index + 1}. ${check}`))
  }
  if (spec.report.length > 0) {
    lines.push('')
    lines.push('The report must contain:')
    for (const item of spec.report) lines.push(`- ${item}`)
  }
  if (spec.body) {
    lines.push('')
    lines.push('Full specification:')
    lines.push(spec.body)
  }
  return lines.join('\n')
}
