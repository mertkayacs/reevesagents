// Secret redaction for everything persisted or surfaced from agent output.
// Invariant: all user/model text fields are redacted before writing (see runs.ts).
// packages/reevesagents-win/src/shared/redact.ts carries a verbatim copy,
// enforced by its catalog-drift test.

// Ordered: longer prefix patterns must come before shorter ones (e.g. sk-ant before sk-)
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /gsk_[A-Za-z0-9\-_]{20,}/g,
  // GitHub tokens: `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` followed by 36 characters. They show up in tool output and in
  // the fleet supervisor's messages, and the pre-commit check already greps for them.
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  // Fine-grained PATs: `github_pat_` followed by base62-ish segments separated by underscores.
  /github_pat_[A-Za-z0-9_]{20,}/g,
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]')
  return result
}
