import type { LogEntry, LogSink } from '../types'

export interface HttpSinkOptions {
  endpoint?: string
  sessionId?: string
  debounceMs?: number
  maxBatch?: number
}

/** Buffers entries and ships them to the dev server as batched JSON. A debounce
 *  coalesces bursts; a full buffer flushes immediately; page-hide flushes via
 *  sendBeacon so the last lines survive a reload. Network errors are swallowed —
 *  logging must never perturb the code being debugged. */
export class HttpSink implements LogSink {
  private readonly endpoint: string
  private readonly sessionId: string
  private readonly debounceMs: number
  private readonly maxBatch: number
  private buf: LogEntry[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  // Bound once so dispose() can detach them. Beacon-flush on page-hide so the last
  // entries survive a reload.
  private readonly onPageHide = () => this.flushBeacon()
  private readonly onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.flushBeacon()
    }
  }

  constructor(opts: HttpSinkOptions = {}) {
    this.endpoint = opts.endpoint ?? '/__devlog'
    this.sessionId = opts.sessionId ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    this.debounceMs = opts.debounceMs ?? 250
    this.maxBatch = opts.maxBatch ?? 50
    if (typeof addEventListener !== 'undefined') {
      addEventListener('pagehide', this.onPageHide)
      addEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  /** Detach the page-lifecycle listeners. The app uses a single long-lived sink,
   *  but disposable sinks keep the abstraction clean and tests leak-free. */
  dispose(): void {
    if (typeof removeEventListener !== 'undefined') {
      removeEventListener('pagehide', this.onPageHide)
      removeEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  write(e: LogEntry): void {
    this.buf.push(e)
    if (this.buf.length >= this.maxBatch) void this.flush()
    else this.schedule()
  }

  private schedule(): void {
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.debounceMs)
  }

  private take(): string | null {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.buf.length === 0) return null
    const entries = this.buf
    this.buf = []
    return JSON.stringify({ sessionId: this.sessionId, entries })
  }

  async flush(): Promise<void> {
    const body = this.take()
    if (body === null) return
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      })
    } catch {
      /* logging must never throw into app code */
    }
  }

  private flushBeacon(): void {
    const body = this.take()
    if (body === null) return
    try {
      navigator.sendBeacon?.(this.endpoint, new Blob([body], { type: 'application/json' }))
    } catch {
      /* ignore */
    }
  }
}
