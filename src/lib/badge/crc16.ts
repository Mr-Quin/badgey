export function crc16(data: Uint8Array, init = 0): number {
  let crc = init & 0xffff
  for (const byte of data) {
    const val = ((crc << 8) & 0xffff) | (crc >> 8)
    const i11 = val ^ byte
    const i12 = i11 ^ ((i11 & 0xff) >> 4)
    const i13 = i12 ^ ((i12 << 12) & 0xffff)
    crc = i13 ^ (((i13 & 0xff) << 5) & 0xffff)
  }
  return crc & 0xffff
}
