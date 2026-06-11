import type { BleTransport, PhaseCb } from './transport'
import {
  RCSP_WRITE,
  RCSP_NOTIFY,
  QIX_WRITE,
  QIX_NOTIFY,
  QIX_CTRL,
  CMD,
  QIX_CMD,
  STORAGE_DEV,
  FILE_TYPE_BADGE,
} from './constants'
import { buildRcspCmd, buildRcspResponse, parseRcsp, RcspReassembler, type RcspMsg } from './rcsp'
import { buildQix, QixReassembler } from './qix'
import { parseFileStructs, type FileEntry } from './filestruct'
import { crc16 } from './crc16'
import { runAuth } from './auth'
import { dlog, devent, hex } from './debug'

export interface BadgeInfo {
  display: [number, number]
  picture: [number, number]
  freeKB: number
}

interface Waiter<T> {
  resolve: (v: T) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out[i * 2] = c & 0xff
    out[i * 2 + 1] = (c >> 8) & 0xff
  }
  return out
}

export function buildStartPayload(size: number, crc: number, tmpName: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(tmpName)
  return Uint8Array.from([
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    (crc >> 8) & 0xff,
    crc & 0xff,
    ...nameBytes,
  ])
}

export function buildSubpacket(
  seq: number,
  data: Uint8Array,
  useCrc: boolean,
  crcFn: (d: Uint8Array, init: number) => number,
): Uint8Array {
  const sub: number[] = [seq & 0xff]
  if (useCrc) {
    const c = crcFn(data, 0)
    sub.push((c >> 8) & 0xff, c & 0xff)
  }
  for (const b of data) sub.push(b)
  return Uint8Array.from(sub)
}

export class BadgeClient {
  private t: BleTransport
  private qixRe = new QixReassembler()
  private rcspRe = new RcspReassembler()
  private sn = 0

  private authed = false
  private authQ: Uint8Array[] = []
  private authWaiters: ((d: Uint8Array) => void)[] = []

  private qixWaiters = new Map<number, Waiter<Uint8Array>>()
  private rcspWaiters = new Map<number, Waiter<RcspMsg>>()

  private browseBuf: number[] = []
  private subscribed = false
  // Serializes pull handling so overlapping pull requests can't interleave writes.
  private pullChain: Promise<void> = Promise.resolve()
  private qixSeq = 0

  private upload: {
    bytes: Uint8Array
    total: number
    transferMtu: number
    useCrc: boolean
    onProgress?: (sent: number, total: number) => void
    displayName: string
    done: () => void
    fail: (e: Error) => void
    finished: boolean
    // Resolves once transfer setup is complete; handlePull awaits it before
    // sending any data, so the first pull is never serviced too early.
    started: Promise<void>
    startResolve: () => void
  } | null = null

  private readonly authSettleMs: number
  private readonly browseQuiesceMs: number

  constructor(transport: BleTransport, opts?: { authSettleMs?: number; browseQuiesceMs?: number }) {
    this.t = transport
    this.authSettleMs = opts?.authSettleMs ?? 300
    this.browseQuiesceMs = opts?.browseQuiesceMs ?? 150
  }

  private nextSn(): number {
    const s = this.sn & 0xff
    this.sn = (this.sn + 1) & 0xff
    return s
  }

  private async ensureSubscribed() {
    if (this.subscribed) return
    this.subscribed = true
    await this.t.subscribe(QIX_NOTIFY, (d) => this.onQix(d))
    await this.t.subscribe(QIX_CTRL, (d) => this.onQix(d))
    await this.t.subscribe(RCSP_NOTIFY, (d) => this.onRcsp(d))
  }

  private onQix(data: Uint8Array) {
    const pkt = this.qixRe.feed(data)
    if (!pkt) return
    const w = this.qixWaiters.get(pkt.cmd)
    if (w) {
      clearTimeout(w.timer)
      this.qixWaiters.delete(pkt.cmd)
      w.resolve(pkt.payload)
    }
  }

  private onRcsp(data: Uint8Array) {
    if (!this.authed) {
      dlog('rcsp auth-rx', hex(data))
      const w = this.authWaiters.shift()
      if (w) w(data)
      else this.authQ.push(data)
      return
    }
    for (const frame of this.rcspRe.feed(data)) {
      const msg = parseRcsp(frame)
      dlog(
        'rcsp rx',
        msg.kind,
        'op=' + msg.opcode,
        'sn=' + msg.sn,
        msg.status !== undefined ? 'st=' + msg.status : '',
        hex(msg.payload),
      )
      if (msg.kind === 'response') {
        const w = this.rcspWaiters.get(msg.opcode)
        if (w) {
          clearTimeout(w.timer)
          this.rcspWaiters.delete(msg.opcode)
          w.resolve(msg)
        }
      } else {
        void this.handleDeviceCmd(msg)
      }
    }
  }

  private nextRaw(): Promise<Uint8Array> {
    const q = this.authQ.shift()
    if (q) return Promise.resolve(q)
    return new Promise((resolve) => this.authWaiters.push(resolve))
  }

  private async handleDeviceCmd(msg: RcspMsg) {
    switch (msg.opcode) {
      case CMD.OP:
        this.pullChain = this.pullChain.then(() => this.handlePull(msg)).catch(() => {})
        break
      case CMD.STOP: {
        await this.writeRcsp(buildRcspResponse(CMD.STOP, 0, msg.sn))
        if (this.upload && !this.upload.finished) {
          this.upload.finished = true
          this.upload.done()
        }
        break
      }
      case CMD.GET_NAME: {
        const name = this.upload?.displayName ?? ''
        await this.writeRcsp(buildRcspResponse(CMD.GET_NAME, 0, msg.sn, utf16le(name)))
        break
      }
      case CMD.DATA: {
        const p = msg.payload
        if (p.length && p[0] === 0x0c) for (let i = 1; i < p.length; i++) this.browseBuf.push(p[i])
        break
      }
      case 13:
        await this.writeRcsp(buildRcspResponse(13, 0, msg.sn, msg.payload))
        break
      default:
        break
    }
  }

  private async handlePull(msg: RcspMsg) {
    if (!this.upload) return
    await this.upload.started
    const p = msg.payload
    if (p.length < 7 || !this.upload) return
    const bufSize = (p[1] << 8) | p[2]
    const offset = ((p[3] << 24) | (p[4] << 16) | (p[5] << 8) | p[6]) >>> 0
    const u = this.upload
    const n = Math.max(0, Math.min(bufSize, u.total - offset))
    const chunk = u.bytes.slice(offset, offset + n)
    let seq = 0
    let i = 0
    while (i < chunk.length) {
      const piece = chunk.slice(i, i + u.transferMtu)
      const sub = buildSubpacket(seq, piece, u.useCrc, crc16)
      await this.writeRcsp(buildRcspCmd(CMD.DATA, sub, false, this.nextSn(), CMD.OP))
      seq++
      i += piece.length
      u.onProgress?.(offset + i, u.total)
    }
  }

  // The transport owns fragmentation; always hand it the whole frame.
  private async writeRcsp(data: Uint8Array) {
    await this.t.write(RCSP_WRITE, data, false)
  }

  private async writeQix(data: Uint8Array) {
    await this.t.write(QIX_WRITE, data, true)
  }

  private qixSendWait(
    cmd: number,
    payload: Uint8Array,
    respCmd: number,
    requestBit = false,
    timeout = 5000,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.qixWaiters.delete(respCmd)
        reject(new Error(`qix timeout cmd=${cmd}`))
      }, timeout)
      this.qixWaiters.set(respCmd, { resolve, reject, timer })
      void this.writeQix(buildQix(cmd, payload, this.qixSeq++, requestBit))
    })
  }

  private rcspSendWait(
    opcode: number,
    payload: Uint8Array,
    wantResp = true,
    timeout = 6000,
  ): Promise<RcspMsg> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rcspWaiters.delete(opcode)
        reject(new Error(`rcsp timeout op=${opcode}`))
      }, timeout)
      this.rcspWaiters.set(opcode, { resolve, reject, timer })
      dlog('rcsp tx', 'op=' + opcode, hex(payload))
      void this.writeRcsp(buildRcspCmd(opcode, payload, wantResp, this.nextSn()))
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** Tear down the link. Safe to call when already disconnected. */
  async disconnect(): Promise<void> {
    this.authed = false
    this.subscribed = false
    await this.t.disconnect()
  }

  get deviceId(): string | null {
    return this.t.deviceId
  }

  get deviceName(): string | null {
    return this.t.deviceName
  }

  onDisconnect(cb: () => void): void {
    this.t.onDisconnect(cb)
  }

  /** Lightweight liveness check; rejects if the link is gone. Used as a heartbeat. */
  async ping(): Promise<void> {
    await this.getInfo()
  }

  async connect(onPhase?: PhaseCb): Promise<void> {
    await this.t.connect(onPhase)
    // Fail an in-flight upload immediately on a drop rather than waiting for the timeout.
    this.t.onDisconnect(() => {
      const u = this.upload
      if (u && !u.finished) {
        u.finished = true
        u.fail(new Error('link lost'))
      }
    })
    await this.ensureSubscribed()
    devent('subscribed-all')

    const bindPayload = Uint8Array.from([6, 0x11, 0x27, 0, 0, 0, 0, 0x11, 0x27, 0, 0, 0, 0])
    await this.qixSendWait(QIX_CMD.BIND, bindPayload, QIX_CMD.RET_BIND)
    devent('bind-ok')

    onPhase?.('authenticating')
    devent('auth-start')
    const ok = await runAuth(
      (d) => this.t.write(RCSP_WRITE, d, false),
      () => this.nextRaw(),
      {
        settleMs: this.authSettleMs,
        drain: () => {
          this.authQ.length = 0
        },
      },
    )
    devent('auth-done', { ok })
    if (!ok) throw new Error('auth failed')
    this.authed = true

    onPhase?.('loading')
    await this.rcspSendWait(CMD.GET_TARGET_INFO, fromHex('FFFFFFFF00'))
    await this.rcspSendWait(CMD.GET_SYS_INFO, fromHex('FF00000004'))
    await this.doBrowse()
  }

  private async doBrowse(): Promise<void> {
    this.browseBuf = []
    await this.rcspSendWait(CMD.START_FILE_BROWSE, fromHex('000A000100000002000400000000'))
    await this.rcspSendWait(CMD.START_FILE_BROWSE, fromHex('000A00010000000200080000000000000002'))
    // The listing streams in without a completion signal; wait until it stops growing.
    const tick = this.browseQuiesceMs
    let last = -1
    for (let waited = 0; waited < 2500; waited += tick) {
      if (this.browseBuf.length > 0 && this.browseBuf.length === last) break
      last = this.browseBuf.length
      await this.delay(tick)
    }
  }

  async getInfo(): Promise<BadgeInfo> {
    await this.ensureSubscribed()
    const res = await this.qixSendWait(
      QIX_CMD.REQ_BADGE_INFO,
      Uint8Array.from([1]),
      QIX_CMD.REP_BADGE_INFO,
    )
    if (res.length < 13 || res[0] !== 1) throw new Error('invalid badge info')
    return {
      display: [res[1] | (res[2] << 8), res[3] | (res[4] << 8)],
      picture: [res[5] | (res[6] << 8), res[7] | (res[8] << 8)],
      freeKB: (res[9] | (res[10] << 8) | (res[11] << 16) | (res[12] << 24)) >>> 0,
    }
  }

  async listFiles(): Promise<FileEntry[]> {
    await this.doBrowse()
    return parseFileStructs(Uint8Array.from(this.browseBuf))
  }

  async uploadImage(
    bytes: Uint8Array,
    opts?: { onProgress?: (sent: number, total: number) => void; ext?: string },
  ): Promise<void> {
    await this.qixSendWait(
      QIX_CMD.SET_FILE_TYPE,
      Uint8Array.from([FILE_TYPE_BADGE]),
      QIX_CMD.SEND_RESPONSE,
    )
    await this.rcspSendWait(CMD.PREPARE_ENV, Uint8Array.from([0x00]))
    const ext = await this.rcspSendWait(
      CMD.EXT_PARAM,
      Uint8Array.from([0, 0, 0, 0, STORAGE_DEV, 1]),
    )
    const useCrc = ext.payload[1] === 1

    const fileCrc = crc16(bytes, 0)
    const hash = (bytes.length >>> 0).toString(16).padStart(8, '0')
    const tmpName = hash + '.tmp\0'
    const startPayload = buildStartPayload(bytes.length, fileCrc, tmpName)
    const ext2 = opts?.ext ?? 'jpg'
    const displayName = '啜f_' + Math.floor(Date.now() / 1000) + '.' + ext2 + '\0'
    const timeoutMs = Math.max(120000, (bytes.length / 1200) * 1000)

    // Stage upload state before sending start, so the first pull is serviced.
    let startResolve!: () => void
    const started = new Promise<void>((r) => {
      startResolve = r
    })
    const completion = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.upload) this.upload.finished = true
        reject(new Error('upload timeout'))
      }, timeoutMs)
      this.upload = {
        bytes,
        total: bytes.length,
        transferMtu: 490,
        useCrc,
        onProgress: opts?.onProgress,
        displayName,
        done: () => {
          clearTimeout(timer)
          resolve()
        },
        fail: (e) => {
          clearTimeout(timer)
          reject(e)
        },
        finished: false,
        started,
        startResolve,
      }
    })

    const startRes = await this.rcspSendWait(CMD.START, startPayload, true, 8000)
    let transferMtu = (startRes.payload[0] << 8) | startRes.payload[1]
    if (!transferMtu || transferMtu <= 0) transferMtu = 490
    if (this.upload) this.upload.transferMtu = transferMtu
    startResolve()

    await completion
    this.upload = null
  }

  async deleteFile(name: string): Promise<void> {
    const files = await this.listFiles()
    const entry = files.find((f) => f.name === name)
    if (!entry) throw new Error(`file not found: ${name}`)
    await this.rcspSendWait(CMD.PREPARE_ENV, Uint8Array.from([0x01]))
    const param = Uint8Array.from([
      1,
      (entry.dev >>> 24) & 0xff,
      (entry.dev >>> 16) & 0xff,
      (entry.dev >>> 8) & 0xff,
      entry.dev & 0xff,
      1,
      (entry.cluster >>> 24) & 0xff,
      (entry.cluster >>> 16) & 0xff,
      (entry.cluster >>> 8) & 0xff,
      entry.cluster & 0xff,
    ])
    const res = await this.rcspSendWait(CMD.DEL_DEV_FILE, param)
    if (res.status !== 0) throw new Error(`delete failed status=${res.status}`)
  }
}
