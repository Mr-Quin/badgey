import type { Plugin } from 'vite'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogEntry } from '../src/lib/log/types'
import { formatEntry } from '../src/lib/log/format'

interface Batch {
  sessionId: string
  entries: LogEntry[]
}

/** Dev-only: receives batched logs at POST /__devlog and writes them to a file.
 *  The file is truncated whenever a new browser session id appears, so each page
 *  load starts a clean log (with a session header). */
export function devLog(opts?: { file?: string; route?: string }): Plugin {
  const file = opts?.file ?? 'dev-logs/dev.log'
  const route = opts?.route ?? '/__devlog'
  let currentSession: string | null = null

  return {
    name: 'badge-devlog',
    apply: 'serve',
    configureServer(server) {
      mkdirSync(dirname(file), { recursive: true })
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || !req.url || !req.url.startsWith(route)) return next()
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { sessionId, entries } = JSON.parse(body) as Batch
            if (sessionId !== currentSession) {
              currentSession = sessionId
              writeFileSync(file, `=== session ${sessionId} @ ${new Date().toISOString()} ===\n`)
            }
            if (entries.length > 0) {
              appendFileSync(file, entries.map(formatEntry).join('\n') + '\n')
            }
          } catch {
            /* ignore malformed batches */
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}
