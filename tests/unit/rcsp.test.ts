import { test, expect } from 'vitest'
import {
  buildRcspCmd,
  buildRcspResponse,
  parseRcsp,
  RcspReassembler,
} from '../../src/lib/badge/rcsp'

const hex = (u: Uint8Array) =>
  Array.from(u)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

test('buildRcspCmd(33,[0],true,0) frame bytes', () => {
  const frame = buildRcspCmd(33, Uint8Array.from([0]), true, 0)
  expect(hex(frame)).toBe('fedcbac0210002' + '0000' + 'ef')
})

test('parseRcsp round-trips a response frame', () => {
  const msg = parseRcsp(buildRcspResponse(33, 0, 5, Uint8Array.from([1, 2])))
  expect(msg.kind).toBe('response')
  expect(msg.opcode).toBe(33)
  expect(msg.status).toBe(0)
  expect(msg.sn).toBe(5)
  expect(Array.from(msg.payload)).toEqual([1, 2])
})

test('RcspReassembler reassembles a frame split across two feeds', () => {
  const frame = buildRcspResponse(33, 0, 5, Uint8Array.from([1, 2]))
  const r = new RcspReassembler()
  const a = r.feed(frame.slice(0, 4))
  const b = r.feed(frame.slice(4))
  expect(a.length).toBe(0)
  expect(b.length).toBe(1)
  expect(hex(b[0])).toBe(hex(frame))
})
