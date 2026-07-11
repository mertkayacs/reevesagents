// Output buffering for `read`. tmux capture-pane hands back clean, wrapped lines of
// the current screen plus scrollback; ConPTY gives us only a live byte stream with
// no scrollback (node-pty onData), so we keep our own bounded buffer and return its
// tail. The interface is pluggable so a headless-terminal implementation can drop
// in later without touching callers.
//
// Fidelity limitation (MVP, ring buffer): every target here is a full-screen TUI
// (Ink, Textual). ConPTY repaints regions with cursor-motion escapes, so the raw
// stream holds many overwrites of the same cells. Stripping ANSI color does not
// collapse those cursor-motion repaints, so `read` can surface duplicated or
// partial frames. It is enough to see what an agent is waiting on, but noisy for
// structured output. A headless xterm grid (feed onData, serialize the last n rows)
// would reproduce capture-pane fidelity; that is a deliberate follow-up, not MVP.

export interface OutputBuffer {
  push(_data: string): void
  tail(_nLines: number): string
}

export class RingBuffer implements OutputBuffer {
  private buf = ''
  private readonly cap: number

  constructor(cap = 200_000) {
    this.cap = cap
  }

  push(data: string): void {
    this.buf += data
    if (this.buf.length > this.cap) this.buf = this.buf.slice(this.buf.length - this.cap)
  }

  tail(nLines: number): string {
    const n = Number.isFinite(nLines) && nLines > 0 ? Math.floor(nLines) : 1
    const lines = this.buf.split('\n')
    return lines.slice(Math.max(0, lines.length - n)).join('\n')
  }
}
