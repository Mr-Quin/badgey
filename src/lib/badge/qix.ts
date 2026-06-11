export function buildQix(
  cmd: number,
  payload: Uint8Array,
  seq = 0,
  requestBit = false,
): Uint8Array {
  const s = seq & 0x0f
  const isLong = payload.length + 6 > 20
  let flag = (s << 3) | (isLong ? 0x04 : 0) | 0x02
  if (requestBit) flag |= 0x80
  const inner = [
    flag & 0xff,
    cmd & 0xff,
    payload.length & 0xff,
    (payload.length >> 8) & 0xff,
    ...payload,
  ]
  const chk = inner.reduce((a, b) => a + b, 0) & 0xff
  return Uint8Array.from([0x9e, chk, ...inner])
}
export class QixReassembler {
  private buf: number[] = []
  private expected = 0
  feed(data: Uint8Array): { cmd: number; payload: Uint8Array } | null {
    if (this.expected === 0) {
      if (!data.length || data[0] !== 0x9e || data.length < 6) return null
      this.expected = (data[4] | (data[5] << 8)) + 6
      this.buf = Array.from(data)
    } else this.buf.push(...data)
    if (this.buf.length >= this.expected) {
      const pkt = this.buf.slice(0, this.expected)
      this.expected = 0
      this.buf = []
      const len = pkt[4] | (pkt[5] << 8)
      return { cmd: pkt[3], payload: Uint8Array.from(pkt.slice(6, 6 + len)) }
    }
    return null
  }
}
