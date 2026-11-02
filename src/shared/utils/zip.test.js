import { describe, expect, it } from 'vitest'
import { crc32, createZip, uniqueNames } from './zip.js'

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('uniqueNames', () => {
  it('numbers repeated names and keeps extensions', () => {
    expect(uniqueNames(['a.srt', 'a.srt', 'b.srt', 'a.srt'])).toEqual([
      'a.srt',
      'a (2).srt',
      'b.srt',
      'a (3).srt',
    ])
  })
})

describe('createZip', () => {
  it('writes a readable archive with every entry', async () => {
    const blob = createZip([
      { name: 'one.txt', data: 'hello' },
      { name: 'two.txt', data: new Uint8Array([1, 2, 3]) },
    ])
    expect(blob.type).toBe('application/zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    // Local header of the first entry.
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(14, true)).toBe(crc32(new TextEncoder().encode('hello')))
    expect(view.getUint32(18, true)).toBe(5)

    // End-of-directory record: two entries, directory inside the file.
    const end = bytes.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const directoryOffset = view.getUint32(end + 16, true)
    expect(view.getUint32(directoryOffset, true)).toBe(0x02014b50)
    expect(directoryOffset + view.getUint32(end + 12, true)).toBe(end)
  })
})
