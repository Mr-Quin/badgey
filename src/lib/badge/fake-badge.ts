import type { BleTransport, NotifyCb } from './transport'
import { RCSP_WRITE, RCSP_NOTIFY, QIX_WRITE, QIX_NOTIFY, CMD, QIX_CMD } from './constants'
import { buildRcspCmd, buildRcspResponse, parseRcsp, RcspReassembler } from './rcsp'
import { buildQix, QixReassembler } from './qix'

interface VFile {
  name: string
  cluster: number
  bytes: number
}

const R2 = Uint8Array.from(Array.from({ length: 16 }, (_, i) => 0xa0 + i))

/** In-memory simulation of the badge device side, for development and tests. */
export class FakeBadge implements BleTransport {
  readonly mtu = 512
  private subs = new Map<string, NotifyCb[]>()
  private disconnectCbs: (() => void)[] = []

  private authed = false
  private sawClientRandom = false
  private rcspRe = new RcspReassembler()
  private qixRe = new QixReassembler()
  private sn = 0
  private qixSeq = 0

  private files: VFile[] = [{ name: 'f_1.jpg', cluster: 3, bytes: 4096 }]
  private freeKB = 1808

  private xfer: {
    size: number
    received: number
    transferMtu: number
    bytes: number[]
    pullTarget: number
    nameRequested: boolean
    recorded: boolean
  } | null = null

  /** Set if the client ever streams data exceeding the negotiated chunk size.
   *  Tests assert this stays null. */
  mtuViolation: string | null = null

  private E(x: Uint8Array): Uint8Array {
    return x
  }

  private nextSn(): number {
    const s = this.sn & 0xff
    this.sn = (this.sn + 1) & 0xff
    return s
  }

  readonly deviceId = 'fake-badge'
  readonly deviceName = 'Demo badge'
  async connect(
    onPhase?: (p: 'requesting' | 'linking' | 'authenticating' | 'loading') => void,
  ): Promise<void> {
    onPhase?.('linking')
  }
  async disconnect(): Promise<void> {
    for (const cb of this.disconnectCbs) cb()
  }
  onDisconnect(cb: () => void): void {
    this.disconnectCbs.push(cb)
  }

  async subscribe(charUuid: string, cb: NotifyCb): Promise<void> {
    const list = this.subs.get(charUuid) ?? []
    list.push(cb)
    this.subs.set(charUuid, list)
  }

  private notify(charUuid: string, data: Uint8Array) {
    const list = this.subs.get(charUuid)
    if (!list) return
    queueMicrotask(() => {
      for (const cb of list) cb(data)
    })
  }

  async write(charUuid: string, data: Uint8Array, _withResponse: boolean): Promise<void> {
    if (charUuid === RCSP_WRITE) this.onRcspWrite(data)
    else if (charUuid === QIX_WRITE) this.onQixWrite(data)
  }

  private onRcspWrite(data: Uint8Array) {
    if (!this.authed) {
      this.handleAuth(data)
      return
    }
    for (const frame of this.rcspRe.feed(data)) {
      const msg = parseRcsp(frame)
      this.handleRcsp(msg)
    }
  }

  private handleAuth(data: Uint8Array) {
    if (data.length === 0) return
    const tag = data[0]
    if (tag === 0x00 && data.length >= 17) {
      const x = data.slice(1, 17)
      this.notify(RCSP_NOTIFY, Uint8Array.from([0x01, ...this.E(x)]))
      this.sawClientRandom = true
      return
    }
    if (
      tag === 0x02 &&
      data.length >= 5 &&
      data[1] === 0x70 &&
      data[2] === 0x61 &&
      data[3] === 0x73 &&
      data[4] === 0x73
    ) {
      if (this.sawClientRandom) {
        this.notify(RCSP_NOTIFY, Uint8Array.from([0x00, ...R2]))
      }
      return
    }
    if (tag === 0x01) {
      this.authed = true
      this.notify(RCSP_NOTIFY, Uint8Array.from([0x02, 0x70, 0x61, 0x73, 0x73]))
      return
    }
  }

  private handleRcsp(msg: ReturnType<typeof parseRcsp>) {
    if (msg.kind === 'response') {
      if (msg.opcode === CMD.GET_NAME) {
        const name = new TextDecoder('utf-16le')
          .decode(msg.payload)
          .replace(/\0+$/, '')
          .replace(/^啜/, '')
        if (this.xfer && !this.xfer.recorded) {
          this.xfer.recorded = true
          const cluster = this.files.reduce((m, f) => Math.max(m, f.cluster), 2) + 1
          this.files.push({ name, cluster, bytes: this.xfer.size })
          this.freeKB -= Math.ceil(this.xfer.size / 1024)
          this.notify(
            RCSP_NOTIFY,
            buildRcspCmd(CMD.STOP, Uint8Array.from([0x00]), true, this.nextSn()),
          )
        }
      }
      return
    }
    switch (msg.opcode) {
      case CMD.GET_TARGET_INFO:
        this.notify(
          RCSP_NOTIFY,
          buildRcspResponse(CMD.GET_TARGET_INFO, 0, msg.sn, Uint8Array.from([0x01])),
        )
        break
      case CMD.GET_SYS_INFO:
        this.notify(
          RCSP_NOTIFY,
          buildRcspResponse(CMD.GET_SYS_INFO, 0, msg.sn, Uint8Array.from([0x01])),
        )
        break
      case CMD.START_FILE_BROWSE:
        this.notify(RCSP_NOTIFY, buildRcspResponse(CMD.START_FILE_BROWSE, 0, msg.sn))
        if (msg.payload.length >= 18) {
          this.notify(
            RCSP_NOTIFY,
            buildRcspCmd(
              CMD.DATA,
              Uint8Array.from(this.buildListing()),
              false,
              this.nextSn(),
              0x0c,
            ),
          )
        }
        break
      case CMD.PREPARE_ENV:
        this.notify(RCSP_NOTIFY, buildRcspResponse(CMD.PREPARE_ENV, 0, msg.sn))
        break
      case CMD.EXT_PARAM:
        this.notify(
          RCSP_NOTIFY,
          buildRcspResponse(CMD.EXT_PARAM, 0, msg.sn, Uint8Array.from([0x00, 0x01])),
        )
        break
      case CMD.START: {
        const p = msg.payload
        const size = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
        const transferMtu = 490
        this.xfer = {
          size,
          received: 0,
          transferMtu,
          bytes: [],
          pullTarget: 0,
          nameRequested: false,
          recorded: false,
        }
        this.notify(
          RCSP_NOTIFY,
          buildRcspResponse(CMD.START, 0, msg.sn, Uint8Array.from([0x01, 0xea])),
        )
        this.issuePull()
        break
      }
      case CMD.DATA: {
        const p = msg.payload
        if (p.length >= 1 && p[0] === CMD.OP && this.xfer) {
          const data = p.slice(1 + 1 + 2)
          if (data.length > this.xfer.transferMtu) {
            const m = `sub-packet data length ${data.length} exceeds transferMtu ${this.xfer.transferMtu}`
            this.mtuViolation = m
            throw new Error(`FakeBadge: ${m}`)
          }
          for (const b of data) this.xfer.bytes.push(b)
          this.xfer.received += data.length
          if (this.xfer.received >= this.xfer.pullTarget) this.issuePull()
        }
        break
      }
      case CMD.DEL_DEV_FILE: {
        const p = msg.payload
        const cluster = ((p[6] << 24) | (p[7] << 16) | (p[8] << 8) | p[9]) >>> 0
        const idx = this.files.findIndex((f) => f.cluster === cluster)
        if (idx >= 0) {
          this.freeKB += Math.ceil(this.files[idx].bytes / 1024)
          this.files.splice(idx, 1)
        }
        this.notify(RCSP_NOTIFY, buildRcspResponse(CMD.DEL_DEV_FILE, 0, msg.sn))
        break
      }
      default:
        break
    }
  }

  private issuePull() {
    if (!this.xfer) return
    if (this.xfer.received >= this.xfer.size) {
      if (!this.xfer.nameRequested) {
        this.xfer.nameRequested = true
        this.notify(RCSP_NOTIFY, buildRcspCmd(CMD.GET_NAME, new Uint8Array(), true, this.nextSn()))
      }
      return
    }
    const offset = this.xfer.received
    const bufSize = Math.min(this.xfer.size - offset, 3920)
    this.xfer.pullTarget = offset + bufSize
    const opParam = Uint8Array.from([
      0x00,
      (bufSize >> 8) & 0xff,
      bufSize & 0xff,
      (offset >> 24) & 0xff,
      (offset >> 16) & 0xff,
      (offset >> 8) & 0xff,
      offset & 0xff,
    ])
    this.notify(RCSP_NOTIFY, buildRcspCmd(CMD.OP, opParam, true, this.nextSn()))
  }

  private buildListing(): number[] {
    const out: number[] = []
    for (const f of this.files) {
      const nameBytes = utf16le(f.name)
      const flags = 0x09
      out.push(flags)
      out.push(
        (f.cluster >> 24) & 0xff,
        (f.cluster >> 16) & 0xff,
        (f.cluster >> 8) & 0xff,
        f.cluster & 0xff,
      )
      out.push(0x01, 0x00)
      out.push(nameBytes.length)
      for (const b of nameBytes) out.push(b)
    }
    return out
  }

  private onQixWrite(data: Uint8Array) {
    const pkt = this.qixRe.feed(data)
    if (!pkt) return
    switch (pkt.cmd) {
      case QIX_CMD.BIND:
        this.notify(QIX_NOTIFY, buildQix(QIX_CMD.RET_BIND, Uint8Array.from([0x00]), this.qixSeq++))
        break
      case QIX_CMD.SET_FILE_TYPE:
        this.notify(
          QIX_NOTIFY,
          buildQix(
            QIX_CMD.SEND_RESPONSE,
            Uint8Array.from([QIX_CMD.SET_FILE_TYPE, 0x00]),
            this.qixSeq++,
          ),
        )
        break
      case QIX_CMD.REQ_BADGE_INFO: {
        const free = this.freeKB
        const payload = Uint8Array.from([
          1,
          240 & 0xff,
          240 >> 8,
          240 & 0xff,
          240 >> 8,
          240 & 0xff,
          240 >> 8,
          240 & 0xff,
          240 >> 8,
          free & 0xff,
          (free >> 8) & 0xff,
          (free >> 16) & 0xff,
          (free >> 24) & 0xff,
        ])
        this.notify(QIX_NOTIFY, buildQix(QIX_CMD.REP_BADGE_INFO, payload, this.qixSeq++))
        break
      }
      default:
        break
    }
  }
}

function utf16le(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out.push(c & 0xff, (c >> 8) & 0xff)
  }
  return out
}
