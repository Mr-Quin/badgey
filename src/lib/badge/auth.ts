/** Device authentication handshake. The caller supplies `send` (writes raw bytes) and
 *  `nextRaw` (dequeues the next raw notify packet). Resolves true on success. */

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export interface AuthOpts {
  /** Settle delay (ms) before continuing. Default 0. */
  settleMs?: number
  /** Drop any packets queued before the handshake proper begins. */
  drain?: () => void
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function runAuth(
  send: (data: Uint8Array) => Promise<void>,
  nextRaw: () => Promise<Uint8Array>,
  opts: AuthOpts = {},
): Promise<boolean> {
  await send(fromHex('FEDCBAC00600020001EF'))

  if (opts.settleMs && opts.settleMs > 0) await delay(opts.settleMs)
  opts.drain?.()

  await send(Uint8Array.from([0x00, ...Array.from({ length: 16 }, (_, i) => i)]))
  const p = await nextRaw()
  if (!p || p[0] !== 0x01) return false

  await send(Uint8Array.from([0x02, 0x70, 0x61, 0x73, 0x73]))
  const chal = await nextRaw()
  if (!chal || chal[0] !== 0x00 || chal.length < 17) return false
  const r2 = chal.slice(1, 17)

  await send(Uint8Array.from([0x00, ...r2]))
  const ans = await nextRaw()
  if (!ans || ans[0] !== 0x01) return false
  const er2 = ans.slice(1, 17)

  await send(Uint8Array.from([0x01, ...er2]))
  const ok = await nextRaw()
  if (!ok || ok[0] !== 0x02) return false
  return true
}
