const PREFIX = [0xfe, 0xdc, 0xba],
  TAIL = 0xef
export function buildRcspCmd(
  opcode: number,
  payload: Uint8Array,
  wantResp: boolean,
  sn: number,
  xmOp?: number,
): Uint8Array {
  const flag = 0x80 | (wantResp ? 0x40 : 0)
  const param: number[] = [sn & 0xff]
  if (opcode === 1 && xmOp !== undefined) param.push(xmOp & 0xff)
  param.push(...payload)
  const len = param.length
  return Uint8Array.from([
    ...PREFIX,
    flag,
    opcode & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...param,
    TAIL,
  ])
}
export function buildRcspResponse(
  opcode: number,
  status: number,
  sn: number,
  payload: Uint8Array = new Uint8Array(),
): Uint8Array {
  const param = [status & 0xff, sn & 0xff, ...payload],
    len = param.length
  return Uint8Array.from([
    ...PREFIX,
    0x00,
    opcode & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...param,
    TAIL,
  ])
}
export interface RcspMsg {
  kind: 'command' | 'response'
  opcode: number
  status?: number
  sn: number
  payload: Uint8Array
}
export function parseRcsp(frame: Uint8Array): RcspMsg {
  const flag = frame[3],
    opcode = frame[4],
    len = (frame[5] << 8) | frame[6],
    param = frame.slice(7, 7 + len),
    isResp = (flag & 0x80) === 0
  if (isResp)
    return { kind: 'response', opcode, status: param[0], sn: param[1], payload: param.slice(2) }
  return { kind: 'command', opcode, sn: param[0], payload: param.slice(1) }
}
export class RcspReassembler {
  private buf: number[] = []
  feed(data: Uint8Array): Uint8Array[] {
    this.buf.push(...data)
    const out: Uint8Array[] = []
    while (true) {
      const idx = findPrefix(this.buf)
      if (idx === -1) {
        if (this.buf.length > 2) this.buf = this.buf.slice(-2)
        break
      }
      if (idx > 0) this.buf.splice(0, idx)
      if (this.buf.length < 7) break
      const total = ((this.buf[5] << 8) | this.buf[6]) + 8
      if (this.buf.length < total) break
      const frame = this.buf.slice(0, total)
      this.buf.splice(0, total)
      if (frame[frame.length - 1] === TAIL) out.push(Uint8Array.from(frame))
    }
    return out
  }
}
function findPrefix(b: number[]): number {
  for (let i = 0; i + 2 < b.length; i++)
    if (b[i] === 0xfe && b[i + 1] === 0xdc && b[i + 2] === 0xba) return i
  return -1
}
