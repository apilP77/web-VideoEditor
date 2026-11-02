const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/**
 * Computes the CRC-32 checksum a ZIP entry needs.
 *
 * @param {Uint8Array} bytes Data to checksum.
 * @returns {number} Unsigned 32-bit CRC.
 */
export function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Makes names unique inside one folder by adding " (2)", " (3)" and so on.
 *
 * @param {string[]} names Names in order, possibly with repeats.
 * @returns {string[]} Same-length list with no repeats.
 */
export function uniqueNames(names) {
  const seen = new Map()
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    if (count === 1) return name
    const dot = name.lastIndexOf('.')
    return dot > 0
      ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
      : `${name} (${count})`
  })
}

// The classic ZIP format stores sizes and offsets in 32 bits.
const ZIP_LIMIT = 0xffffffff

/**
 * Lays out a ZIP archive from entries whose checksum and size are known.
 *
 * @param {{name: string, part: Uint8Array | Blob, size: number, crc: number}[]} entries Entries, in order.
 * @returns {Blob} ZIP archive.
 */
function assembleZip(entries) {
  const names = uniqueNames(entries.map((entry) => entry.name))
  const parts = []
  const central = []
  let offset = 0

  entries.forEach((file, index) => {
    const nameBytes = encoder.encode(names[index])

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint32(14, file.crc, true)
    local.setUint32(18, file.size, true)
    local.setUint32(22, file.size, true)
    local.setUint16(26, nameBytes.length, true)
    parts.push(local, nameBytes, file.part)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, file.crc, true)
    entry.setUint32(20, file.size, true)
    entry.setUint32(24, file.size, true)
    entry.setUint16(28, nameBytes.length, true)
    entry.setUint32(42, offset, true)
    central.push(entry, nameBytes)

    offset += 30 + nameBytes.length + file.size
  })

  const centralSize = central.reduce((sum, part) => sum + (part.byteLength ?? part.length), 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

/**
 * Builds a ZIP file without compression (fine for small text files).
 *
 * @param {{name: string, data: string | Uint8Array}[]} files Entries to store.
 * @returns {Blob} ZIP archive.
 */
export function createZip(files) {
  return assembleZip(
    files.map((file) => {
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
      return { name: file.name, part: data, size: data.length, crc: crc32(data) }
    }),
  )
}

/**
 * Builds a ZIP file from blobs such as finished videos. Only one blob is read
 * into memory at a time, and the archive refers to the original blobs.
 *
 * @param {{name: string, blob: Blob}[]} files Entries to store.
 * @returns {Promise<Blob>} ZIP archive.
 * @throws {RangeError} When the archive would be 4 GB or larger.
 */
export async function createZipFromBlobs(files) {
  const total = files.reduce((sum, file) => sum + file.blob.size, 0)
  if (total >= ZIP_LIMIT - 1024 * files.length) {
    throw new RangeError('These files are too large for one ZIP (the limit is 4 GB). Save them one by one instead.')
  }
  const entries = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer())
    entries.push({ name: file.name, part: file.blob, size: file.blob.size, crc: crc32(bytes) })
  }
  return assembleZip(entries)
}
