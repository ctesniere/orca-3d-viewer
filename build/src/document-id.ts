// A short name for a document's content, so notes written on a file can be found again when the same file is
// opened again: the frame is never told the file's path. It reads the first and last 64 KiB and a spread of bytes
// between, so it stays fast on the largest file; two files that differ only where it does not look share a name,
// which for notes is what one wants after a small edit.

const EDGE = 64 * 1024
const SPREAD = 64 * 1024

export function documentId(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? null : new Uint8Array(data)
  const length = bytes ? bytes.length : (data as string).length
  const at = (index: number): number => (bytes ? bytes[index]! : (data as string).charCodeAt(index))
  let first = 0x811c9dc5
  let second = 0x9e3779b1
  const take = (index: number): void => {
    const value = at(index)
    first = Math.imul(first ^ value, 0x01000193) >>> 0
    second = Math.imul(second + value + 1, 0x85ebca6b) >>> 0
    second ^= second >>> 13
  }
  const step = Math.max(1, Math.floor(length / SPREAD))
  for (let index = 0; index < Math.min(EDGE, length); index++) take(index)
  for (let index = EDGE; index < length - EDGE; index += step) take(index)
  for (let index = Math.max(EDGE, length - EDGE); index < length; index++) take(index)
  return `${length.toString(16)}-${first.toString(16)}-${second.toString(16)}`
}
