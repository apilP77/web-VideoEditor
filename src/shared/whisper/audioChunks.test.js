import { describe, expect, it } from 'vitest'
import {
  buildAudioChunks,
  copyAudioChunk,
  findSpeechRegions,
} from './audioChunks.js'

describe('findSpeechRegions', () => {
  it('keeps quiet audio around speech and skips long silent gaps', () => {
    const audio = new Float32Array(16_000 * 4)
    audio.fill(0.1, 16_000, 32_000)

    expect(findSpeechRegions(audio)).toEqual([
      { start: 9_600, end: 38_400 },
    ])
  })

  it('keeps the full input when no speech-like audio is detected', () => {
    const audio = new Float32Array(16_000)
    expect(findSpeechRegions(audio)).toEqual([{ start: 0, end: 16_000 }])
  })
})

describe('buildAudioChunks', () => {
  it('uses 30-second chunks with one-second overlap in source time order', () => {
    expect(
      buildAudioChunks([{ start: 0, end: 60 * 16_000 }]).map(
        ({ start, end }) => [start, end],
      ),
    ).toEqual([
      [0, 30],
      [29, 59],
      [58, 60],
    ])
  })

  it('copies chunk sample ranges into independent Float32Arrays', () => {
    const audio = new Float32Array([0, 0.25, 0.5, 0.75])
    const chunk = copyAudioChunk(audio, 1, 3)

    expect(chunk).toBeInstanceOf(Float32Array)
    expect(Array.from(chunk)).toEqual([0.25, 0.5])
    expect(chunk.buffer).not.toBe(audio.buffer)
  })
})
