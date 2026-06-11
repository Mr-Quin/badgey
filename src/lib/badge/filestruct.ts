export interface FileEntry {
  file: boolean
  dev: number
  cluster: number
  num: number
  name: string
}
export function parseFileStructs(buf: Uint8Array): FileEntry[] {
  const out: FileEntry[] = []
  let i = 0
  while (i + 8 <= buf.length) {
    const flags = buf[i]
    const isFile = !!(flags & 1)
    const unicode = !(flags & 2)
    const dev = (flags & 0x7c) >> 2
    const cluster = ((buf[i + 1] << 24) | (buf[i + 2] << 16) | (buf[i + 3] << 8) | buf[i + 4]) >>> 0
    const num = buf[i + 5] | (buf[i + 6] << 8)
    const namelen = buf[i + 7]
    if (namelen === 0 || i + 8 + namelen > buf.length) break
    const raw = buf.slice(i + 8, i + 8 + namelen)
    const name = new TextDecoder(unicode ? 'utf-16le' : 'gbk').decode(raw).replace(/\0+$/, '')
    out.push({ file: isFile, dev, cluster, num, name })
    i += 8 + namelen
  }
  return out
}
