// Queueing a block spec from a file.
//
// The MCP `flow_add_spec` tool and (later) `flow add-spec` share this path, so the rules live in
// one place: a spec is validated once, when it is queued, and a bad file is refused with its
// reason instead of being stored and discovered at dispatch time (§3.2 of docs/flows-design.md).
//
// Paths in these messages are home-shortened: an MCP host quotes the error verbatim into its own
// transcript, and that transcript must not carry the account layout.
//
// The file is the source of truth for its own text; the record stored on the flow is the
// structured spec, so a dispatch is reproducible from the flow file alone and the dev's brief does
// not depend on a path still existing.

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, extname, relative, resolve, sep } from 'node:path'
import type { FlowState } from './flow.js'
import type { BlockSpec } from './spec.js'
import { formatSpecIssues, parseSpecJson, specFromMarkdown } from './spec.js'
import { shortHomePath } from '../utils/paths.js'

// A spec is text a human wrote; anything this large is not a block brief, and reading it into a
// flow file would make the document unusable.
export const SPEC_FILE_MAX_BYTES = 64 * 1024

export class FlowSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowSpecError'
  }
}

export interface SpecFileOptions {
  // The flow's project directory. A relative path resolves against it and may not leave it; an
  // absolute path is taken as written (a spec may live beside the handoff that produced it).
  repo: string
  // Ids already queued or dispatched in this flow.
  existingIds?: string[]
}

// Does `target` sit outside `base`? Decided on strings only, so it is the caller's job to hand in
// resolved paths. `..` alone is the parent itself, and anything starting with `..<sep>` is above it;
// a sibling literally named `..foo` is *not* outside, which a bare `startsWith('..')` gets wrong.
function escapesProject(target: string, base: string): boolean {
  const inside = relative(base, target)
  return inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)
}

// The path a symlink ends at, or null when it does not resolve (a missing file, a broken link).
function realPath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

// Resolve and validate one spec file. Throws FlowSpecError with the reason, never returns a
// half-valid record.
export function readSpecFile(path: string, options: SpecFileOptions): BlockSpec {
  const raw = path.trim()
  if (!raw) throw new FlowSpecError('a spec file path is required')

  const fromProject = !isAbsolute(raw)
  let absolute: string
  if (!fromProject) {
    absolute = raw
  } else if (options.repo) {
    absolute = resolve(options.repo, raw)
    // First pass: the path as spelled. Cheap and it reports the common mistake with the reason the
    // author made it.
    if (escapesProject(absolute, options.repo)) {
      // A relative path is a path inside the project; anything else must be spelled absolutely so
      // the caller sees exactly which file it queued.
      throw new FlowSpecError(`spec path ${raw} is outside the project directory; pass an absolute path`)
    }
  } else {
    throw new FlowSpecError(`spec path ${raw} is relative and the flow has no project directory`)
  }

  // Second pass, and the one that decides: every fs call below follows symlinks, so a link inside
  // the project pointing at a file outside it would pass the spelled-path check and then copy that
  // file's content into the flow record. `realpathSync` also turns a missing target into one clear
  // error before anything is read — and a broken link is exactly that case.
  const real = realPath(absolute)
  if (!real) throw new FlowSpecError(`spec file not found: ${shortHomePath(absolute)}`)
  if (fromProject && escapesProject(real, realPath(options.repo) ?? resolve(options.repo))) {
    throw new FlowSpecError(`spec path ${raw} resolves outside the project directory; pass an absolute path`)
  }

  let size: number
  try {
    const stats = statSync(real)
    if (!stats.isFile()) throw new FlowSpecError(`spec path is not a file: ${shortHomePath(absolute)}`)
    size = stats.size
  } catch (err) {
    if (err instanceof FlowSpecError) throw err
    throw new FlowSpecError(`spec file not found: ${shortHomePath(absolute)}`)
  }
  if (size > SPEC_FILE_MAX_BYTES) {
    throw new FlowSpecError(`spec file is larger than ${SPEC_FILE_MAX_BYTES} bytes: ${shortHomePath(absolute)}`)
  }

  let text: string
  try {
    text = readFileSync(real, 'utf-8')
  } catch {
    throw new FlowSpecError(`spec file could not be read: ${shortHomePath(absolute)}`)
  }
  if (!text.trim()) throw new FlowSpecError(`spec file is empty: ${shortHomePath(absolute)}`)

  // A JSON spec is the structured contract; anything else is markdown and is downgraded to an
  // unstructured block explicitly, with its heading as the id and title.
  const validation = extname(absolute).toLowerCase() === '.json'
    ? parseSpecJson(text, { existingIds: options.existingIds })
    : specFromMarkdown(text, absolute, { existingIds: options.existingIds })
  if (!validation.spec) throw new FlowSpecError(formatSpecIssues(validation.issues))
  return { ...validation.spec, source_path: absolute }
}

export interface QueueSpecResult {
  state: FlowState
  spec: BlockSpec
}

// Append the spec to the flow's queue. Pure apart from the file read: the caller writes the state.
// The queue is the dev's future work, so nothing is dispatched here and `dispatched_specs` is
// untouched.
export function queueSpecFile(state: FlowState, path: string, at?: string): QueueSpecResult {
  if (state.state === 'escalated' || state.state === 'done') {
    throw new FlowSpecError(`flow for run ${state.run_id} is ${state.state}; resume or start a new flow before queueing a block`)
  }
  const spec = readSpecFile(path, {
    repo: state.repo,
    existingIds: [...state.specs.map(entry => entry.id), ...state.dispatched_specs],
  })
  return {
    state: {
      ...state,
      specs: [...state.specs, spec],
      updated_at: at ?? new Date().toISOString(),
    },
    spec,
  }
}
