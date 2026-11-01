// Secret redaction copied from the unix package's src/core/redact.ts so `read`
// output is scrubbed identically on both packages. catalog-drift.test.ts asserts
// these match the originals so the patterns cannot silently diverge.

// Ordered: longer prefix patterns must come before shorter ones (e.g. sk-ant before sk-)
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /gsk_[A-Za-z0-9\-_]{20,}/g,
  // GitHub tokens: `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` followed by 36 characters. They show up in tool output and in
  // the fleet supervisor's messages, and the pre-commit check already greps for them.
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]')
  return result
}
