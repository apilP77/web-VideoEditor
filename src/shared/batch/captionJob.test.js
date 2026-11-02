import { describe, expect, it, vi } from 'vitest'
import { createCaptionsForFile, describeCaptionProgress } from './captionJob.js'

const file = new File(['x'], 'a.mp4', { type: 'video/mp4' })

function makeDeps(overrides = {}) {
  return {
    decodeAudio: vi.fn(async () => new Float32Array(4)),
    prepareWhisperModel: vi.fn(async () => ({ backend: 'wasm' })),
    transcribe: vi.fn(async () => ({
      words: [{ word: 'hi', start: 0, end: 0.5 }],
      language: 'english',
      backend: 'wasm',
    })),
    layoutCaptions: vi.fn((words) => [{ words, start: 0, end: 0.5 }]),
    ...overrides,
  }
}

describe('describeCaptionProgress', () => {
  it('maps each stage onto one 0-100 scale', () => {
    expect(describeCaptionProgress({ stage: 'loading-model', percent: 100 }).percent).toBe(25)
    expect(describeCaptionProgress({ stage: 'transcribing', percent: 50 }).percent).toBe(68)
    expect(describeCaptionProgress({ stage: 'finishing', percent: null }).percent).toBe(95)
  })

  it('ignores unknown stages', () => {
    expect(describeCaptionProgress({ stage: 'nope' })).toEqual({ percent: null, stage: '' })
    expect(describeCaptionProgress(undefined)).toEqual({ percent: null, stage: '' })
  })
})

describe('createCaptionsForFile', () => {
  it('returns words, captions and language, and passes auto as undefined', async () => {
    const deps = makeDeps()
    const result = await createCaptionsForFile(file, { model: 'fast', language: 'auto', pace: 3 }, deps)
    expect(result.captions).toHaveLength(1)
    expect(result.language).toBe('english')
    expect(deps.transcribe.mock.calls[0][1].language).toBeUndefined()
    expect(deps.layoutCaptions).toHaveBeenCalledWith(result.words, 3)
  })

  it('reports progress with stage labels', async () => {
    const updates = []
    await createCaptionsForFile(
      file,
      { model: 'fast', language: 'english', pace: 3, onProgress: (u) => updates.push(u) },
      makeDeps(),
    )
    expect(updates[0].stage).toBe('Preparing the speech model')
    expect(updates.at(-1)).toEqual({ percent: 95, stage: 'Arranging captions' })
  })

  it('fails clearly when there is no speech', async () => {
    const deps = makeDeps({ layoutCaptions: vi.fn(() => []) })
    await expect(
      createCaptionsForFile(file, { model: 'fast', language: 'auto', pace: 3 }, deps),
    ).rejects.toThrow('No speech was found')
  })

  it('stops when cancelled while the model loads', async () => {
    const controller = new AbortController()
    const deps = makeDeps({
      prepareWhisperModel: vi.fn(async () => {
        controller.abort()
        return { backend: 'wasm' }
      }),
    })
    await expect(
      createCaptionsForFile(file, { model: 'fast', language: 'auto', pace: 3, signal: controller.signal }, deps),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(deps.transcribe).not.toHaveBeenCalled()
  })
})
