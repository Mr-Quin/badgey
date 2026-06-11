import { badgeLog } from '../log'

/** Verbose badge-protocol logging. Routes to the app logger's `badge` scope:
 *  silent in production (no sinks), console + dev-log file in development. */
export function dlog(...args: unknown[]): void {
  badgeLog.debug(...args)
}

/** Structured, greppable lifecycle marker on the `badge` scope (renders as an
 *  EVENT line in the dev log). Use for connect/auth/disconnect milestones. */
export function devent(name: string, data?: Record<string, unknown>): void {
  badgeLog.event(name, data)
}

export function hex(d: Uint8Array): string {
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}
