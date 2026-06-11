import { test, expect } from 'vitest'
import { runAuth } from '../../src/lib/badge/auth'
import { FakeBadge } from '../../src/lib/badge/fake-badge'
import { RCSP_WRITE, RCSP_NOTIFY } from '../../src/lib/badge/constants'

test('runAuth completes the oracle handshake against FakeBadge', async () => {
  const fb = new FakeBadge()
  await fb.connect()
  const queue: Uint8Array[] = []
  const waiters: ((d: Uint8Array) => void)[] = []
  await fb.subscribe(RCSP_NOTIFY, (d) => {
    const w = waiters.shift()
    if (w) w(d)
    else queue.push(d)
  })
  const nextRaw = (): Promise<Uint8Array> =>
    new Promise((resolve) => {
      const q = queue.shift()
      if (q) resolve(q)
      else waiters.push(resolve)
    })
  const send = (data: Uint8Array) => fb.write(RCSP_WRITE, data, false)

  const ok = await runAuth(send, nextRaw)
  expect(ok).toBe(true)
})
