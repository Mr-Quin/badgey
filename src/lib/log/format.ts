import type { LogEntry } from './types'

/** Render one arg to text: strings pass through, typed arrays become hex, the
 *  rest are JSON. Kept dependency-free so the Vite plugin (node) can import it. */
function render(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Uint8Array) {
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

/** The one canonical text format for a log entry, used for the on-disk file. */
export function formatEntry(e: LogEntry): string {
  const time = new Date(e.ts).toISOString().slice(11, 23) // HH:MM:SS.mmm
  const level = e.level.toUpperCase().padEnd(5)
  if (e.level === 'event') {
    const data = e.data ? ' ' + JSON.stringify(e.data) : ''
    return `${time}  ${level}  [${e.scope}]  ${e.event ?? ''}${data}`
  }
  return `${time}  ${level}  [${e.scope}]  ${e.args.map(render).join(' ')}`
}
