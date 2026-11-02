import { describe, expect, it, vi } from 'vitest'
import { changeSpeedForFile } from './speedJob.js'

const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })

function makeDeps(overrides = {}) {
  return {
    getMediaInfo: vi.fn().mockResolvedValue({ hasAudio: true }),
    changeSpeed: vi.fn().mockImplementation(async (_file, _speed, options) => {
      options.onProgress(42.4)
      return { blob: new Blob(['y']), filename: 'clip-2x.mp4' }
    }),
    ...overrides,
  }
}

describe('changeSpeedForFile', () => {
  it('passes the speed, audio choices and detected audio to the speed helper', async () => {
    const deps = makeDeps()
    const signal = new AbortController().signal
    const output = await changeSpeedForFile(file, { speed: 2, removeAudio: true, signal }, deps)
    expect(output.filename).toBe('clip-2x.mp4')
    expect(deps.changeSpeed).toHaveBeenCalledWith(
      file,
      2,
      expect.objectContaining({ hasAudio: true, removeAudio: true, keepAudioPitchNatural: true, signal }),
    )
  })

  it('reports rounded progress with a stage label', async () => {
    const reports = []
    await changeSpeedForFile(file, { speed: 2, onProgress: (update) => reports.push(update) }, makeDeps())
    expect(reports[0]).toEqual({ percent: null, stage: 'Getting ready' })
    expect(reports.at(-1)).toEqual({ percent: 42, stage: 'Changing speed' })
  })

  it('falls back to unknown audio when detection fails', async () => {
    const deps = makeDeps({ getMediaInfo: vi.fn().mockRejectedValue(new Error('no')) })
    await changeSpeedForFile(file, { speed: 0.5 }, deps)
    expect(deps.changeSpeed.mock.calls[0][2].hasAudio).toBe('unknown')
  })

  it('refuses 1x and invalid speeds without touching FFmpeg', async () => {
    const deps = makeDeps()
    await expect(changeSpeedForFile(file, { speed: 1 }, deps)).rejects.toThrow(/other than 1x/)
    await expect(changeSpeedForFile(file, { speed: NaN }, deps)).rejects.toThrow()
    expect(deps.changeSpeed).not.toHaveBeenCalled()
  })
})
