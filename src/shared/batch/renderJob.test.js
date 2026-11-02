import { describe, expect, it, vi } from 'vitest'
import { describeRenderProgress, renderCaptionedVideo } from './renderJob.js'

const file = new File(['x'], 'a.mp4', { type: 'video/mp4' })
const captions = [{ words: [{ word: 'hi', start: 0, end: 1 }], start: 0, end: 1 }]

function makeDeps(overrides = {}) {
  return {
    waitForCaptionFonts: vi.fn(async () => {}),
    getMediaInfo: vi.fn(async () => ({ hasAudio: false })),
    exportCaptionVideo: vi.fn(async () => ({ blob: new Blob(['v']), filename: 'a-captioned.mp4' })),
    ...overrides,
  }
}

describe('describeRenderProgress', () => {
  it('clamps percent and labels the stage', () => {
    expect(describeRenderProgress({ stage: 'recording', percent: 140 })).toEqual({
      percent: 100,
      stage: 'Recording in real time',
    })
    expect(describeRenderProgress({ stage: 'x', percent: null })).toEqual({
      percent: null,
      stage: 'Adding captions',
    })
  })
})

describe('renderCaptionedVideo', () => {
  it('waits for fonts, passes audio info and returns the export', async () => {
    const deps = makeDeps()
    const updates = []
    const out = await renderCaptionedVideo(file, captions, { preset: 'classic' }, {
      onProgress: (u) => updates.push(u),
    }, deps)
    expect(out.filename).toBe('a-captioned.mp4')
    expect(deps.waitForCaptionFonts).toHaveBeenCalled()
    expect(deps.exportCaptionVideo.mock.calls[0][3].hasAudio).toBe(false)
    expect(updates[0]).toEqual({ percent: null, stage: 'Getting ready' })
  })

  it('still exports when audio detection fails', async () => {
    const deps = makeDeps({ getMediaInfo: vi.fn(async () => { throw new Error('no') }) })
    await renderCaptionedVideo(file, captions, {}, {}, deps)
    expect(deps.exportCaptionVideo.mock.calls[0][3].hasAudio).toBe('unknown')
  })

  it('refuses a video with no captions', async () => {
    await expect(renderCaptionedVideo(file, [], {}, {}, makeDeps())).rejects.toThrow('no captions')
  })

  it('lets export errors through unchanged', async () => {
    const deps = makeDeps({ exportCaptionVideo: vi.fn(async () => { throw new Error('Encoder failed') }) })
    await expect(renderCaptionedVideo(file, captions, {}, {}, deps)).rejects.toThrow('Encoder failed')
  })
})
