import { describe, expect, it } from 'vitest'
import { measureDownloadSpeed } from './downloadSpeed.js'

describe('measureDownloadSpeed', () => {
  it('handles the first report with no previous sample and no file name', () => {
    // The worker reports overall progress without a file, so file is
    // undefined on both sides; this used to read null.time and throw.
    const result = measureDownloadSpeed(null, { loadedBytes: 1000 }, 50)
    expect(result.bytesPerSecond).toBeNull()
    expect(result.sample).toEqual({ file: undefined, bytes: 1000, time: 50 })
  })

  it('measures speed between two reports', () => {
    const first = measureDownloadSpeed(null, { loadedBytes: 0 }, 1000).sample
    const second = measureDownloadSpeed(first, { loadedBytes: 2_000_000 }, 2000)
    expect(second.bytesPerSecond).toBe(2_000_000)
  })

  it('does not compare reports for different files', () => {
    const previous = { file: 'encoder.onnx', bytes: 500, time: 0 }
    const result = measureDownloadSpeed(previous, { file: 'decoder.onnx', loadedBytes: 900 }, 1000)
    expect(result.bytesPerSecond).toBeNull()
  })

  it('keeps the previous sample when the report has no byte count', () => {
    const previous = { bytes: 500, time: 0 }
    const result = measureDownloadSpeed(previous, { loadedBytes: null }, 1000)
    expect(result).toEqual({ bytesPerSecond: null, sample: previous })
    expect(measureDownloadSpeed(null, {}, 1000)).toEqual({ bytesPerSecond: null, sample: null })
  })
})
